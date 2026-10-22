//! NDI output: Program (what the audience window shows) sent over the network as an NDI source,
//! for OBS, vMix, a streaming computer or an NDI monitor. On macOS a helper captures the audience
//! window with ScreenCaptureKit and sends it with the NDI library, loaded at run time. Status
//! lines from the helper arrive in the app as `ndi-status` events.
// The helper exists on macOS only; elsewhere the commands answer "not available".
#![cfg_attr(not(target_os = "macos"), allow(dead_code))]

use serde::Serialize;

#[derive(Clone, Serialize)]
pub struct NdiLine {
    pub line: String,
}

/// The two senders: Program (the audience window) and Key (the words alone, on transparency).
#[derive(Clone, Copy)]
pub enum Output {
    Program,
    Key,
}

impl Output {
    fn event(self) -> &'static str {
        match self {
            Output::Program => "ndi-status",
            Output::Key => "ndi-key-status",
        }
    }
}

#[cfg(target_os = "macos")]
mod running {
    use std::sync::Mutex;

    pub struct Running {
        pub child: std::process::Child,
        pub stdin: std::process::ChildStdin,
    }

    pub static PROGRAM: Mutex<Option<Running>> = Mutex::new(None);
    pub static KEY: Mutex<Option<Running>> = Mutex::new(None);

    pub fn slot(output: super::Output) -> &'static Mutex<Option<Running>> {
        match output {
            super::Output::Program => &PROGRAM,
            super::Output::Key => &KEY,
        }
    }
}

/// Whether this install has the NDI sender (macOS builds that bundle it).
pub fn available() -> bool {
    #[cfg(target_os = "macos")]
    {
        std::env::current_exe().ok().and_then(|exe| exe.parent().map(|dir| dir.join("church-studio-ndi").exists())).unwrap_or(false)
    }
    #[cfg(not(target_os = "macos"))]
    {
        false
    }
}

/// Start sending. `pattern` sends colour bars instead of Program (to find the source first).
/// `audio` sends the audience window's sound too (with the pattern, a beep each second).
/// The key output draws the words it is given (`key_words`) on a transparent picture.
pub fn start(app: tauri::AppHandle, output: Output, name: &str, fps: u32, pattern: bool, audio: bool) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        use tauri::Emitter;
        stop(output);
        let helper = std::env::current_exe()
            .ok()
            .and_then(|exe| exe.parent().map(|dir| dir.join("church-studio-ndi")))
            .filter(|path| path.exists())
            .ok_or("NDI output is coming soon to Church Studio.")?;
        let clean: String = name.chars().filter(|c| !c.is_control()).take(60).collect();
        let mut command = std::process::Command::new(helper);
        command
            .args(["--pid", &std::process::id().to_string(), "--title", "Audience", "--name"])
            .arg(if clean.trim().is_empty() { "Church Studio" } else { clean.trim() })
            .args(["--fps", &fps.clamp(10, 60).to_string()]);
        match output {
            Output::Key => {
                command.arg("--key");
            }
            Output::Program if pattern => {
                command.arg("--pattern");
            }
            Output::Program => {}
        }
        if audio && matches!(output, Output::Program) {
            command.arg("--audio");
        }
        let mut child = command
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::inherit())
            .spawn()
            .map_err(|error| format!("Could not start the NDI sender. {error}"))?;
        let stdout = child.stdout.take().ok_or("The NDI sender gave no status.")?;
        let stdin = child.stdin.take().ok_or("The NDI sender could not be stopped later.")?;
        let event = output.event();
        std::thread::spawn(move || {
            let reader = std::io::BufReader::new(stdout);
            for line in std::io::BufRead::lines(reader) {
                let Ok(line) = line else { break };
                let _ = app.emit(event, NdiLine { line });
            }
            let _ = app.emit(event, NdiLine { line: r#"{"kind":"end"}"#.into() });
        });
        *running::slot(output).lock().unwrap_or_else(|poison| poison.into_inner()) = Some(running::Running { child, stdin });
        Ok(())
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app, output, name, fps, pattern, audio);
        Err("NDI output works on macOS for now. On Windows, NDI Tools' Screen Capture can send the audience screen meanwhile.".into())
    }
}

/// The words the key output shows now (empty clears it). Quiet when the key is not running.
pub fn key_words(cue: &str, body: &str) {
    #[cfg(target_os = "macos")]
    {
        let line = serde_json::json!({ "cue": cue.chars().take(160).collect::<String>(), "body": body.chars().take(800).collect::<String>() });
        let mut guard = running::KEY.lock().unwrap_or_else(|poison| poison.into_inner());
        if let Some(running) = guard.as_mut() {
            let ok = std::io::Write::write_all(&mut running.stdin, format!("{line}\n").as_bytes()).is_ok();
            if !ok {
                *guard = None;
            }
        }
    }
    #[cfg(not(target_os = "macos"))]
    let _ = (cue, body);
}

pub fn stop(output: Output) {
    #[cfg(target_os = "macos")]
    {
        let taken = running::slot(output).lock().unwrap_or_else(|poison| poison.into_inner()).take();
        if let Some(mut running) = taken {
            let _ = std::io::Write::write_all(&mut running.stdin, b"stop\n");
            drop(running.stdin);
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_secs(3));
                let _ = running.child.kill();
                let _ = running.child.wait();
            });
        }
    }
    #[cfg(not(target_os = "macos"))]
    let _ = output;
}

/// The port the NDI hub serves on (this computer only). The app's screens show an NDI source as
/// http://127.0.0.1:47129/ndi/<name>.mjpg; keep in step with NDI_HUB in src/lib/domain/ndi.ts.
pub const HUB_PORT: u16 = 47129;

/// Start the NDI hub (receiving NDI sources for scenes) when the app opens. Quiet when NDI is not
/// installed: the helper exits and NDI sources simply show as unavailable. It ends with the app,
/// when its stdin closes.
pub fn start_hub() {
    #[cfg(target_os = "macos")]
    {
        let Some(helper) = std::env::current_exe().ok().and_then(|exe| exe.parent().map(|dir| dir.join("church-studio-ndi"))).filter(|path| path.exists()) else {
            return;
        };
        let spawned = std::process::Command::new(helper)
            .args(["--hub", "--port", &HUB_PORT.to_string()])
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::null())
            .spawn();
        match spawned {
            Ok(mut child) => {
                if let Some(stdout) = child.stdout.take() {
                    std::thread::spawn(move || {
                        for line in std::io::BufRead::lines(std::io::BufReader::new(stdout)).map_while(Result::ok) {
                            log::info!("ndi hub: {line}");
                        }
                    });
                }
                // Holding stdin keeps the hub alive; it closes when the app exits.
                *hub::HUB.lock().unwrap_or_else(|poison| poison.into_inner()) = Some(child);
            }
            Err(error) => log::warn!("NDI hub did not start: {error}"),
        }
    }
}

#[cfg(target_os = "macos")]
mod hub {
    pub static HUB: std::sync::Mutex<Option<std::process::Child>> = std::sync::Mutex::new(None);
}
