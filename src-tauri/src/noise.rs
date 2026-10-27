//! Noise filter for listening. The microphone is captured here, cleaned with RNNoise (the
//! open-source noise remover, as the pure-Rust `nnnoiseless`), and handed to the speech helper as
//! 16 kHz mono 16-bit PCM. Nothing leaves the computer.
//!
//! "Light" keeps some of the room in (a blend), so quiet words are never swallowed; "Strong"
//! sends only the cleaned voice. A mic check runs the same chain and reports levels before and
//! after, so a church can hear (see) what the filter does in its own room.

use nnnoiseless::DenoiseState;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, mpsc};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

const MODEL_RATE: f64 = 48_000.0;
const FRAME: usize = DenoiseState::FRAME_SIZE;
/// The helpers listen at 16 kHz: every third 48 kHz sample, after averaging.
const DECIMATE: usize = 3;

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Filter {
    Off,
    Light,
    Strong,
}

impl Filter {
    pub fn parse(value: &str) -> Filter {
        match value {
            "light" => Filter::Light,
            "strong" => Filter::Strong,
            _ => Filter::Off,
        }
    }

    /// How much of the cleaned signal is used (the rest is the room as heard).
    pub fn mix(self) -> f32 {
        match self {
            Filter::Off => 0.0,
            Filter::Light => 0.6,
            Filter::Strong => 1.0,
        }
    }

    /**
     * How much of the cleaned signal a speech recognizer hears. Never all of it: noise filters strip
     * the detail recognizers lean on (Whisper learned from noisy audio and copes with a room), and
     * a fully cleaned sermon in a live room came out as "give me" for "Luke". At least half is the
     * voice as the microphone heard it.
     */
    pub fn for_recognizer(self) -> f32 {
        match self {
            Filter::Off => 0.0,
            Filter::Light => 0.3,
            Filter::Strong => 0.5,
        }
    }
}

/// Linear resampler, any rate to any rate, carried across buffers.
struct Resampler {
    step: f64,
    pos: f64,
    pending: Vec<f32>,
}

impl Resampler {
    fn new(from: f64, to: f64) -> Self {
        Resampler { step: from / to, pos: 0.0, pending: Vec::new() }
    }

    fn push(&mut self, input: &[f32], out: &mut Vec<f32>) {
        self.pending.extend_from_slice(input);
        while self.pos + 1.0 < self.pending.len() as f64 {
            let index = self.pos.floor() as usize;
            let frac = (self.pos - index as f64) as f32;
            let a = self.pending[index];
            let b = self.pending[index + 1];
            out.push(a + (b - a) * frac);
            self.pos += self.step;
        }
        let used = (self.pos.floor() as usize).min(self.pending.len());
        self.pending.drain(..used);
        self.pos -= used as f64;
    }
}

/// The chain from microphone samples (mono, any rate) to cleaned 16 kHz PCM.
pub struct Cleaner {
    mix: f32,
    up: Resampler,
    denoise: Box<DenoiseState<'static>>,
    frame_in: Vec<f32>,
    /// RNNoise answers one frame late; the dry signal waits a frame too, so a blend lines up.
    dry_prev: Vec<f32>,
    frame_out: Vec<f32>,
    decimate: Vec<f32>,
    scratch: Vec<f32>,
}

impl Cleaner {
    pub fn new(input_rate: f64, mix: f32) -> Self {
        Cleaner {
            mix: mix.clamp(0.0, 1.0),
            up: Resampler::new(input_rate, MODEL_RATE),
            denoise: DenoiseState::new(),
            frame_in: Vec::with_capacity(FRAME),
            dry_prev: vec![0.0; FRAME],
            frame_out: vec![0.0; FRAME],
            decimate: Vec::with_capacity(DECIMATE),
            scratch: Vec::new(),
        }
    }

    /// Clean a buffer of mono samples (-1..1). Appends 16 kHz samples (-1..1) to `out`.
    pub fn push(&mut self, mono: &[f32], out: &mut Vec<f32>) {
        self.scratch.clear();
        self.up.push(mono, &mut self.scratch);
        for index in 0..self.scratch.len() {
            self.frame_in.push(self.scratch[index] * 32_768.0);
            if self.frame_in.len() < FRAME {
                continue;
            }
            self.denoise.process_frame(&mut self.frame_out, &self.frame_in);
            for (n, cleaned) in self.frame_out.iter().enumerate() {
                let sample = (cleaned * self.mix + self.dry_prev[n] * (1.0 - self.mix)) / 32_768.0;
                self.decimate.push(sample);
                if self.decimate.len() == DECIMATE {
                    out.push((self.decimate.iter().sum::<f32>() / DECIMATE as f32).clamp(-1.0, 1.0));
                    self.decimate.clear();
                }
            }
            std::mem::swap(&mut self.dry_prev, &mut self.frame_in);
            self.frame_in.clear();
        }
    }
}

/// A running capture: stop it to close the microphone and end the feed.
pub struct Feed {
    stop: Arc<AtomicBool>,
    thread: Option<JoinHandle<()>>,
}

impl Feed {
    pub fn stop(mut self) {
        self.halt();
    }

    fn halt(&mut self) {
        self.stop.store(true, Ordering::SeqCst);
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}

impl Drop for Feed {
    fn drop(&mut self) {
        self.halt();
    }
}

/// Open the default microphone and run the chain on its own thread. `sink` gets each cleaned
/// 16 kHz chunk as little-endian 16-bit PCM and returns false to stop (the helper closed);
/// `levels` gets (room, cleaned) loudness about twelve times a second.
/// `lost` is told once if the microphone goes away mid-run (unplugged, or Windows took it).
pub fn start(
    mix: f32,
    mut sink: impl FnMut(&[u8]) -> bool + Send + 'static,
    mut levels: impl FnMut(f32, f32) + Send + 'static,
    lost: impl FnOnce(String) + Send + 'static,
) -> Result<Feed, String> {
    let stop = Arc::new(AtomicBool::new(false));
    let flag = stop.clone();
    let (ready_tx, ready_rx) = mpsc::channel::<Result<(), String>>();
    let thread = std::thread::spawn(move || {
        let (tx, rx) = mpsc::channel::<Vec<f32>>();
        let failed: Arc<Mutex<Option<String>>> = Arc::new(Mutex::new(None));
        let (stream, rate) = match open_microphone(tx, failed.clone()) {
            Ok(opened) => opened,
            Err(message) => {
                let _ = ready_tx.send(Err(message));
                return;
            }
        };
        let _ = ready_tx.send(Ok(()));
        let mut cleaner = Cleaner::new(rate, mix);
        let mut cleaned = Vec::new();
        let mut bytes = Vec::new();
        let (mut room_sq, mut room_n, mut clean_sq, mut clean_n) = (0.0f32, 0usize, 0.0f32, 0usize);
        let mut last_level = Instant::now();
        // A working microphone sends something (silence too) many times a second: nothing for a
        // few seconds, or an error from the device, means it has gone.
        let mut last_audio = Instant::now();
        let mut lost = Some(lost);
        while !flag.load(Ordering::SeqCst) {
            let reason = failed.lock().unwrap_or_else(|poison| poison.into_inner()).take().or_else(|| {
                (last_audio.elapsed() > Duration::from_secs(5)).then(|| "The microphone stopped sending sound (unplugged, or taken by another app).".to_string())
            });
            if let Some(reason) = reason {
                log::warn!("microphone lost: {reason}");
                if let Some(tell) = lost.take() {
                    tell(reason);
                }
                break;
            }
            let chunk = match rx.recv_timeout(Duration::from_millis(100)) {
                Ok(chunk) => chunk,
                Err(mpsc::RecvTimeoutError::Timeout) => continue,
                Err(mpsc::RecvTimeoutError::Disconnected) => {
                    *failed.lock().unwrap_or_else(|poison| poison.into_inner()) = Some("The microphone stopped.".into());
                    continue;
                }
            };
            last_audio = Instant::now();
            cleaned.clear();
            cleaner.push(&chunk, &mut cleaned);
            room_sq += chunk.iter().map(|s| s * s).sum::<f32>();
            room_n += chunk.len();
            clean_sq += cleaned.iter().map(|s| s * s).sum::<f32>();
            clean_n += cleaned.len();
            if last_level.elapsed() >= Duration::from_millis(80) {
                let room = if room_n > 0 { (room_sq / room_n as f32).sqrt() } else { 0.0 };
                let clean = if clean_n > 0 { (clean_sq / clean_n as f32).sqrt() } else { 0.0 };
                levels(room, clean);
                (room_sq, room_n, clean_sq, clean_n) = (0.0, 0, 0.0, 0);
                last_level = Instant::now();
            }
            if cleaned.is_empty() {
                continue;
            }
            bytes.clear();
            for sample in &cleaned {
                bytes.extend_from_slice(&((sample * 32_767.0) as i16).to_le_bytes());
            }
            if !sink(&bytes) {
                break;
            }
        }
        drop(stream);
    });
    match ready_rx.recv_timeout(Duration::from_secs(8)) {
        Ok(Ok(())) => Ok(Feed { stop, thread: Some(thread) }),
        Ok(Err(message)) => {
            let _ = thread.join();
            Err(message)
        }
        Err(_) => {
            stop.store(true, Ordering::SeqCst);
            Err("The microphone did not start within 8 seconds.".into())
        }
    }
}

/// The default input as mono (-1..1), sent as it arrives. An error from the device is kept in
/// `failed` for the reading loop to report.
/// The microphone the church chose in Settings › Audio & voice (by its name), or None for the
/// computer's default. A PC with a phone-as-webcam app (Iriun, DroidCam, Camo), OBS or a virtual
/// mixer has silent extra microphones, and Windows often makes the newest one the default.
static CHOSEN: Mutex<Option<String>> = Mutex::new(None);

pub fn choose_input(name: Option<String>) {
    *CHOSEN.lock().unwrap_or_else(|poison| poison.into_inner()) = name.filter(|name| !name.trim().is_empty());
}

pub fn chosen_input() -> Option<String> {
    CHOSEN.lock().unwrap_or_else(|poison| poison.into_inner()).clone()
}

/// The chosen microphone when it is plugged in, else the computer's default.
fn input_device(host: &cpal::Host) -> Result<cpal::Device, String> {
    use cpal::traits::{DeviceTrait, HostTrait};
    if let Some(wanted) = chosen_input() {
        let found = host.input_devices().ok().and_then(|mut devices| devices.find(|device| device.name().is_ok_and(|name| name == wanted)));
        match found {
            Some(device) => return Ok(device),
            None => log::warn!("microphone {wanted:?} is not plugged in; using the default"),
        }
    }
    host.default_input_device().ok_or_else(|| "No microphone is available.".to_string())
}

#[derive(Clone, serde::Serialize)]
pub struct InputDevice {
    pub name: String,
    /// The computer's default recording device.
    pub default: bool,
}

/// Every microphone (recording device) this computer has, for the picker.
pub fn input_devices() -> Vec<InputDevice> {
    use cpal::traits::{DeviceTrait, HostTrait};
    let host = cpal::default_host();
    let default = host.default_input_device().and_then(|device| device.name().ok());
    let mut seen = std::collections::HashSet::new();
    host.input_devices()
        .map(|devices| {
            devices
                .filter_map(|device| device.name().ok())
                .filter(|name| seen.insert(name.clone()))
                .map(|name| InputDevice { default: default.as_deref() == Some(name.as_str()), name })
                .collect()
        })
        .unwrap_or_default()
}

#[derive(Clone, serde::Serialize)]
pub struct InputHeard {
    pub name: String,
    /// The loudest moment, 0 to 1 (speech near a working microphone reaches 0.05 or more).
    pub peak: f32,
    /// It sent anything but exact digital silence. A real microphone always hears a little hiss;
    /// a virtual one with nothing behind it (a phone-as-webcam app with no phone) or a muted one
    /// sends zeros. So this tells a dead microphone from a quiet room without anyone speaking.
    pub live: bool,
    /// It could not be opened (in use elsewhere, or unplugged as it was listed).
    pub error: Option<String>,
}

/// Every microphone at once for `ms` (or only the one named `only`): how loud each heard the room,
/// and whether it sent any sound at all. Silent virtual microphones read 0 and not live.
pub fn probe_inputs(ms: u64, only: Option<&str>) -> Vec<InputHeard> {
    use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
    let host = cpal::default_host();
    let Ok(devices) = host.input_devices() else { return Vec::new() };
    let mut seen = std::collections::HashSet::new();
    /// One microphone being listened to: its loudest moment so far, and its stream (or why it would not open).
    struct Probe {
        name: String,
        peak: Arc<Mutex<f32>>,
        live: Arc<AtomicBool>,
        opened: Result<cpal::Stream, String>,
    }
    let mut open: Vec<Probe> = Vec::new();
    for device in devices {
        let Ok(name) = device.name() else { continue };
        if !seen.insert(name.clone()) || only.is_some_and(|wanted| wanted != name) {
            continue;
        }
        let peak = Arc::new(Mutex::new(0.0f32));
        let live = Arc::new(AtomicBool::new(false));
        let opened = (|| -> Result<cpal::Stream, String> {
            let config = device.default_input_config().map_err(|error| error.to_string())?;
            let format = config.sample_format();
            let stream_config: cpal::StreamConfig = config.into();
            // The loudest 10 ms stretch, as an RMS level: a click does not count as a voice.
            fn note<T: Copy>(data: &[T], peak: &Mutex<f32>, live: &AtomicBool, to_f32: impl Fn(T) -> f32) {
                if !live.load(Ordering::Relaxed) && data.iter().any(|s| to_f32(*s) != 0.0) {
                    live.store(true, Ordering::Relaxed);
                }
                for chunk in data.chunks(480) {
                    let rms = (chunk.iter().map(|s| to_f32(*s).powi(2)).sum::<f32>() / chunk.len().max(1) as f32).sqrt();
                    let mut best = peak.lock().unwrap_or_else(|poison| poison.into_inner());
                    if rms > *best {
                        *best = rms;
                    }
                }
            }
            let err = |error: cpal::StreamError| log::warn!("microphone probe: {error}");
            let stream = match format {
                cpal::SampleFormat::F32 => { let (p, l) = (peak.clone(), live.clone()); device.build_input_stream(&stream_config, move |data: &[f32], _: &_| note(data, &p, &l, |s| s), err, None) }
                cpal::SampleFormat::I16 => { let (p, l) = (peak.clone(), live.clone()); device.build_input_stream(&stream_config, move |data: &[i16], _: &_| note(data, &p, &l, |s| f32::from(s) / 32_768.0), err, None) }
                cpal::SampleFormat::U16 => { let (p, l) = (peak.clone(), live.clone()); device.build_input_stream(&stream_config, move |data: &[u16], _: &_| note(data, &p, &l, |s| (f32::from(s) - 32_768.0) / 32_768.0), err, None) }
                other => return Err(format!("{other} samples")),
            }
            .map_err(|error| error.to_string())?;
            stream.play().map_err(|error| error.to_string())?;
            Ok(stream)
        })();
        open.push(Probe { name, peak, live, opened });
    }
    std::thread::sleep(Duration::from_millis(ms.clamp(500, 10_000)));
    open.into_iter()
        .map(|probe| {
            let error = probe.opened.err();
            let peak = *probe.peak.lock().unwrap_or_else(|poison| poison.into_inner());
            InputHeard { name: probe.name, peak, live: probe.live.load(Ordering::Relaxed), error }
        })
        .collect()
}

fn open_microphone(tx: mpsc::Sender<Vec<f32>>, failed: Arc<Mutex<Option<String>>>) -> Result<(cpal::Stream, f64), String> {
    use cpal::traits::{DeviceTrait, StreamTrait};
    let host = cpal::default_host();
    let device = input_device(&host)?;
    let config = device.default_input_config().map_err(|error| format!("The microphone could not be read. {error}"))?;
    let channels = usize::from(config.channels().max(1));
    let rate = f64::from(config.sample_rate().0);
    let format = config.sample_format();
    let stream_config: cpal::StreamConfig = config.into();
    let on_error = move |error: cpal::StreamError| {
        log::warn!("microphone stream: {error}");
        // The device is gone (unplugged, or Windows switched it off): listening stops and says so.
        if matches!(error, cpal::StreamError::DeviceNotAvailable) {
            *failed.lock().unwrap_or_else(|poison| poison.into_inner()) = Some("The microphone was disconnected.".into());
        }
    };
    /// One channel's worth: the loudest channel in this buffer, not an average of all of them. A
    /// church mixer's USB feed has 18 or 32 channels with the pastor on one; averaging them made
    /// speech 25–30 dB too quiet to hear. A mono or stereo microphone sounds the same either way.
    fn mono<T: Copy>(data: &[T], channels: usize, to_f32: impl Fn(T) -> f32) -> Vec<f32> {
        if channels <= 1 {
            return data.iter().map(|s| to_f32(*s)).collect();
        }
        let frames = data.len() / channels;
        let loudest = (0..channels)
            .map(|channel| (channel, (0..frames).map(|frame| to_f32(data[frame * channels + channel]).powi(2)).sum::<f32>()))
            .fold((0, -1.0f32), |best, next| if next.1 > best.1 { next } else { best })
            .0;
        (0..frames).map(|frame| to_f32(data[frame * channels + loudest])).collect()
    }
    let stream = match format {
        cpal::SampleFormat::F32 => device.build_input_stream(
            &stream_config,
            move |data: &[f32], _: &_| {
                let _ = tx.send(mono(data, channels, |s| s));
            },
            on_error,
            None,
        ),
        cpal::SampleFormat::I16 => device.build_input_stream(
            &stream_config,
            move |data: &[i16], _: &_| {
                let _ = tx.send(mono(data, channels, |s| f32::from(s) / 32_768.0));
            },
            on_error,
            None,
        ),
        cpal::SampleFormat::U16 => device.build_input_stream(
            &stream_config,
            move |data: &[u16], _: &_| {
                let _ = tx.send(mono(data, channels, |s| (f32::from(s) - 32_768.0) / 32_768.0));
            },
            on_error,
            None,
        ),
        other => return Err(format!("This microphone sends {other} samples, which Church Studio cannot read yet.")),
    }
    .map_err(|error| format!("The microphone could not start. {error}"))?;
    stream.play().map_err(|error| format!("The microphone could not start. {error}"))?;
    Ok((stream, rate))
}

/// The mic check in Settings: the same chain, reporting room and cleaned levels as events.
static TEST: Mutex<Option<Feed>> = Mutex::new(None);

#[derive(Clone, serde::Serialize)]
pub struct TestLevel {
    pub room: f32,
    pub clean: f32,
}

pub fn start_test(app: tauri::AppHandle, filter: Filter) -> Result<(), String> {
    stop_test();
    use tauri::Emitter;
    // Off still runs the chain at zero mix, so both meters move and match.
    let feed = start(
        filter.mix(),
        |_| true,
        move |room, clean| {
            let _ = app.emit("noise-test", TestLevel { room, clean });
        },
        |reason| log::warn!("mic check: {reason}"),
    )?;
    *TEST.lock().unwrap_or_else(|poison| poison.into_inner()) = Some(feed);
    Ok(())
}

pub fn stop_test() {
    let feed = TEST.lock().unwrap_or_else(|poison| poison.into_inner()).take();
    if let Some(feed) = feed {
        feed.stop();
    }
}

#[cfg(test)]
mod tests {

    #[test]
    fn a_recognizer_always_hears_at_least_half_the_real_voice() {
        assert_eq!(Filter::Off.for_recognizer(), 0.0);
        assert!(Filter::Light.for_recognizer() > 0.0 && Filter::Light.for_recognizer() < Filter::Light.mix());
        assert!(Filter::Strong.for_recognizer() <= 0.5);
    }

    use super::*;

    fn rms(samples: &[f32]) -> f32 {
        (samples.iter().map(|s| s * s).sum::<f32>() / samples.len().max(1) as f32).sqrt()
    }

    fn noise(len: usize, seed: &mut u32, amplitude: f32) -> Vec<f32> {
        (0..len)
            .map(|_| {
                *seed ^= *seed << 13;
                *seed ^= *seed >> 17;
                *seed ^= *seed << 5;
                (*seed as f32 / u32::MAX as f32 * 2.0 - 1.0) * amplitude
            })
            .collect()
    }

    #[test]
    fn resampler_keeps_time() {
        let mut up = Resampler::new(44_100.0, 48_000.0);
        let mut out = Vec::new();
        for _ in 0..10 {
            up.push(&vec![0.5; 4_410], &mut out);
        }
        // One second in, about one second out (a sample of lag at most).
        assert!((out.len() as i64 - 48_000).abs() <= 2, "{}", out.len());
        assert!(out.iter().all(|s| (s - 0.5).abs() < 1e-6));
    }

    #[test]
    fn output_is_16k_for_any_input_rate() {
        for rate in [16_000.0, 44_100.0, 48_000.0] {
            let mut cleaner = Cleaner::new(rate, 1.0);
            let mut out = Vec::new();
            cleaner.push(&vec![0.0; rate as usize], &mut out);
            assert!((out.len() as i64 - 16_000).abs() <= 170, "rate {rate}: {}", out.len());
        }
    }

    #[test]
    fn strong_removes_steady_hiss_and_off_leaves_it() {
        let mut seed = 7;
        let hiss = noise(48_000 * 3, &mut seed, 0.05);
        let mut strong = Cleaner::new(48_000.0, Filter::Strong.mix());
        let mut off = Cleaner::new(48_000.0, Filter::Off.mix());
        let (mut cleaned, mut kept) = (Vec::new(), Vec::new());
        strong.push(&hiss, &mut cleaned);
        off.push(&hiss, &mut kept);
        // Judge the last second, after the filter has learned the room.
        let tail = |v: &Vec<f32>| rms(&v[v.len() - 16_000..]);
        // At least 6 dB quieter (about 8.5 dB on this synthetic hiss; real room noise varies).
        assert!(tail(&cleaned) < tail(&kept) * 0.5, "strong {} vs off {}", tail(&cleaned), tail(&kept));
        assert!(tail(&kept) > 0.01);
    }

    /// Manual check: NOISE_IN (48 kHz mono f32 LE) → NOISE_OUT (16 kHz i16 LE), Strong.
    /// `cargo test clean_file -- --ignored` with both set.
    #[test]
    #[ignore]
    fn clean_file() {
        let (Ok(input), Ok(output)) = (std::env::var("NOISE_IN"), std::env::var("NOISE_OUT")) else { return };
        let bytes = std::fs::read(input).unwrap();
        let samples: Vec<f32> = bytes.as_chunks::<4>().0.iter().map(|b| f32::from_le_bytes([b[0], b[1], b[2], b[3]])).collect();
        let mut cleaner = Cleaner::new(48_000.0, Filter::Strong.mix());
        let mut out = Vec::new();
        for chunk in samples.chunks(1_024) {
            cleaner.push(chunk, &mut out);
        }
        let pcm: Vec<u8> = out.iter().flat_map(|s| ((s * 32_767.0) as i16).to_le_bytes()).collect();
        std::fs::write(output, pcm).unwrap();
    }

    /// Manual check on a real machine: opens the default microphone for two seconds.
    /// `cargo test live_microphone -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn live_microphone() {
        let bytes = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let counted = bytes.clone();
        let levels = Arc::new(Mutex::new(Vec::new()));
        let seen = levels.clone();
        let feed = start(
            1.0,
            move |chunk| {
                counted.fetch_add(chunk.len(), Ordering::SeqCst);
                true
            },
            move |room, clean| seen.lock().unwrap().push((room, clean)),
            |reason| panic!("microphone lost: {reason}"),
        )
        .expect("microphone opens");
        std::thread::sleep(Duration::from_secs(2));
        feed.stop();
        let total = bytes.load(Ordering::SeqCst);
        println!("16 kHz bytes in 2 s: {total}; level reports: {}", levels.lock().unwrap().len());
        assert!(total > 40_000, "about 64 000 bytes expected, got {total}");
    }

    #[test]
    #[ignore]
    fn probe_every_microphone() {
        // A real microphone is never exactly silent; a virtual one with nothing behind it is.
        // cargo test probe_every_microphone -- --ignored --nocapture
        for heard in super::probe_inputs(1500, None) {
            println!("{:<50} live={:<5} peak={:.5} error={:?}", heard.name, heard.live, heard.peak, heard.error);
        }
    }

    #[test]
    fn filter_names() {
        assert_eq!(Filter::parse("light"), Filter::Light);
        assert_eq!(Filter::parse("strong"), Filter::Strong);
        assert_eq!(Filter::parse("anything"), Filter::Off);
        assert!(Filter::Light.mix() > 0.0 && Filter::Light.mix() < 1.0);
    }
}
