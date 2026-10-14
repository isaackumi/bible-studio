use serde::Serialize;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ListenAccess {
    pub microphone: String,
    pub speech: String,
}

pub fn open_privacy_settings() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone")
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }
    #[cfg(not(target_os = "macos"))]
    Err("Privacy settings are opened on macOS.".into())
}

/// `tauri dev` starts a bare binary whose privacy keys TCC ignores when Cursor is the parent.
/// Relaunch from a real .app so Microphone and Speech Recognition prompts can appear.
pub fn relaunch_inside_bundle() {
    #[cfg(target_os = "macos")]
    macos::relaunch_inside_bundle();
}

pub fn request_access() -> Result<ListenAccess, String> {
    #[cfg(target_os = "macos")]
    {
        if !macos::inside_app_bundle() {
            return Err(
                "Church Studio is not running as an app yet. Quit it and start npm run tauri dev again."
                    .into(),
            );
        }
        macos::request_access()
    }
    #[cfg(not(target_os = "macos"))]
    {
        Ok(ListenAccess {
            microphone: "unsupported".into(),
            speech: "unsupported".into(),
        })
    }
}

#[cfg(target_os = "macos")]
mod macos {
    use super::ListenAccess;
    use std::os::unix::process::CommandExt;
    use std::path::Path;
    use std::sync::mpsc;
    use std::time::Duration;

    use block2::RcBlock;
    use objc2::runtime::Bool;
    use objc2_av_foundation::{AVAuthorizationStatus, AVCaptureDevice, AVMediaTypeAudio};
    use objc2_speech::{SFSpeechRecognizer, SFSpeechRecognizerAuthorizationStatus};

    const BUNDLE_PLIST: &str = include_str!("../Info.plist");

    pub fn inside_app_bundle() -> bool {
        std::env::current_exe()
            .ok()
            .is_some_and(|path| path.to_string_lossy().contains(".app/Contents/MacOS/"))
    }

    pub fn relaunch_inside_bundle() {
        if inside_app_bundle() {
            return;
        }
        let Ok(exe) = std::env::current_exe() else {
            return;
        };
        let Some(parent) = exe.parent() else {
            return;
        };
        let app = parent.join("Church Studio.app");
        let macos_dir = app.join("Contents/MacOS");
        let bundled = macos_dir.join("church-studio");
        if std::fs::create_dir_all(&macos_dir).is_err() {
            return;
        }
        if std::fs::write(app.join("Contents/Info.plist"), BUNDLE_PLIST).is_err() {
            return;
        }
        if refresh_binary(&exe, &bundled).is_err() {
            return;
        }
        let _ = std::process::Command::new("codesign")
            .args(["--force", "--sign", "-", "--identifier", "app.churchstudio.present"])
            .arg(&app)
            .status();
        // `exec` keeps Cursor as the responsible process, and macOS then aborts speech requests.
        // LaunchServices `open` makes Church Studio responsible for its own microphone prompt.
        let _ = std::process::Command::new("pkill")
            .args(["-f", "Church Studio.app/Contents/MacOS/church-studio"])
            .status();
        let mut launched = std::process::Command::new("open");
        launched.arg(&app).process_group(0);
        if launched.spawn().is_err() {
            log::error!("could not open {}", app.display());
            return;
        }
        log::info!("opened {} for the microphone prompt", app.display());
        for _ in 0..50 {
            if app_is_running() {
                break;
            }
            std::thread::sleep(Duration::from_millis(100));
        }
        while app_is_running() {
            std::thread::sleep(Duration::from_millis(400));
        }
        std::process::exit(0);
    }

    fn app_is_running() -> bool {
        std::process::Command::new("pgrep")
            .args(["-f", "Church Studio.app/Contents/MacOS/church-studio"])
            .output()
            .is_ok_and(|output| output.status.success())
    }

    fn refresh_binary(source: &Path, bundled: &Path) -> Result<(), String> {
        let src = std::fs::metadata(source).map_err(|e| e.to_string())?;
        let same = std::fs::metadata(bundled)
            .ok()
            .is_some_and(|dst| dst.len() == src.len() && dst.modified().ok() == src.modified().ok());
        if same {
            return Ok(());
        }
        let _ = std::fs::remove_file(bundled);
        std::fs::copy(source, bundled).map_err(|e| e.to_string())?;
        std::fs::File::options()
            .write(true)
            .open(bundled)
            .and_then(|file| file.set_modified(src.modified().unwrap_or(std::time::SystemTime::now())))
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn request_access() -> Result<ListenAccess, String> {
        Ok(ListenAccess {
            microphone: request_microphone()?,
            speech: request_speech()?,
        })
    }

    fn request_microphone() -> Result<String, String> {
        let media = unsafe { AVMediaTypeAudio }.ok_or("This Mac has no audio capture type.")?;
        let status = unsafe { AVCaptureDevice::authorizationStatusForMediaType(media) };
        match status {
            AVAuthorizationStatus::Authorized => return Ok("granted".into()),
            AVAuthorizationStatus::Denied | AVAuthorizationStatus::Restricted => return Ok("denied".into()),
            _ => {}
        }
        let (tx, rx) = mpsc::channel();
        let block = RcBlock::new(move |granted: Bool| {
            let _ = tx.send(granted.as_bool());
        });
        unsafe {
            AVCaptureDevice::requestAccessForMediaType_completionHandler(media, &block);
        }
        rx.recv_timeout(Duration::from_secs(180))
            .map(|granted| if granted { "granted".into() } else { "denied".into() })
            .map_err(|_| "The microphone dialog was closed.".into())
    }

    fn request_speech() -> Result<String, String> {
        let status = unsafe { SFSpeechRecognizer::authorizationStatus() };
        match status {
            SFSpeechRecognizerAuthorizationStatus::Authorized => return Ok("granted".into()),
            SFSpeechRecognizerAuthorizationStatus::Denied | SFSpeechRecognizerAuthorizationStatus::Restricted => {
                return Ok("denied".into())
            }
            _ => {}
        }
        let (tx, rx) = mpsc::channel();
        let block = RcBlock::new(move |next: SFSpeechRecognizerAuthorizationStatus| {
            let _ = tx.send(next);
        });
        unsafe {
            SFSpeechRecognizer::requestAuthorization(&block);
        }
        match rx.recv_timeout(Duration::from_secs(180)) {
            Ok(SFSpeechRecognizerAuthorizationStatus::Authorized) => Ok("granted".into()),
            Ok(_) => Ok("denied".into()),
            Err(_) => Err("The speech dialog was closed.".into()),
        }
    }
}
