//! Going live and recording on Windows, with FFmpeg: an LGPL build downloaded once, the first time
//! a church records or streams (it is ~80 MB, too large to ship to everyone), and checked against
//! its published size and SHA-256. It captures the monitor the audience screen is on (Desktop
//! Duplication, which sees what the window's graphics draw; GDI when that monitor is on another
//! graphics card), encodes with the computer's own hardware encoder when it has one, and writes
//! an .mp4 and/or an RTMP(S) stream. Its progress is turned into the same JSON status lines the
//! Mac helper prints ("status", "live", "stats", "saved", "error", "end"), so the desk is the same.
//!
//! The command line, the progress reading and the choices are plain functions, tested everywhere;
//! what needs Windows (the download, the encoder trial, the monitor, the sound) is below them.
#![cfg_attr(not(target_os = "windows"), allow(dead_code))]

use std::collections::HashMap;
use std::path::{Path, PathBuf};

/// The pinned build: BtbN's FFmpeg 8.1 (LGPL, shared libraries), from a dated release that does not change.
pub const ENGINE_URL: &str = "https://github.com/BtbN/FFmpeg-Builds/releases/download/autobuild-2026-10-26-14-25/ffmpeg-n8.1.3-24-g92611900bb-win64-lgpl-shared-8.1.zip";
pub const ENGINE_SHA256: &str = "96afe9bee66012f4cbc336a473f0b595060d73bdc5efe4331d55101500d0a93e";
pub const ENGINE_BYTES: u64 = 80_994_602;
const ENGINE_IN_ZIP: &str = "ffmpeg-n8.1.3-24-g92611900bb-win64-lgpl-shared-8.1/";
/// What is kept from the zip: the program, the libraries it loads, and its licence.
pub const ENGINE_FILES: [&str; 9] = ["bin/ffmpeg.exe", "bin/avcodec-62.dll", "bin/avdevice-62.dll", "bin/avfilter-11.dll", "bin/avformat-62.dll", "bin/avutil-60.dll", "bin/swresample-6.dll", "bin/swscale-9.dll", "LICENSE.txt"];

/// Hardware encoders first (NVIDIA, Intel, AMD), then Windows' own (Media Foundation), then software.
pub const ENCODERS: [&str; 5] = ["h264_nvenc", "h264_qsv", "h264_amf", "h264_mf", "libopenh264"];

/// Where the picture comes from.
#[derive(Clone, Debug, PartialEq)]
pub enum Capture {
    /// Desktop Duplication of one monitor (its DXGI output), cropped to the audience window.
    Duplication { output: u32, x: i32, y: i32, width: u32, height: u32 },
    /// GDI capture of a region of the whole desktop (any monitor, any graphics card).
    Region { x: i32, y: i32, width: u32, height: u32 },
    /// Colour bars and a beep, to test a stream key.
    Pattern,
}

#[derive(Clone, Debug, PartialEq)]
pub enum Sound {
    /// The computer's sound, sent by this app as 16-bit stereo PCM to this local port.
    Loopback { port: u16, rate: u32 },
    /// No sound wanted: a silent track (stream servers expect one).
    Silent,
}

#[derive(Clone, Debug)]
pub struct Plan {
    pub capture: Capture,
    pub sound: Sound,
    pub encoder: String,
    pub width: u32,
    pub height: u32,
    pub fps: u32,
    pub video_kbps: u32,
    pub record: Option<PathBuf>,
    pub rtmp: Option<String>,
}

/// One of the tee muxer's outputs, escaped (its separators are `|`, `[`, `]` and `\`).
fn tee_escape(target: &str) -> String {
    target.chars().flat_map(|c| if matches!(c, '|' | '[' | ']' | '\\') { vec!['\\', c] } else { vec![c] }).collect()
}

/// The FFmpeg command line for a plan (after the program's name).
pub fn ffmpeg_args(plan: &Plan) -> Vec<String> {
    let (w, h, fps) = (plan.width, plan.height, plan.fps);
    let mut args: Vec<String> = ["-hide_banner", "-loglevel", "warning", "-nostats", "-progress", "pipe:1", "-y"].iter().map(|s| s.to_string()).collect();
    let mut push = |items: &[&str]| args.extend(items.iter().map(|s| s.to_string()));
    // The picture.
    let mut video_filter = String::new();
    match &plan.capture {
        Capture::Duplication { output, x, y, width, height } => {
            push(&["-f", "lavfi", "-i", &format!("ddagrab=output_idx={output}:framerate={fps}:offset_x={x}:offset_y={y}:video_size={width}x{height}:draw_mouse=0")]);
            // Its frames are on the graphics card: brought down for the encoder and the scaler.
            video_filter.push_str("hwdownload,format=bgra,");
        }
        Capture::Region { x, y, width, height } => {
            push(&["-f", "gdigrab", "-framerate", &fps.to_string(), "-offset_x", &x.to_string(), "-offset_y", &y.to_string(), "-video_size", &format!("{width}x{height}"), "-draw_mouse", "0", "-i", "desktop"]);
        }
        Capture::Pattern => push(&["-re", "-f", "lavfi", "-i", &format!("testsrc2=size={w}x{h}:rate={fps}")]),
    }
    // The sound.
    match (&plan.capture, &plan.sound) {
        (Capture::Pattern, _) => push(&["-re", "-f", "lavfi", "-i", "sine=frequency=1000:sample_rate=48000"]),
        (_, Sound::Loopback { port, rate }) => push(&["-f", "s16le", "-ar", &rate.to_string(), "-ac", "2", "-i", &format!("tcp://127.0.0.1:{port}?listen=1")]),
        (_, Sound::Silent) => push(&["-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo"]),
    }
    // Any screen shape fits the stream's frame, letterboxed, never stretched.
    video_filter.push_str(&format!("scale={w}:{h}:force_original_aspect_ratio=decrease,pad={w}:{h}:(ow-iw)/2:(oh-ih)/2,format=yuv420p"));
    let kbps = plan.video_kbps;
    push(&["-map", "0:v", "-map", "1:a", "-vf", &video_filter, "-c:v", &plan.encoder]);
    push(&["-b:v", &format!("{kbps}k"), "-maxrate", &format!("{kbps}k"), "-bufsize", &format!("{}k", kbps * 2), "-g", &(fps * 2).to_string(), "-bf", "0"]);
    match plan.encoder.as_str() {
        "h264_nvenc" => push(&["-preset", "p4", "-tune", "ll", "-rc", "cbr"]),
        "h264_qsv" => push(&["-preset", "veryfast"]),
        "h264_amf" => push(&["-usage", "lowlatency", "-rc", "cbr"]),
        "h264_mf" => push(&["-rate_control", "cbr", "-scenario", "live_streaming"]),
        _ => {}
    }
    push(&["-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-ac", "2"]);
    // Recording as fragmented MP4: a power cut or crash still leaves a file that plays.
    let mp4 = "movflags=+frag_keyframe+empty_moov+default_base_moof";
    match (&plan.record, &plan.rtmp) {
        (Some(file), Some(url)) => {
            // One encode, two outputs; the stream failing never stops the recording.
            let file = file.to_string_lossy().replace('\\', "/");
            push(&["-f", "tee", &format!("[f=mp4:{mp4}]{}|[f=flv:onfail=ignore]{}", tee_escape(&file), tee_escape(url))]);
        }
        (Some(file), None) => push(&["-movflags", "+frag_keyframe+empty_moov+default_base_moof", "-f", "mp4", &file.to_string_lossy()]),
        (None, Some(url)) => push(&["-f", "flv", url]),
        (None, None) => {}
    }
    args
}

/// A finished block of FFmpeg's progress (`key=value` lines ending with `progress=…`) as the desk's
/// "stats" line: seconds so far, frames, and whether a stream is live.
pub fn stats_line(block: &HashMap<String, String>, streaming: bool) -> Option<String> {
    let frames: u64 = block.get("frame")?.trim().parse().ok()?;
    let micros: u64 = block.get("out_time_us").or_else(|| block.get("out_time_ms")).and_then(|value| value.trim().parse().ok()).unwrap_or(0);
    let kbps = block.get("bitrate").and_then(|value| value.trim().trim_end_matches("kbits/s").parse::<f64>().ok()).map(|kbps| kbps.round() as u64);
    let mut line = serde_json::json!({ "kind": "stats", "seconds": micros / 1_000_000, "frames": frames, "live": streaming && frames > 0 });
    if let Some(kbps) = kbps {
        line["kbps"] = kbps.into();
    }
    Some(line.to_string())
}

/// What an FFmpeg warning means for the desk: the stream failed (recording carries on), the
/// capture stopped, or nothing worth saying.
pub fn warning_line(text: &str, streaming: bool) -> Option<String> {
    let lower = text.to_ascii_lowercase();
    let says = |code: &str, message: &str| Some(serde_json::json!({ "kind": "error", "code": code, "message": message }).to_string());
    if streaming && (lower.contains("rtmp") || lower.contains("flv") || lower.contains("slave muxer") || lower.contains("connection refused") || lower.contains("connection reset") || lower.contains("broken pipe")) {
        return says("rtmp", "The stream server stopped taking the stream. The recording carries on. Check the internet connection and the stream key, then start the stream again.");
    }
    if lower.contains("ddagrab") || lower.contains("gdigrab") || lower.contains("could not grab") || lower.contains("duplicate output") {
        return says("stopped", "The audience screen could not be captured. Keep it open on its monitor and start again.");
    }
    None
}

/// The monitor to capture with Desktop Duplication: the output holding the audience window's
/// middle, and the window's place on it. `outputs` are each output's desktop rectangle
/// (left, top, right, bottom) in DXGI order. None: no output holds it (use a GDI region).
pub fn duplication_for(window: (i32, i32, u32, u32), outputs: &[(i32, i32, i32, i32)]) -> Option<Capture> {
    let (x, y, width, height) = window;
    let (cx, cy) = (x + width as i32 / 2, y + height as i32 / 2);
    let index = outputs.iter().position(|&(l, t, r, b)| cx >= l && cx < r && cy >= t && cy < b)?;
    let (left, top, right, bottom) = outputs[index];
    // Kept inside the monitor (a window hanging off its edge is cut to what shows), even sizes for H.264.
    let x0 = x.clamp(left, right - 2);
    let y0 = y.clamp(top, bottom - 2);
    let w = ((x + width as i32).min(right) - x0).max(2) as u32 & !1;
    let h = ((y + height as i32).min(bottom) - y0).max(2) as u32 & !1;
    Some(Capture::Duplication { output: index as u32, x: x0 - left, y: y0 - top, width: w, height: h })
}

/// The engine's folder in the app's data folder (one per pinned build, so an update fetches the new one).
pub fn engine_dir(data: &Path) -> PathBuf {
    data.join("engines").join("ffmpeg-8.1")
}

pub fn engine_ready(data: &Path) -> bool {
    let dir = engine_dir(data);
    ENGINE_FILES.iter().all(|file| dir.join(file).is_file())
}

/// Take the kept files out of the downloaded zip into the engine folder.
pub fn unpack(zip_path: &Path, dir: &Path) -> Result<(), String> {
    let file = std::fs::File::open(zip_path).map_err(|error| format!("The recording engine could not be opened. {error}"))?;
    let mut archive = zip::ZipArchive::new(file).map_err(|error| format!("The recording engine could not be read. {error}"))?;
    let staging = dir.with_extension("unpacking");
    let _ = std::fs::remove_dir_all(&staging);
    for wanted in ENGINE_FILES {
        let mut entry = archive.by_name(&format!("{ENGINE_IN_ZIP}{wanted}")).map_err(|_| format!("The recording engine is missing {wanted}."))?;
        let target = staging.join(wanted);
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        let mut out = std::fs::File::create(&target).map_err(|error| format!("The recording engine could not be saved. {error}"))?;
        std::io::copy(&mut entry, &mut out).map_err(|error| format!("The recording engine could not be saved. Is the disk full? ({error})"))?;
    }
    let _ = std::fs::remove_dir_all(dir);
    std::fs::rename(&staging, dir).map_err(|error| format!("The recording engine could not be saved. {error}"))
}

#[cfg(target_os = "windows")]
pub mod windows {
    //! What needs Windows: the download, the encoder trial, the audience monitor, the sound.
    use super::*;
    use std::io::{BufRead, Write};
    use std::os::windows::process::CommandExt;
    use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
    use std::sync::{Mutex, OnceLock};
    use std::time::{Duration, Instant};
    use tauri::{Emitter, Manager};

    const NO_WINDOW: u32 = 0x0800_0000;
    static DOWNLOADING: AtomicBool = AtomicBool::new(false);
    static RUN: AtomicU64 = AtomicU64::new(0);
    static ENCODER: OnceLock<Option<String>> = OnceLock::new();

    struct Running {
        child: std::process::Child,
        stdin: std::process::ChildStdin,
        sound: Option<cpal::Stream>,
    }
    // The sound stream is only ever touched from here, under the lock.
    unsafe impl Send for Running {}
    static NOW: Mutex<Option<Running>> = Mutex::new(None);

    #[derive(Clone, serde::Serialize)]
    struct Progress {
        received: u64,
        total: u64,
        done: bool,
        error: Option<String>,
    }

    fn data(app: &tauri::AppHandle) -> Result<PathBuf, String> {
        app.path().app_data_dir().map_err(|error| error.to_string())
    }

    pub fn ready(app: &tauri::AppHandle) -> bool {
        data(app).is_ok_and(|dir| engine_ready(&dir))
    }

    /// Fetch and unpack the engine on its own thread; `broadcast-engine` events say how far it is.
    pub fn install(app: tauri::AppHandle) -> Result<(), String> {
        if DOWNLOADING.swap(true, Ordering::SeqCst) {
            return Ok(());
        }
        let run = RUN.fetch_add(1, Ordering::SeqCst) + 1;
        let data = data(&app)?;
        std::thread::spawn(move || {
            let zip = data.join("engines").join("ffmpeg-8.1.zip");
            let mut last = Instant::now();
            let result = crate::whisper::fetch_file(ENGINE_URL, ENGINE_SHA256, ENGINE_BYTES, &zip, run, &|| RUN.load(Ordering::SeqCst) == run, &mut |received| {
                if last.elapsed() >= Duration::from_millis(250) {
                    let _ = app.emit("broadcast-engine", Progress { received, total: ENGINE_BYTES, done: false, error: None });
                    last = Instant::now();
                }
            })
            .and_then(|()| unpack(&zip, &engine_dir(&data)));
            let _ = std::fs::remove_file(&zip);
            DOWNLOADING.store(false, Ordering::SeqCst);
            let error = result.err();
            if let Some(error) = &error {
                log::warn!("recording engine: {error}");
            }
            let _ = app.emit("broadcast-engine", Progress { received: if error.is_none() { ENGINE_BYTES } else { 0 }, total: ENGINE_BYTES, done: true, error });
        });
        Ok(())
    }

    pub fn cancel_install() {
        RUN.fetch_add(1, Ordering::SeqCst);
    }

    fn program(app: &tauri::AppHandle) -> Result<PathBuf, String> {
        let exe = engine_dir(&data(app)?).join("bin").join("ffmpeg.exe");
        if exe.is_file() { Ok(exe) } else { Err("The recording engine is not installed yet.".into()) }
    }

    /// The first encoder that really encodes on this computer (listed is not enough: a driver can
    /// be missing), found once by a fraction of a second of test picture.
    fn encoder(exe: &Path) -> Option<String> {
        ENCODER
            .get_or_init(|| {
                ENCODERS
                    .iter()
                    .find(|name| {
                        std::process::Command::new(exe)
                            .args(["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=30:duration=0.3", "-c:v", name, "-f", "null", "-"])
                            .creation_flags(NO_WINDOW)
                            .stdout(std::process::Stdio::null())
                            .stderr(std::process::Stdio::null())
                            .status()
                            .is_ok_and(|status| status.success())
                    })
                    .map(|name| name.to_string())
            })
            .clone()
    }

    /// Each monitor's desktop rectangle in Desktop Duplication's order (the first graphics card's outputs).
    fn outputs() -> Vec<(i32, i32, i32, i32)> {
        use ::windows::Win32::Graphics::Dxgi::{CreateDXGIFactory1, IDXGIFactory1};
        let mut found = Vec::new();
        unsafe {
            let Ok(factory) = CreateDXGIFactory1::<IDXGIFactory1>() else { return found };
            let Ok(adapter) = factory.EnumAdapters1(0) else { return found };
            let mut index = 0;
            while let Ok(output) = adapter.EnumOutputs(index) {
                if let Ok(desc) = output.GetDesc() {
                    let r = desc.DesktopCoordinates;
                    found.push((r.left, r.top, r.right, r.bottom));
                }
                index += 1;
            }
        }
        found
    }

    /// The audience window's place on the desktop, in pixels.
    fn audience_rect(app: &tauri::AppHandle) -> Option<(i32, i32, u32, u32)> {
        let window = app.get_webview_window("audience")?;
        if !window.is_visible().unwrap_or(false) {
            return None;
        }
        let at = window.outer_position().ok()?;
        let size = window.outer_size().ok()?;
        Some((at.x, at.y, size.width, size.height))
    }

    /// The computer's sound (what the room hears), sent to FFmpeg on a local port as 16-bit stereo.
    fn loopback(port: u16) -> Result<(cpal::Stream, u32), String> {
        use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
        let device = cpal::default_host().default_output_device().ok_or("No sound output to record.")?;
        let config = device.default_output_config().map_err(|error| error.to_string())?;
        let channels = usize::from(config.channels().max(1));
        let rate = config.sample_rate().0;
        let (tx, rx) = std::sync::mpsc::channel::<Vec<u8>>();
        // FFmpeg waits for this connection before it starts: try for a few seconds.
        std::thread::spawn(move || {
            let mut socket = None;
            for _ in 0..100 {
                if let Ok(stream) = std::net::TcpStream::connect(("127.0.0.1", port)) {
                    socket = Some(stream);
                    break;
                }
                std::thread::sleep(Duration::from_millis(50));
            }
            let Some(mut socket) = socket else { return };
            for bytes in rx {
                if socket.write_all(&bytes).is_err() {
                    break;
                }
            }
        });
        let to_bytes = move |frames: &mut dyn Iterator<Item = f32>| -> Vec<u8> {
            let samples: Vec<f32> = frames.collect();
            let mut out = Vec::with_capacity(samples.len() / channels * 4);
            for frame in samples.chunks(channels) {
                let left = frame[0];
                let right = *frame.get(1).unwrap_or(&left);
                for sample in [left, right] {
                    out.extend_from_slice(&((sample.clamp(-1.0, 1.0) * 32_767.0) as i16).to_le_bytes());
                }
            }
            out
        };
        let stream_config: cpal::StreamConfig = config.clone().into();
        let err = |error: cpal::StreamError| log::warn!("recording sound: {error}");
        // An input stream on an output device is Windows' loopback: what that device plays.
        let stream = match config.sample_format() {
            cpal::SampleFormat::F32 => device.build_input_stream(&stream_config, move |data: &[f32], _: &_| { let _ = tx.send(to_bytes(&mut data.iter().copied())); }, err, None),
            cpal::SampleFormat::I16 => device.build_input_stream(&stream_config, move |data: &[i16], _: &_| { let _ = tx.send(to_bytes(&mut data.iter().map(|s| f32::from(*s) / 32_768.0))); }, err, None),
            other => return Err(format!("The sound output sends {other} samples, which cannot be recorded yet.")),
        }
        .map_err(|error| format!("The computer's sound could not be recorded. {error}"))?;
        stream.play().map_err(|error| error.to_string())?;
        Ok((stream, rate))
    }

    pub fn start(app: tauri::AppHandle, options: crate::broadcast::Options, record: Option<PathBuf>) -> Result<(), String> {
        stop();
        let exe = program(&app)?;
        let encoder = encoder(&exe).ok_or("No video encoder works on this computer. Update the graphics driver, then try again.")?;
        let capture = if options.pattern {
            Capture::Pattern
        } else {
            let rect = audience_rect(&app).ok_or("Open the audience screen first: the recording shows what it shows.")?;
            duplication_for(rect, &outputs()).unwrap_or(Capture::Region { x: rect.0, y: rect.1, width: rect.2 & !1, height: rect.3 & !1 })
        };
        let mut sound_stream = None;
        let sound = if options.audio && !options.pattern {
            let port = std::net::TcpListener::bind(("127.0.0.1", 0)).and_then(|socket| socket.local_addr()).map(|addr| addr.port()).map_err(|error| error.to_string())?;
            let (stream, rate) = loopback(port)?;
            sound_stream = Some(stream);
            Sound::Loopback { port, rate }
        } else {
            Sound::Silent
        };
        let rtmp = options.rtmp.clone().filter(|url| !url.trim().is_empty());
        let streaming = rtmp.is_some();
        let plan = Plan { capture: capture.clone(), sound, encoder: encoder.clone(), width: options.width.clamp(640, 3840) & !1, height: options.height.clamp(360, 2160) & !1, fps: options.fps.clamp(15, 60), video_kbps: options.video_kbps.clamp(500, 20_000), record: record.clone(), rtmp };
        let mut child = std::process::Command::new(&exe)
            .args(ffmpeg_args(&plan))
            .creation_flags(NO_WINDOW)
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .map_err(|error| format!("Could not start recording. {error}"))?;
        let stdout = child.stdout.take().ok_or("The recording engine gave no progress.")?;
        let stderr = child.stderr.take().ok_or("The recording engine gave no messages.")?;
        let stdin = child.stdin.take().ok_or("The recording engine could not be stopped later.")?;
        log::info!("recording: {encoder}, {capture:?}, streaming {streaming}, recording {}", record.is_some());
        let source = if options.pattern { "Test pattern" } else { "Audience window" };
        let _ = app.emit("broadcast-status", crate::broadcast::line(serde_json::json!({ "kind": "status", "recording": record.is_some(), "streaming": streaming, "message": source }).to_string()));
        let warnings = app.clone();
        std::thread::spawn(move || {
            let mut said_stream = false;
            for text in std::io::BufReader::new(stderr).lines().map_while(Result::ok) {
                log::info!("recording engine: {}", text.chars().take(300).collect::<String>());
                if let Some(line) = warning_line(&text, streaming) {
                    // The stream's failure is said once; the recording goes on.
                    if line.contains("\"rtmp\"") && std::mem::replace(&mut said_stream, true) {
                        continue;
                    }
                    let _ = warnings.emit("broadcast-status", crate::broadcast::line(line));
                }
            }
        });
        std::thread::spawn(move || {
            let mut block = HashMap::new();
            let mut live_said = false;
            for text in std::io::BufReader::new(stdout).lines().map_while(Result::ok) {
                let Some((key, value)) = text.split_once('=') else { continue };
                if key != "progress" {
                    block.insert(key.to_string(), value.to_string());
                    continue;
                }
                if let Some(line) = stats_line(&block, streaming) {
                    if streaming && !live_said && line.contains("\"live\":true") {
                        live_said = true;
                        let _ = app.emit("broadcast-status", crate::broadcast::line(r#"{"kind":"live","message":"Live on the stream server."}"#.into()));
                    }
                    let _ = app.emit("broadcast-status", crate::broadcast::line(line));
                }
                block.clear();
            }
            if let Some(path) = &record {
                if path.is_file() {
                    let _ = app.emit("broadcast-status", crate::broadcast::line(serde_json::json!({ "kind": "saved", "path": path.display().to_string() }).to_string()));
                }
            }
            let _ = app.emit("broadcast-status", crate::broadcast::line(r#"{"kind":"end"}"#.into()));
        });
        *NOW.lock().unwrap_or_else(|poison| poison.into_inner()) = Some(Running { child, stdin, sound: sound_stream });
        Ok(())
    }

    /// Stop: FFmpeg is asked to finish ("q"), so the recording is closed properly; then made sure of.
    pub fn stop() {
        let taken = NOW.lock().unwrap_or_else(|poison| poison.into_inner()).take();
        if let Some(mut running) = taken {
            drop(running.sound.take());
            let _ = running.stdin.write_all(b"q");
            let _ = running.stdin.flush();
            std::thread::spawn(move || {
                for _ in 0..150 {
                    if matches!(running.child.try_wait(), Ok(Some(_))) {
                        return;
                    }
                    std::thread::sleep(Duration::from_millis(100));
                }
                let _ = running.child.kill();
                let _ = running.child.wait();
            });
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn plan(capture: Capture, record: Option<&str>, rtmp: Option<&str>) -> Plan {
        Plan { capture, sound: Sound::Silent, encoder: "h264_mf".into(), width: 1920, height: 1080, fps: 30, video_kbps: 5000, record: record.map(PathBuf::from), rtmp: rtmp.map(String::from) }
    }

    #[test]
    fn records_and_streams_from_one_encode_and_a_failed_stream_spares_the_recording() {
        let args = ffmpeg_args(&plan(Capture::Duplication { output: 1, x: 0, y: 0, width: 1920, height: 1080 }, Some(r"C:\Users\Ama\Videos\Sunday [9am].mp4"), Some("rtmps://a.rtmps.youtube.com/live2/abcd-efgh")));
        let joined = args.join(" ");
        assert!(joined.contains("ddagrab=output_idx=1:framerate=30:offset_x=0:offset_y=0:video_size=1920x1080:draw_mouse=0"));
        assert!(joined.contains("hwdownload,format=bgra,scale=1920:1080:force_original_aspect_ratio=decrease"));
        let tee = &args[args.iter().position(|arg| arg == "tee").unwrap() + 1];
        assert_eq!(tee, r"[f=mp4:movflags=+frag_keyframe+empty_moov+default_base_moof]C:/Users/Ama/Videos/Sunday \[9am\].mp4|[f=flv:onfail=ignore]rtmps://a.rtmps.youtube.com/live2/abcd-efgh");
        assert!(joined.contains("-c:v h264_mf -b:v 5000k -maxrate 5000k -bufsize 10000k -g 60 -bf 0 -rate_control cbr"));
        assert!(joined.contains("-progress pipe:1"));
    }

    #[test]
    fn records_alone_streams_alone_and_tests_with_a_pattern() {
        let record = ffmpeg_args(&plan(Capture::Region { x: -1920, y: 0, width: 1920, height: 1080 }, Some("C:/r.mp4"), None)).join(" ");
        assert!(record.contains("-f gdigrab -framerate 30 -offset_x -1920 -offset_y 0 -video_size 1920x1080 -draw_mouse 0 -i desktop"));
        assert!(record.ends_with("-f mp4 C:/r.mp4"));
        assert!(record.contains("anullsrc"), "a silent track when no sound is wanted");
        let stream = ffmpeg_args(&plan(Capture::Pattern, None, Some("rtmp://host/live/key"))).join(" ");
        assert!(stream.contains("testsrc2=size=1920x1080:rate=30") && stream.contains("sine=frequency=1000"));
        assert!(stream.ends_with("-f flv rtmp://host/live/key"));
    }

    #[test]
    fn hears_the_computer_through_a_local_port() {
        let mut p = plan(Capture::Region { x: 0, y: 0, width: 1280, height: 720 }, Some("C:/r.mp4"), None);
        p.sound = Sound::Loopback { port: 50123, rate: 44_100 };
        let args = ffmpeg_args(&p).join(" ");
        assert!(args.contains("-f s16le -ar 44100 -ac 2 -i tcp://127.0.0.1:50123?listen=1"));
        assert!(args.contains("-c:a aac -b:a 160k -ar 48000 -ac 2"));
    }

    #[test]
    fn reads_progress_as_the_desks_stats_and_warnings_as_what_to_do() {
        let block: HashMap<String, String> = [("frame", "900"), ("out_time_us", "30016000"), ("bitrate", "5021.4kbits/s")].into_iter().map(|(k, v)| (k.into(), v.into())).collect();
        let stats: serde_json::Value = serde_json::from_str(&stats_line(&block, true).unwrap()).unwrap();
        assert_eq!(stats, serde_json::json!({ "kind": "stats", "seconds": 30, "frames": 900, "live": true, "kbps": 5021 }));
        assert!(stats_line(&HashMap::new(), false).is_none());
        assert!(warning_line("[flv @ 000001] Failed to update header with correct duration", true).unwrap().contains("\"rtmp\""));
        assert!(warning_line("[tee @ 0x] Slave muxer #1 failed: Broken pipe, continuing with 1/2 slaves.", true).unwrap().contains("recording carries on"));
        assert!(warning_line("[ddagrab @ 0x] Failed to capture frame", false).unwrap().contains("\"stopped\""));
        assert!(warning_line("Past duration 0.999 too large", false).is_none());
    }

    #[test]
    fn captures_the_monitor_holding_the_audience_window_or_a_region_when_none_does() {
        // Two monitors: the laptop at 0,0 and the projector to its right.
        let outputs = [(0, 0, 1920, 1080), (1920, 0, 3840, 1080)];
        assert_eq!(duplication_for((1920, 0, 1920, 1080), &outputs), Some(Capture::Duplication { output: 1, x: 0, y: 0, width: 1920, height: 1080 }));
        // A window hanging off the projector's right edge: only what shows, in even sizes.
        assert_eq!(duplication_for((2000, 100, 1901, 801), &outputs), Some(Capture::Duplication { output: 1, x: 80, y: 100, width: 1840, height: 800 }));
        // On a monitor of another graphics card (not listed): none, so GDI takes a region.
        assert_eq!(duplication_for((-1280, 0, 1280, 720), &outputs), None);
    }

    #[test]
    fn unpacks_only_what_it_needs_and_knows_when_it_is_ready() {
        let dir = std::env::temp_dir().join(format!("church-studio-engine-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let zip_path = dir.join("engine.zip");
        {
            let mut writer = zip::ZipWriter::new(std::fs::File::create(&zip_path).unwrap());
            let options: zip::write::SimpleFileOptions = zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);
            for file in ENGINE_FILES.iter().chain(["bin/ffplay.exe"].iter()) {
                writer.start_file(format!("{ENGINE_IN_ZIP}{file}"), options).unwrap();
                std::io::Write::write_all(&mut writer, file.as_bytes()).unwrap();
            }
            writer.finish().unwrap();
        }
        assert!(!engine_ready(&dir));
        unpack(&zip_path, &engine_dir(&dir)).unwrap();
        assert!(engine_ready(&dir));
        assert!(!engine_dir(&dir).join("bin/ffplay.exe").exists(), "only what it needs");
        let _ = std::fs::remove_dir_all(&dir);
    }
}
