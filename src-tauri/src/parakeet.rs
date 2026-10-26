//! Parakeet listening: NVIDIA's Parakeet TDT 0.6B (v3, 25 European languages) on this computer,
//! through ONNX Runtime. Offline like Whisper, and closer to what was said, but heavier: about 670 MB
//! to download and 1–1.5 GB of memory while it listens. So it is offered only on a computer that can
//! carry it beside the screen (enough memory and cores), it uses at most half the cores, and it leaves
//! memory a minute after listening stops.
//!
//! The model files come from a pinned version on Hugging Face (istupakov/parakeet-tdt-0.6b-v3-onnx,
//! CC BY 4.0, from NVIDIA's model) and are checked against their SHA-256 before use. Listening shares
//! Whisper's microphone capture and phrase loop (whisper.rs) and sends the same `listen-phrase` lines.
//! ONNX Runtime ships for Windows and Apple Silicon only, so Intel Macs keep System and Accurate.

use serde::Serialize;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{Emitter, Manager};
use transcribe_rs::onnx::parakeet::{ParakeetModel, ParakeetParams};
use transcribe_rs::onnx::Quantization;

const FOLDER: &str = "parakeet-tdt-0.6b-v3-int8";
const REVISION: &str = "8f23f0c03c8761650bdb5b40aaf3e40d2c15f1ce";
/// (file, bytes, SHA-256)
const FILES: [(&str, u64, &str); 4] = [
    ("vocab.txt", 93_939, "d58544679ea4bc6ac563d1f545eb7d474bd6cfa467f0a6e2c1dc1c7d37e3c35d"),
    ("nemo128.onnx", 139_764, "a9fde1486ebfcc08f328d75ad4610c67835fea58c73ba57e3209a6f6cf019e9f"),
    ("decoder_joint-model.int8.onnx", 18_202_004, "eea7483ee3d1a30375daedc8ed83e3960c91b098812127a0d99d1c8977667a70"),
    ("encoder-model.int8.onnx", 652_183_999, "6139d2fa7e1b086097b277c7149725edbab89cc7c7ae64b23c741be4055aff09"),
];
const MODEL_BYTES: u64 = 93_939 + 139_764 + 18_202_004 + 652_183_999;

/// The least memory (bytes) a computer needs: the model takes 1–1.5 GB beside the app and the screen.
const LEAST_MEMORY: u64 = 7_500_000_000;
/// The fewest processor cores: half go to listening, half stay with the screen.
const LEAST_CORES: usize = 4;

#[derive(Clone, Serialize)]
pub struct ModelStatus {
    pub installed: bool,
    pub downloading: bool,
    pub bytes: u64,
    /// This computer can carry Parakeet beside the screen.
    pub supported: bool,
    /// Why not, when it cannot.
    pub reason: Option<String>,
}

#[derive(Clone, Serialize)]
struct Progress {
    received: u64,
    total: u64,
    done: bool,
    error: Option<String>,
}

static DOWNLOADING: AtomicBool = AtomicBool::new(false);
/// The current download's number; cancel moves it on (as in whisper.rs).
static RUN: AtomicU64 = AtomicU64::new(0);

/// Whether this computer has the memory and cores for Parakeet, and why not.
fn fit() -> Option<String> {
    let cores = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(1);
    let mut system = sysinfo::System::new();
    system.refresh_memory();
    let memory = system.total_memory();
    if memory < LEAST_MEMORY {
        return Some(format!("Most accurate listening needs 8 GB of memory; this computer has {} GB. Accurate listening is lighter.", (memory as f64 / 1e9).round()));
    }
    if cores < LEAST_CORES {
        return Some(format!("Most accurate listening needs a processor with {LEAST_CORES} cores or more; this one has {cores}. Accurate listening is lighter."));
    }
    None
}

/// Threads Parakeet may use: half the cores (1 to 4), the rest stay with the screen.
fn threads() -> usize {
    (std::thread::available_parallelism().map(|n| n.get()).unwrap_or(2) / 2).clamp(1, 4)
}

fn model_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    // The local (not roaming) data folder on Windows: 670 MB must not travel with a domain profile.
    let base = app.path().app_local_data_dir().map_err(|error| error.to_string())?;
    Ok(base.join("models").join(FOLDER))
}

fn installed(app: &tauri::AppHandle) -> bool {
    let Ok(dir) = model_dir(app) else { return false };
    FILES.iter().all(|(name, bytes, _)| std::fs::metadata(dir.join(name)).is_ok_and(|meta| meta.len() == *bytes))
}

pub fn status(app: &tauri::AppHandle) -> ModelStatus {
    let reason = fit();
    ModelStatus { installed: installed(app), downloading: DOWNLOADING.load(Ordering::SeqCst), bytes: MODEL_BYTES, supported: reason.is_none(), reason }
}

pub fn delete(app: &tauri::AppHandle) -> Result<(), String> {
    stop();
    *MODEL.lock().unwrap_or_else(|poison| poison.into_inner()) = None;
    let dir = model_dir(app)?;
    if dir.exists() {
        std::fs::remove_dir_all(dir).map_err(|error| format!("Could not remove the model. {error}"))?;
    }
    Ok(())
}

pub fn cancel_download(app: &tauri::AppHandle) {
    RUN.fetch_add(1, Ordering::SeqCst);
    if DOWNLOADING.swap(false, Ordering::SeqCst) {
        let _ = app.emit("parakeet-download", Progress { received: 0, total: MODEL_BYTES, done: true, error: Some("Download cancelled.".into()) });
    }
}

/// Download the four files on their own thread; `parakeet-download` events report progress and the end.
pub fn download(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(reason) = fit() {
        return Err(reason);
    }
    if DOWNLOADING.swap(true, Ordering::SeqCst) {
        return Ok(());
    }
    let run = RUN.fetch_add(1, Ordering::SeqCst) + 1;
    let dir = model_dir(&app)?;
    std::thread::spawn(move || {
        let result = fetch_all(&app, &dir, run);
        if RUN.load(Ordering::SeqCst) != run {
            return;
        }
        DOWNLOADING.store(false, Ordering::SeqCst);
        let error = result.err();
        let _ = app.emit("parakeet-download", Progress { received: if error.is_none() { MODEL_BYTES } else { 0 }, total: MODEL_BYTES, done: true, error });
    });
    Ok(())
}

fn fetch_all(app: &tauri::AppHandle, dir: &std::path::Path, run: u64) -> Result<(), String> {
    let mut done = 0u64;
    let mut last = Instant::now();
    for (name, bytes, sha) in FILES {
        let path = dir.join(name);
        // A file already here whole (an earlier download that stopped part way) is kept.
        if std::fs::metadata(&path).is_ok_and(|meta| meta.len() == bytes) {
            done += bytes;
            continue;
        }
        let url = format!("https://huggingface.co/istupakov/parakeet-tdt-0.6b-v3-onnx/resolve/{REVISION}/{name}");
        crate::whisper::fetch_file(&url, sha, bytes, &path, run, &|| RUN.load(Ordering::SeqCst) == run, &mut |received| {
            if last.elapsed() >= Duration::from_millis(250) {
                let _ = app.emit("parakeet-download", Progress { received: done + received, total: MODEL_BYTES, done: false, error: None });
                last = Instant::now();
            }
        })?;
        done += bytes;
    }
    Ok(())
}

// --- Listening ------------------------------------------------------------------------------------

/// The loaded model, kept between listens for a minute (loading takes a few seconds).
static MODEL: Mutex<Option<Arc<Mutex<ParakeetModel>>>> = Mutex::new(None);

struct Running {
    stop: Arc<AtomicBool>,
    feed: Option<crate::noise::Feed>,
    worker: Option<std::thread::JoinHandle<()>>,
}

static RUNNING: Mutex<Option<Running>> = Mutex::new(None);

fn model(app: &tauri::AppHandle) -> Result<Arc<Mutex<ParakeetModel>>, String> {
    let mut guard = MODEL.lock().unwrap_or_else(|poison| poison.into_inner());
    if let Some(model) = guard.as_ref() {
        return Ok(model.clone());
    }
    if !installed(app) {
        return Err("Most accurate listening needs its model. Download it in Settings › Sound & voice.".into());
    }
    transcribe_rs::onnx::session::set_thread_limit(threads());
    let loaded = ParakeetModel::load(&model_dir(app)?, &Quantization::Int8).map_err(|error| {
        // The technical detail goes to the log only: it names the parts inside the app.
        log::warn!("listening model: {error}");
        "The listening model could not be loaded. Download it again in Settings › Sound & voice.".to_string()
    })?;
    let model = Arc::new(Mutex::new(loaded));
    *guard = Some(model.clone());
    Ok(model)
}

/// Start listening with Parakeet. `mix` is the noise filter's share of cleaned signal (0 = off).
pub fn start(app: tauri::AppHandle, run: u64, mix: f32) -> Result<(), String> {
    if let Some(reason) = fit() {
        return Err(reason);
    }
    stop();
    *STOPPED_AT.lock().unwrap_or_else(|poison| poison.into_inner()) = None;
    let model = model(&app)?;
    let (feed, audio) = crate::whisper::capture(&app, run, mix)?;
    let stop = Arc::new(AtomicBool::new(false));
    let flag = stop.clone();
    let worker_app = app.clone();
    let worker = std::thread::spawn(move || {
        let params = ParakeetParams::default();
        let decode = |samples: &[f32]| {
            let mut model = model.lock().unwrap_or_else(|poison| poison.into_inner());
            model.transcribe_with(samples, &params).ok().map(|result| result.text.trim().to_string())
        };
        crate::whisper::follow(&worker_app, run, &audio, &flag, decode, |text| !crate::whisper::is_noise(text));
    });
    crate::whisper::emit(&app, run, serde_json::json!({ "kind": "status", "message": "Listening (most accurate). Speak a reference or read a verse." }));
    *RUNNING.lock().unwrap_or_else(|poison| poison.into_inner()) = Some(Running { stop, feed: Some(feed), worker: Some(worker) });
    Ok(())
}

/// Listening stopped: the model (over 1 GB) leaves memory after a quiet minute, unless listening
/// starts again first.
static STOPPED_AT: Mutex<Option<Instant>> = Mutex::new(None);
const KEEP_LOADED: Duration = Duration::from_secs(60);

fn forget_model_later() {
    let at = Instant::now();
    *STOPPED_AT.lock().unwrap_or_else(|poison| poison.into_inner()) = Some(at);
    std::thread::spawn(move || {
        std::thread::sleep(KEEP_LOADED);
        let stopped = *STOPPED_AT.lock().unwrap_or_else(|poison| poison.into_inner());
        let listening = RUNNING.lock().unwrap_or_else(|poison| poison.into_inner()).is_some();
        if stopped == Some(at) && !listening {
            *MODEL.lock().unwrap_or_else(|poison| poison.into_inner()) = None;
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

#[cfg(test)]
mod tests {
    /// Decode spoken WAV files (16 kHz mono 16-bit) with the real model, and time it. Run by hand:
    /// PARAKEET_DIR=path/to/model PARAKEET_WAVS=a.wav,b.wav cargo test parakeet -- --ignored --nocapture
    #[test]
    #[ignore]
    fn hears_references() {
        use transcribe_rs::onnx::parakeet::{ParakeetModel, ParakeetParams};
        let (Ok(dir), Ok(wavs)) = (std::env::var("PARAKEET_DIR"), std::env::var("PARAKEET_WAVS")) else { return };
        transcribe_rs::onnx::session::set_thread_limit(super::threads());
        let started = std::time::Instant::now();
        let mut model = ParakeetModel::load(std::path::Path::new(&dir), &transcribe_rs::onnx::Quantization::Int8).expect("model");
        println!("loaded in {} ms with {} threads", started.elapsed().as_millis(), super::threads());
        for wav in wavs.split(',') {
            let bytes = std::fs::read(wav).expect("wav");
            let data = bytes.windows(4).position(|w| w == b"data").expect("data chunk") + 8;
            let samples: Vec<f32> = bytes[data..].as_chunks::<2>().0.iter().map(|pair| i16::from_le_bytes([pair[0], pair[1]]) as f32 / 32_768.0).collect();
            let started = std::time::Instant::now();
            let text = model.transcribe_with(&samples, &ParakeetParams::default()).map(|result| result.text).unwrap_or_default();
            println!("{wav} ({:.1} s of sound): {text}  ({} ms)", samples.len() as f32 / 16_000.0, started.elapsed().as_millis());
        }
    }
}
