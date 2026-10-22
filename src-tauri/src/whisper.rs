//! Accurate listening: Whisper (whisper.cpp) on this computer, instead of the system recognizer.
//! It hears accents (Ghanaian, Nigerian and others) better, and is told the 66 book names and the
//! church's own words before it listens. Nothing leaves the computer.
//!
//! The model (60 MB) is downloaded once, only when the church turns this on, from a pinned
//! version on Hugging Face, and checked against its SHA-256 before use. Listening reuses the
//! microphone capture of the noise filter (16 kHz mono), decodes the last few seconds about once a
//! second, and sends the same `listen-phrase` lines as the system helpers: a partial phrase while
//! someone speaks, a final one at each pause.

use serde::Serialize;
use sha2::{Digest, Sha256};
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{Emitter, Manager};

/// Whisper base (English), 5-bit: quick enough to follow speech on an ordinary laptop.
const MODEL_FILE: &str = "ggml-base.en-q5_1.bin";
const MODEL_URL: &str = "https://huggingface.co/ggerganov/whisper.cpp/resolve/5359861c739e955e79d9a303bcbc70fb988958b1/ggml-base.en-q5_1.bin";
const MODEL_SHA256: &str = "4baf70dd0d7c4247ba2b81fafd9c01005ac77c2f9ef064e00dcf195d0e2fdd2f";
pub const MODEL_BYTES: u64 = 59_721_011;

const RATE: usize = 16_000;
/// Decode about this often while someone speaks.
const STEP: Duration = Duration::from_millis(800);
/// The longest stretch decoded at once; a longer one is sent as final and started again.
const LONGEST: usize = RATE * 12;
/// Quiet this long ends a phrase.
const PAUSE: usize = RATE * 7 / 10;
/// Loudness (RMS, 0..1) below which audio counts as quiet.
const QUIET: f32 = 0.006;
/// Loudness is judged in frames this long (20 ms).
const FRAME: usize = RATE / 50;
/// Speech must stand this many times above the room's own hum (fans, air conditioning).
const OVER_ROOM: f32 = 3.0;
/// At least this much speech (0.3 s) before Whisper is asked: given only room noise it makes words up.
const MIN_SPEECH: usize = 15;

const BOOKS: &str = "Genesis, Exodus, Leviticus, Numbers, Deuteronomy, Joshua, Judges, Ruth, 1 Samuel, 2 Samuel, 1 Kings, 2 Kings, 1 Chronicles, 2 Chronicles, Ezra, Nehemiah, Esther, Job, Psalms, Proverbs, Ecclesiastes, Song of Solomon, Isaiah, Jeremiah, Lamentations, Ezekiel, Daniel, Hosea, Joel, Amos, Obadiah, Jonah, Micah, Nahum, Habakkuk, Zephaniah, Haggai, Zechariah, Malachi, Matthew, Mark, Luke, John, Acts, Romans, 1 Corinthians, 2 Corinthians, Galatians, Ephesians, Philippians, Colossians, 1 Thessalonians, 2 Thessalonians, 1 Timothy, 2 Timothy, Titus, Philemon, Hebrews, James, 1 Peter, 2 Peter, 1 John, 2 John, 3 John, Jude, Revelation";

#[derive(Clone, Serialize)]
pub struct ModelStatus {
    pub installed: bool,
    pub downloading: bool,
    pub bytes: u64,
}

#[derive(Clone, Serialize)]
struct Progress {
    received: u64,
    total: u64,
    done: bool,
    error: Option<String>,
}

static DOWNLOADING: AtomicBool = AtomicBool::new(false);
/// The current download's number. Cancel moves it on, so a download stuck on a dead connection is
/// left behind at once (it stops, and removes its own part file, when its read ends) and a new
/// one can start beside it.
static RUN: AtomicU64 = AtomicU64::new(0);

fn model_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|error| error.to_string())?.join("models");
    Ok(dir.join(MODEL_FILE))
}

pub fn status(app: &tauri::AppHandle) -> ModelStatus {
    let installed = model_path(app).ok().and_then(|path| std::fs::metadata(path).ok()).is_some_and(|meta| meta.len() == MODEL_BYTES);
    ModelStatus { installed, downloading: DOWNLOADING.load(Ordering::SeqCst), bytes: MODEL_BYTES }
}

pub fn delete(app: &tauri::AppHandle) -> Result<(), String> {
    stop();
    *CONTEXT.lock().unwrap_or_else(|poison| poison.into_inner()) = None;
    let path = model_path(app)?;
    if path.exists() {
        std::fs::remove_file(path).map_err(|error| format!("Could not remove the model. {error}"))?;
    }
    Ok(())
}

pub fn cancel_download(app: &tauri::AppHandle) {
    RUN.fetch_add(1, Ordering::SeqCst);
    if DOWNLOADING.swap(false, Ordering::SeqCst) {
        let _ = app.emit("whisper-download", Progress { received: 0, total: MODEL_BYTES, done: true, error: Some("Download cancelled.".into()) });
    }
}

/// Download the model on its own thread; `whisper-download` events report progress and the end.
pub fn download(app: tauri::AppHandle) -> Result<(), String> {
    if DOWNLOADING.swap(true, Ordering::SeqCst) {
        return Ok(());
    }
    let run = RUN.fetch_add(1, Ordering::SeqCst) + 1;
    let path = model_path(&app)?;
    std::thread::spawn(move || {
        let result = fetch(&app, &path, run);
        // Cancelled: cancel_download has already said so.
        if RUN.load(Ordering::SeqCst) != run {
            return;
        }
        DOWNLOADING.store(false, Ordering::SeqCst);
        let error = result.err();
        let _ = app.emit("whisper-download", Progress { received: if error.is_none() { MODEL_BYTES } else { 0 }, total: MODEL_BYTES, done: true, error });
    });
    Ok(())
}

fn fetch(app: &tauri::AppHandle, path: &PathBuf, run: u64) -> Result<(), String> {
    let dir = path.parent().ok_or("No folder for the model.")?;
    std::fs::create_dir_all(dir).map_err(|error| format!("Could not make the models folder. {error}"))?;
    let part = path.with_extension(format!("part{run}"));
    // A dead connection fails instead of waiting for ever; the whole 60 MB may take 20 minutes.
    let agent: ureq::Agent = ureq::Agent::config_builder()
        .timeout_connect(Some(Duration::from_secs(15)))
        .timeout_recv_response(Some(Duration::from_secs(30)))
        .timeout_recv_body(Some(Duration::from_secs(20 * 60)))
        .build()
        .into();
    let response = agent.get(MODEL_URL).call().map_err(|error| format!("The download could not start. Check the internet connection. ({error})"))?;
    let mut body = response.into_body().into_reader();
    let mut file = std::fs::File::create(&part).map_err(|error| format!("Could not save the model. {error}"))?;
    let mut hash = Sha256::new();
    let mut buffer = vec![0u8; 256 * 1024];
    let mut received = 0u64;
    let mut last = Instant::now();
    loop {
        if RUN.load(Ordering::SeqCst) != run {
            drop(file);
            let _ = std::fs::remove_file(&part);
            return Err("Download cancelled.".into());
        }
        let read = body.read(&mut buffer).map_err(|error| format!("The download stopped. Try again. ({error})"))?;
        if read == 0 {
            break;
        }
        hash.update(&buffer[..read]);
        file.write_all(&buffer[..read]).map_err(|error| format!("Could not save the model. Is the disk full? ({error})"))?;
        received += read as u64;
        if last.elapsed() >= Duration::from_millis(250) {
            let _ = app.emit("whisper-download", Progress { received, total: MODEL_BYTES, done: false, error: None });
            last = Instant::now();
        }
    }
    file.flush().map_err(|error| error.to_string())?;
    drop(file);
    let digest = hash.finalize().iter().map(|byte| format!("{byte:02x}")).collect::<String>();
    if digest != MODEL_SHA256 || received != MODEL_BYTES {
        let _ = std::fs::remove_file(&part);
        return Err("The downloaded model did not match the published one, so it was not used. Try again.".into());
    }
    if RUN.load(Ordering::SeqCst) != run {
        let _ = std::fs::remove_file(&part);
        return Err("Download cancelled.".into());
    }
    std::fs::rename(&part, path).map_err(|error| format!("Could not save the model. {error}"))?;
    Ok(())
}

// --- Listening ------------------------------------------------------------------------------------

/// The loaded model, kept between listens (loading takes a second or two).
static CONTEXT: Mutex<Option<Arc<whisper_rs::WhisperContext>>> = Mutex::new(None);

struct Running {
    stop: Arc<AtomicBool>,
    feed: Option<crate::noise::Feed>,
    worker: Option<std::thread::JoinHandle<()>>,
}

static RUNNING: Mutex<Option<Running>> = Mutex::new(None);

fn context(app: &tauri::AppHandle) -> Result<Arc<whisper_rs::WhisperContext>, String> {
    let mut guard = CONTEXT.lock().unwrap_or_else(|poison| poison.into_inner());
    if let Some(context) = guard.as_ref() {
        return Ok(context.clone());
    }
    if !status(app).installed {
        return Err("Accurate listening needs its model. Download it in Settings › Sound & voice.".into());
    }
    whisper_rs::install_logging_hooks();
    let mut params = whisper_rs::WhisperContextParameters::default();
    params.use_gpu(true);
    let context = whisper_rs::WhisperContext::new_with_params(model_path(app)?, params).map_err(|error| format!("The model could not be loaded. Download it again in Settings › Sound & voice. ({error})"))?;
    let context = Arc::new(context);
    *guard = Some(context.clone());
    Ok(context)
}

/// Start listening with Whisper. `mix` is the noise filter's share of cleaned signal (0 = off).
pub fn start(app: tauri::AppHandle, run: u64, mix: f32, words: &str) -> Result<(), String> {
    stop();
    *STOPPED_AT.lock().unwrap_or_else(|poison| poison.into_inner()) = None;
    let context = context(&app)?;
    let prompt = prompt_for(words);
    let audio: Arc<Mutex<Vec<f32>>> = Arc::new(Mutex::new(Vec::new()));
    let sink_audio = audio.clone();
    let levels_app = app.clone();
    let feed = crate::noise::start(
        mix,
        move |bytes| {
            let mut buffer = sink_audio.lock().unwrap_or_else(|poison| poison.into_inner());
            buffer.extend(bytes.as_chunks::<2>().0.iter().map(|pair| i16::from_le_bytes([pair[0], pair[1]]) as f32 / 32_768.0));
            true
        },
        move |_room, clean| {
            let line = format!(r#"{{"kind":"level","value":{:.3}}}"#, (clean * 4.0).min(1.0));
            let _ = levels_app.emit("listen-phrase", crate::voice::ListenLine { run, line });
        },
    )?;
    let stop = Arc::new(AtomicBool::new(false));
    let flag = stop.clone();
    let worker_app = app.clone();
    let worker = std::thread::spawn(move || listen(worker_app, run, context, audio, flag, prompt));
    emit(&app, run, serde_json::json!({ "kind": "status", "message": "Listening (accurate). Speak a reference or read a verse." }));
    *RUNNING.lock().unwrap_or_else(|poison| poison.into_inner()) = Some(Running { stop, feed: Some(feed), worker: Some(worker) });
    Ok(())
}

/// Listening stopped: the model leaves memory (about 150 MB) after a few quiet minutes, unless
/// listening starts again first. The next listen loads it again in a second or two.
static STOPPED_AT: Mutex<Option<Instant>> = Mutex::new(None);
const KEEP_LOADED: Duration = Duration::from_secs(180);

fn forget_model_later() {
    let at = Instant::now();
    *STOPPED_AT.lock().unwrap_or_else(|poison| poison.into_inner()) = Some(at);
    std::thread::spawn(move || {
        std::thread::sleep(KEEP_LOADED);
        let stopped = *STOPPED_AT.lock().unwrap_or_else(|poison| poison.into_inner());
        let listening = RUNNING.lock().unwrap_or_else(|poison| poison.into_inner()).is_some();
        if stopped == Some(at) && !listening {
            *CONTEXT.lock().unwrap_or_else(|poison| poison.into_inner()) = None;
        }
    });
}

pub fn stop() {
    let running = RUNNING.lock().unwrap_or_else(|poison| poison.into_inner()).take();
    let Some(mut running) = running else { return };
    forget_model_later();
    running.stop.store(true, Ordering::SeqCst);
    if let Some(feed) = running.feed.take() {
        feed.stop();
    }
    if let Some(worker) = running.worker.take() {
        let _ = worker.join();
    }
}

fn emit(app: &tauri::AppHandle, run: u64, value: serde_json::Value) {
    let _ = app.emit("listen-phrase", crate::voice::ListenLine { run, line: value.to_string() });
}

fn loudness(samples: &[f32]) -> f32 {
    if samples.is_empty() {
        return 0.0;
    }
    (samples.iter().map(|sample| sample * sample).sum::<f32>() / samples.len() as f32).sqrt()
}

/// The loudness of each 20 ms frame.
fn frame_levels(samples: &[f32]) -> Vec<f32> {
    samples.chunks(FRAME).map(loudness).collect()
}

/// The loudness above which a frame is speech: well over the room's quietest moments, never below QUIET.
fn speech_level(levels: &[f32]) -> f32 {
    let mut sorted = levels.to_vec();
    sorted.sort_by(f32::total_cmp);
    let room = sorted.get(sorted.len() / 10).copied().unwrap_or(0.0);
    (room * OVER_ROOM).max(QUIET)
}

/// Someone spoke in `samples`, not just the room humming.
fn has_speech(samples: &[f32]) -> bool {
    let levels = frame_levels(samples);
    let level = speech_level(&levels);
    levels.iter().filter(|&&frame| frame > level).count() >= MIN_SPEECH
}

/// The last `PAUSE` of `samples` is quiet against the room's own hum: the phrase has ended.
fn speech_ended(samples: &[f32]) -> bool {
    let levels = frame_levels(samples);
    let level = speech_level(&levels);
    levels[levels.len().saturating_sub(PAUSE / FRAME)..].iter().all(|&frame| frame <= level)
}

/// Whisper given noise can read its own prompt back ("Bible reading. Genesis, Exodus, Leviticus…").
fn echoes_prompt(text: &str, prompt: &str) -> bool {
    let words = |line: &str| line.to_lowercase().split(|c: char| !c.is_alphanumeric()).filter(|word| !word.is_empty()).map(String::from).collect::<Vec<_>>();
    let (said, given) = (words(text), words(prompt));
    said.len() >= 5 && given.windows(said.len()).any(|run| run == said.as_slice())
}

/// What Whisper writes for silence, music or noise, never a phrase to show.
fn is_noise(text: &str) -> bool {
    let plain = text.trim().trim_matches(|c: char| !c.is_alphanumeric()).to_lowercase();
    plain.is_empty()
        || text.trim().starts_with('[')
        || text.trim().starts_with('(')
        || ["thank you", "thanks for watching", "you", "bye", "thank you for watching", "thank you so much for watching", "please subscribe", "see you next time"].contains(&plain.as_str())
}

/// The words in `samples` (16 kHz mono), or None when Whisper failed. Shared by listening and tests.
fn transcribe(state: &mut whisper_rs::WhisperState, samples: &[f32], prompt: &str, threads: i32) -> Option<String> {
    let mut params = whisper_rs::FullParams::new(whisper_rs::SamplingStrategy::Greedy { best_of: 1 });
    params.set_language(Some("en"));
    params.set_n_threads(threads);
    params.set_no_context(true);
    params.set_no_timestamps(true);
    params.set_suppress_blank(true);
    params.set_suppress_nst(true);
    params.set_temperature(0.0);
    params.set_print_progress(false);
    params.set_print_realtime(false);
    params.set_print_special(false);
    params.set_print_timestamps(false);
    params.set_initial_prompt(prompt);
    state.full(params, samples).ok()?;
    let mut text = String::new();
    for index in 0..state.full_n_segments() {
        if let Some(segment) = state.get_segment(index) {
            if segment.no_speech_probability() > 0.6 {
                continue;
            }
            if let Ok(piece) = segment.to_str_lossy() {
                text.push_str(&piece);
            }
        }
    }
    Some(text.trim().to_string())
}

fn prompt_for(words: &str) -> String {
    let extra = words.lines().map(str::trim).filter(|word| !word.is_empty()).collect::<Vec<_>>().join(", ");
    // The prompt shows the recognizer the words to expect and how references are written.
    format!("Bible reading. {BOOKS}. Chapter 3, verse 16. John 3:16.{}", if extra.is_empty() { String::new() } else { format!(" {extra}.") })
}

fn listen(app: tauri::AppHandle, run: u64, context: Arc<whisper_rs::WhisperContext>, audio: Arc<Mutex<Vec<f32>>>, stop: Arc<AtomicBool>, prompt: String) {
    let mut state = match context.create_state() {
        Ok(state) => state,
        Err(error) => {
            emit(&app, run, serde_json::json!({ "kind": "error", "message": format!("Accurate listening could not start. ({error})") }));
            emit(&app, run, serde_json::json!({ "kind": "end" }));
            return;
        }
    };
    let threads = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(4).clamp(2, 6) as i32;
    let mut last_text = String::new();
    let mut decoded_len = 0usize;
    while !stop.load(Ordering::SeqCst) {
        std::thread::sleep(STEP);
        let window: Vec<f32> = {
            let mut buffer = audio.lock().unwrap_or_else(|poison| poison.into_inner());
            // Long quiet (or only the room humming) before anything was said: drop it, keeping a
            // moment for the first word.
            if buffer.len() > RATE * 2 && !has_speech(&buffer) {
                let keep = buffer.len() - RATE / 4;
                buffer.drain(..keep);
                decoded_len = 0;
            }
            buffer.clone()
        };
        if window.len() < RATE || window.len() - decoded_len.min(window.len()) < RATE / 2 {
            continue;
        }
        let full = window.len() >= LONGEST;
        let take = &window[window.len().saturating_sub(LONGEST)..];
        if !has_speech(take) {
            continue;
        }
        let paused = window.len() > PAUSE + RATE && speech_ended(take);
        let Some(text) = transcribe(&mut state, take, &prompt, threads) else { continue };
        decoded_len = window.len();
        let final_phrase = paused || full;
        if !is_noise(&text) && !echoes_prompt(&text, &prompt) && (final_phrase || text != last_text) {
            emit(&app, run, serde_json::json!({ "kind": "phrase", "text": text, "final": final_phrase, "alternatives": [] }));
            last_text = text;
        }
        if final_phrase {
            // Start the next phrase from here, keeping a moment so a word cut in half is heard whole.
            let mut buffer = audio.lock().unwrap_or_else(|poison| poison.into_inner());
            let used = window.len().min(buffer.len());
            let keep_from = used.saturating_sub(RATE / 5);
            buffer.drain(..keep_from);
            decoded_len = 0;
            last_text.clear();
        }
    }
    emit(&app, run, serde_json::json!({ "kind": "end" }));
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A steady hum at `level` (RMS), like a fan or air conditioning.
    fn hum(seconds: f32, level: f32) -> Vec<f32> {
        (0..(RATE as f32 * seconds) as usize).map(|i| level * std::f32::consts::SQRT_2 * (i as f32 * 0.07).sin()).collect()
    }

    /// Syllables: loud bursts of 150 ms with short gaps, over the hum.
    fn speech(seconds: f32, room: f32) -> Vec<f32> {
        let mut samples = hum(seconds, room);
        for (i, sample) in samples.iter_mut().enumerate() {
            if (i / (RATE * 15 / 100)).is_multiple_of(2) {
                *sample += 0.1 * (i as f32 * 0.3).sin();
            }
        }
        samples
    }

    #[test]
    fn a_humming_room_is_not_speech() {
        assert!(!has_speech(&hum(3.0, 0.0)));
        // Louder than the old fixed limit (0.006), still only the room.
        assert!(!has_speech(&hum(3.0, 0.015)));
        assert!(!has_speech(&hum(3.0, 0.04)));
    }

    #[test]
    fn speech_over_the_hum_is_heard() {
        assert!(has_speech(&speech(1.5, 0.0)));
        assert!(has_speech(&speech(1.5, 0.015)));
        let mut words = hum(2.0, 0.015);
        words.extend(speech(1.0, 0.015));
        assert!(has_speech(&words));
    }

    #[test]
    fn a_cough_is_not_speech() {
        let mut samples = hum(2.0, 0.01);
        for sample in &mut samples[RATE..RATE + RATE / 10] {
            *sample += 0.2;
        }
        assert!(!has_speech(&samples));
    }

    #[test]
    fn a_phrase_ends_when_only_the_room_is_left() {
        let mut samples = speech(2.0, 0.015);
        assert!(!speech_ended(&samples));
        samples.extend(hum(1.0, 0.015));
        assert!(speech_ended(&samples));
    }

    #[test]
    fn the_prompt_read_back_is_dropped() {
        let prompt = prompt_for("Pastor Mensah\nHosanna");
        assert!(echoes_prompt("Genesis, Exodus, Leviticus, Numbers, Deuteronomy.", &prompt));
        assert!(echoes_prompt("Bible reading. Genesis, Exodus, Leviticus.", &prompt));
        assert!(echoes_prompt("Chapter 3, verse 16. John 3:16.", &prompt));
        // What a preacher really says stays.
        assert!(!echoes_prompt("John 3:16", &prompt));
        assert!(!echoes_prompt("Chapter 3 verse 16", &prompt));
        assert!(!echoes_prompt("Turn with me to Genesis chapter 1", &prompt));
        assert!(!echoes_prompt("Romans 8, verse 28 and 29", &prompt));
    }

    /// Decode spoken WAV files (16 kHz mono 16-bit) with the real model. Run by hand:
    /// WHISPER_MODEL=path/model.bin WHISPER_WAVS=a.wav,b.wav cargo test whisper -- --ignored --nocapture
    #[test]
    #[ignore]
    fn hears_references() {
        let (Ok(model), Ok(wavs)) = (std::env::var("WHISPER_MODEL"), std::env::var("WHISPER_WAVS")) else { return };
        let context = whisper_rs::WhisperContext::new_with_params(&model, whisper_rs::WhisperContextParameters::default()).expect("model");
        let mut state = context.create_state().expect("state");
        for wav in wavs.split(',') {
            let bytes = std::fs::read(wav).expect("wav");
            let data = bytes.windows(4).position(|w| w == b"data").expect("data chunk") + 8;
            let samples: Vec<f32> = bytes[data..].as_chunks::<2>().0.iter().map(|pair| i16::from_le_bytes([pair[0], pair[1]]) as f32 / 32_768.0).collect();
            let started = std::time::Instant::now();
            let text = super::transcribe(&mut state, &samples, &super::prompt_for(""), 4).unwrap_or_default();
            println!("{wav}: {text}  ({} ms)", started.elapsed().as_millis());
        }
    }
}
