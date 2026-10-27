//! Going live and recording: on macOS the church-studio-broadcast helper captures the audience
//! window and encodes it with the Mac's own H.264 and AAC encoders; on Windows FFmpeg does
//! (broadcast_win.rs). Either way to an .mp4 file and/or an RTMP or RTMPS stream (YouTube,
//! Facebook, any RTMP service), with the same JSON status lines as "broadcast-status" events.
#![cfg_attr(not(any(target_os = "macos", target_os = "windows")), allow(dead_code))]

use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Options {
    /// The stream address with its key: rtmp(s)://host/app/streamkey. None: no stream.
    pub rtmp: Option<String>,
    /// Record into this folder (a dated file is made in it). None: no recording.
    pub record_folder: Option<String>,
    pub width: u32,
    pub height: u32,
    pub fps: u32,
    /// Video bitrate, kbps.
    pub video_kbps: u32,
    pub audio: bool,
    /// Colour bars and a beep instead of the audience window (to test a stream key).
    pub pattern: bool,
}

#[derive(Clone, Serialize)]
pub struct Line {
    line: String,
}

/// One status line for the desk ("broadcast-status"), for the Windows engine (the Mac helper prints its own).
#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
pub fn line(line: String) -> Line {
    if !line.starts_with(r#"{"kind":"stats""#) {
        log::info!("broadcast: {}", line.chars().take(400).collect::<String>());
    }
    Line { line }
}

#[cfg(target_os = "macos")]
mod running {
    use std::sync::Mutex;
    pub struct Running {
        pub child: std::process::Child,
        pub stdin: std::process::ChildStdin,
    }
    pub static NOW: Mutex<Option<Running>> = Mutex::new(None);
}

/// Where a recording goes: the chosen folder (with ~ for the home folder), or Movies/Church Studio
/// (Videos/Church Studio on Windows).
pub fn record_path(folder: Option<&str>, stamp: &str) -> std::path::PathBuf {
    let home = std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE")).map(std::path::PathBuf::from).unwrap_or_else(|| std::path::PathBuf::from("."));
    let movies = if cfg!(target_os = "windows") { "Videos" } else { "Movies" };
    let dir = match folder.map(str::trim).filter(|value| !value.is_empty()) {
        Some("~") => home,
        Some(value) if value.starts_with("~/") => home.join(&value[2..]),
        Some(value) => std::path::PathBuf::from(value),
        None => home.join(movies).join("Church Studio"),
    };
    let clean: String = stamp.chars().map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == ' ' { c } else { '-' }).collect();
    dir.join(format!("Service {clean}.mp4"))
}

/// A stream address the helper may send to: rtmp:// or rtmps:// with a host and a key.
pub fn stream_url_ok(url: &str) -> bool {
    let lower = url.trim().to_ascii_lowercase();
    let rest = lower.strip_prefix("rtmps://").or_else(|| lower.strip_prefix("rtmp://"));
    match rest {
        Some(rest) => {
            let mut parts = rest.split('/').filter(|part| !part.is_empty());
            let host = parts.next().unwrap_or("");
            !host.is_empty() && !host.contains('@') && parts.count() >= 2 && !url.chars().any(char::is_control)
        }
        None => false,
    }
}

pub fn start(app: tauri::AppHandle, options: Options, stamp: String) -> Result<Option<String>, String> {
    #[cfg(target_os = "macos")]
    {
        use tauri::Emitter;
        stop();
        let helper = std::env::current_exe()
            .ok()
            .and_then(|exe| exe.parent().map(|dir| dir.join("church-studio-broadcast")))
            .filter(|path| path.exists())
            .ok_or("The streaming helper was not built. Quit Church Studio and run npm run tauri dev again.")?;
        let mut command = std::process::Command::new(helper);
        command
            .args(["--pid", &std::process::id().to_string(), "--title", "Audience"])
            .args(["--width", &options.width.clamp(640, 3840).to_string(), "--height", &options.height.clamp(360, 2160).to_string()])
            .args(["--fps", &options.fps.clamp(15, 60).to_string(), "--vbitrate", &options.video_kbps.clamp(500, 20_000).to_string()]);
        if options.audio {
            command.arg("--audio");
        }
        if options.pattern {
            command.arg("--pattern");
        }
        if let Some(url) = options.rtmp.as_deref().filter(|url| !url.trim().is_empty()) {
            if !stream_url_ok(url) {
                return Err("The stream address must start with rtmp:// or rtmps:// and end with the stream key.".into());
            }
            command.args(["--rtmp", url.trim()]);
        }
        let mut saved = None;
        if options.record_folder.is_some() {
            let path = record_path(options.record_folder.as_deref(), &stamp);
            if let Some(dir) = path.parent() {
                std::fs::create_dir_all(dir).map_err(|error| format!("The recordings folder could not be made. {error}"))?;
            }
            saved = Some(path.display().to_string());
            command.arg("--record").arg(&path);
        }
        if options.rtmp.is_none() && saved.is_none() {
            return Err("Choose to stream, record, or both.".into());
        }
        let mut child = command
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::inherit())
            .spawn()
            .map_err(|error| format!("Could not start streaming. {error}"))?;
        let stdout = child.stdout.take().ok_or("The streaming helper gave no status.")?;
        let stdin = child.stdin.take().ok_or("The streaming helper could not be stopped later.")?;
        std::thread::spawn(move || {
            for line in std::io::BufRead::lines(std::io::BufReader::new(stdout)).map_while(Result::ok) {
                // What it says, not the running counts, goes to the log, so a support file shows why it stopped.
                if !line.starts_with(r#"{"kind":"stats""#) {
                    log::info!("broadcast: {}", line.chars().take(400).collect::<String>());
                }
                let _ = app.emit("broadcast-status", Line { line });
            }
            let _ = app.emit("broadcast-status", Line { line: r#"{"kind":"end"}"#.into() });
        });
        *running::NOW.lock().unwrap_or_else(|poison| poison.into_inner()) = Some(running::Running { child, stdin });
        Ok(saved)
    }
    #[cfg(target_os = "windows")]
    {
        if let Some(url) = options.rtmp.as_deref().filter(|url| !url.trim().is_empty()) {
            if !stream_url_ok(url) {
                return Err("The stream address must start with rtmp:// or rtmps:// and end with the stream key.".into());
            }
        }
        let saved = options.record_folder.is_some().then(|| record_path(options.record_folder.as_deref(), &stamp));
        if options.rtmp.as_deref().is_none_or(|url| url.trim().is_empty()) && saved.is_none() {
            return Err("Choose to stream, record, or both.".into());
        }
        if let Some(dir) = saved.as_ref().and_then(|path| path.parent()) {
            std::fs::create_dir_all(dir).map_err(|error| format!("The recordings folder could not be made. {error}"))?;
        }
        crate::broadcast_win::windows::start(app, options, saved.clone())?;
        Ok(saved.map(|path| path.display().to_string()))
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = (app, options, stamp);
        Err("Streaming and recording work on macOS and Windows. OBS or vMix can take Program over NDI meanwhile.".into())
    }
}

/// Stop: the helper finishes the recording (so the file plays) and leaves the stream cleanly.
/// Whether macOS lets this app capture the audience window (Screen & System Audio Recording). With
/// `ask`, the first time shows macOS's own question; after that only System Settings can change it.
pub fn screen_capture_allowed(ask: bool) -> bool {
    #[cfg(target_os = "macos")]
    {
        #[link(name = "CoreGraphics", kind = "framework")]
        unsafe extern "C" {
            fn CGPreflightScreenCaptureAccess() -> bool;
            fn CGRequestScreenCaptureAccess() -> bool;
        }
        unsafe {
            if CGPreflightScreenCaptureAccess() {
                return true;
            }
            if ask {
                return CGRequestScreenCaptureAccess();
            }
        }
        false
    }
    // Windows lets a desktop app capture its own screens without asking.
    #[cfg(target_os = "windows")]
    {
        let _ = ask;
        true
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = ask;
        false
    }
}

pub fn stop() {
    #[cfg(target_os = "windows")]
    crate::broadcast_win::windows::stop();
    #[cfg(target_os = "macos")]
    {
        let taken = running::NOW.lock().unwrap_or_else(|poison| poison.into_inner()).take();
        if let Some(mut running) = taken {
            let _ = std::io::Write::write_all(&mut running.stdin, b"stop\n");
            drop(running.stdin);
            std::thread::spawn(move || {
                // Long enough for a long recording to finish writing.
                for _ in 0..150 {
                    if matches!(running.child.try_wait(), Ok(Some(_))) {
                        return;
                    }
                    std::thread::sleep(std::time::Duration::from_millis(100));
                }
                let _ = running.child.kill();
                let _ = running.child.wait();
            });
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{record_path, stream_url_ok};

    #[test]
    fn stream_addresses() {
        assert!(stream_url_ok("rtmps://a.rtmps.youtube.com/live2/abcd-efgh-ijkl"));
        assert!(stream_url_ok("rtmps://live-api-s.facebook.com:443/rtmp/FB-123?s_bl=1"));
        assert!(stream_url_ok("rtmp://192.168.1.5/live/key"));
        assert!(!stream_url_ok("https://youtube.com/live2/key"));
        assert!(!stream_url_ok("rtmp://host/onlyapp"));
        assert!(!stream_url_ok("rtmp://user@host/app/key"));
    }

    #[test]
    fn recordings_go_to_movies_by_default() {
        let path = record_path(None, "2026-10-18 10:30");
        // Movies on a Mac, Videos on Windows: each system's own folder for films.
        let folder = if cfg!(target_os = "windows") { "Videos" } else { "Movies" };
        assert!(path.ends_with(format!("{folder}/Church Studio/Service 2026-10-18 10-30.mp4")), "{}", path.display());
        let chosen = record_path(Some("~/Desktop/Recordings"), "x");
        assert!(chosen.ends_with("Desktop/Recordings/Service x.mp4"));
    }
}
