//! NDI output: Program (what the audience window shows) sent over the network as an NDI source,
//! for OBS, vMix, a streaming computer or an NDI monitor. On macOS a helper captures the audience
//! window with ScreenCaptureKit and sends it with the NDI library, loaded at run time. Status
//! lines from the helper arrive in the app as `ndi-status` events.

use serde::Serialize;

#[derive(Clone, Serialize)]
pub struct NdiLine {
    pub line: String,
}

#[cfg(target_os = "macos")]
mod running {
    use std::sync::Mutex;

    pub struct Running {
        pub child: std::process::Child,
        pub stdin: std::process::ChildStdin,
    }

    pub static RUNNING: Mutex<Option<Running>> = Mutex::new(None);
}

/// Start sending. `pattern` sends colour bars instead of Program (to find the source first).
pub fn start(app: tauri::AppHandle, name: &str, fps: u32, pattern: bool) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        use tauri::Emitter;
        stop();
        let helper = std::env::current_exe()
            .ok()
            .and_then(|exe| exe.parent().map(|dir| dir.join("church-studio-ndi")))
            .filter(|path| path.exists())
            .ok_or("The NDI sender was not built. Quit Church Studio and run npm run tauri dev again.")?;
        let clean: String = name.chars().filter(|c| !c.is_control()).take(60).collect();
        let mut command = std::process::Command::new(helper);
        command
            .args(["--pid", &std::process::id().to_string(), "--title", "Audience", "--name"])
            .arg(if clean.trim().is_empty() { "Church Studio" } else { clean.trim() })
            .args(["--fps", &fps.clamp(10, 60).to_string()]);
        if pattern {
            command.arg("--pattern");
        }
        let mut child = command
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::inherit())
            .spawn()
            .map_err(|error| format!("Could not start the NDI sender. {error}"))?;
        let stdout = child.stdout.take().ok_or("The NDI sender gave no status.")?;
        let stdin = child.stdin.take().ok_or("The NDI sender could not be stopped later.")?;
        std::thread::spawn(move || {
            let reader = std::io::BufReader::new(stdout);
            for line in std::io::BufRead::lines(reader) {
                let Ok(line) = line else { break };
                let _ = app.emit("ndi-status", NdiLine { line });
            }
            let _ = app.emit("ndi-status", NdiLine { line: r#"{"kind":"end"}"#.into() });
        });
        *running::RUNNING.lock().unwrap_or_else(|poison| poison.into_inner()) = Some(running::Running { child, stdin });
        Ok(())
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app, name, fps, pattern);
        Err("NDI output works on macOS for now. On Windows, NDI Tools' Screen Capture can send the audience screen meanwhile.".into())
    }
}

pub fn stop() {
    #[cfg(target_os = "macos")]
    {
        let taken = running::RUNNING.lock().unwrap_or_else(|poison| poison.into_inner()).take();
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
