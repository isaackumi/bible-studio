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

/// One transcriber output line, tagged with the run that produced it. The frontend ignores
/// lines from an earlier run (a stopped helper still sends its final "end").
#[derive(Clone, Serialize)]
pub struct ListenLine {
    pub run: u64,
    pub line: String,
}

pub fn start_transcribe(app: tauri::AppHandle, run: u64) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        macos::start_transcribe(app, run)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app, run);
        Err("On-device sermon transcription runs on macOS.".into())
    }
}

pub fn stop_transcribe() {
    #[cfg(target_os = "macos")]
    macos::stop_transcribe();
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
    use std::ffi::{CString, c_char, c_void};
    use std::os::unix::ffi::OsStringExt;
    use std::path::Path;
    use std::sync::mpsc;
    use std::time::Duration;

    unsafe extern "C" {
        fn posix_spawnattr_init(attr: *mut *mut c_void) -> i32;
        fn posix_spawnattr_destroy(attr: *mut *mut c_void) -> i32;
        fn posix_spawn(
            pid: *mut i32,
            path: *const c_char,
            file_actions: *const c_void,
            attrp: *const *mut c_void,
            argv: *const *mut c_char,
            envp: *const *mut c_char,
        ) -> i32;
        fn responsibility_spawnattrs_setdisclaim(attr: *mut *mut c_void, disclaim: u32) -> i32;
        fn waitpid(pid: i32, status: *mut i32, options: i32) -> i32;
    }

    use block2::RcBlock;
    use objc2::runtime::Bool;
    use objc2_av_foundation::{AVAuthorizationStatus, AVCaptureDevice, AVMediaTypeAudio};
    use objc2_foundation::{NSDate, NSDefaultRunLoopMode, NSRunLoop};
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
        let helper_src = parent.join("church-studio-transcribe");
        let helper_dst = macos_dir.join("church-studio-transcribe");
        if helper_src.exists() {
            let _ = refresh_binary(&helper_src, &helper_dst);
            let _ = std::process::Command::new("codesign")
                .args(["--force", "--sign", "-", "--identifier", "app.churchstudio.present.transcribe"])
                .arg(&helper_dst)
                .status();
        }
        let _ = std::process::Command::new("codesign")
            .args(["--force", "--sign", "-", "--identifier", "app.churchstudio.present"])
            .arg(&app)
            .status();
        // `open` failed with LaunchServices -600 while this binary was already running.
        // Start the bundle ourselves and disclaim Cursor, so the microphone dialog belongs to Church Studio.
        let _ = std::process::Command::new("pkill")
            .args(["-f", "Church Studio.app/Contents/MacOS/church-studio"])
            .status();
        match spawn_disclaimed(&bundled) {
            Ok(pid) => {
                log::info!("started {} ({pid}) for the microphone prompt", bundled.display());
                let mut status = 0;
                unsafe {
                    waitpid(pid, &mut status, 0);
                }
                std::process::exit(0);
            }
            Err(message) => log::error!("could not start the app bundle: {message}"),
        }
    }

    fn spawn_disclaimed(exe: &Path) -> Result<i32, String> {
        let path = CString::new(exe.as_os_str().as_encoded_bytes()).map_err(|e| e.to_string())?;
        let mut args = Vec::new();
        for arg in std::env::args_os() {
            args.push(CString::new(arg.as_encoded_bytes()).map_err(|e| e.to_string())?);
        }
        if let Some(first) = args.first_mut() {
            *first = CString::new(exe.as_os_str().as_encoded_bytes()).map_err(|e| e.to_string())?;
        }
        let mut argv: Vec<*mut c_char> = args.iter().map(|arg| arg.as_ptr() as *mut c_char).collect();
        argv.push(std::ptr::null_mut());
        let mut env_owned = Vec::new();
        for (key, value) in std::env::vars_os() {
            let mut pair = key.into_vec();
            pair.push(b'=');
            pair.extend(value.as_encoded_bytes());
            env_owned.push(CString::new(pair).map_err(|e| e.to_string())?);
        }
        let mut envp: Vec<*mut c_char> = env_owned.iter().map(|item| item.as_ptr() as *mut c_char).collect();
        envp.push(std::ptr::null_mut());
        unsafe {
            let mut attr: *mut c_void = std::ptr::null_mut();
            if posix_spawnattr_init(&mut attr) != 0 {
                return Err("Could not prepare the app launch.".into());
            }
            if responsibility_spawnattrs_setdisclaim(&mut attr, 1) != 0 {
                posix_spawnattr_destroy(&mut attr);
                return Err("Could not separate the app from Cursor.".into());
            }
            let mut pid = 0;
            let result = posix_spawn(&mut pid, path.as_ptr(), std::ptr::null(), &attr, argv.as_ptr(), envp.as_ptr());
            posix_spawnattr_destroy(&mut attr);
            if result != 0 {
                return Err(format!("Could not start Church Studio ({result})."));
            }
            Ok(pid)
        }
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

    struct TranscribeRun {
        child: std::process::Child,
        stdin: std::process::ChildStdin,
    }

    static TRANSCRIBE: std::sync::Mutex<Option<TranscribeRun>> = std::sync::Mutex::new(None);

    pub fn start_transcribe(app: tauri::AppHandle, run: u64) -> Result<(), String> {
        stop_transcribe();
        let path = std::env::current_exe()
            .ok()
            .and_then(|exe| exe.parent().map(|dir| dir.join("church-studio-transcribe")))
            .filter(|path| path.exists())
            .ok_or("The on-device transcriber was not built. Quit Church Studio and run npm run tauri dev again.")?;
        let mut child = std::process::Command::new(&path)
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::inherit())
            .spawn()
            .map_err(|error| format!("Could not start the on-device transcriber. {error}"))?;
        let stdout = child.stdout.take().ok_or("The transcriber produced no transcript stream.")?;
        let stdin = child.stdin.take().ok_or("The transcriber could not be stopped later.")?;
        std::thread::spawn(move || {
            use tauri::Emitter;
            let reader = std::io::BufReader::new(stdout);
            for line in std::io::BufRead::lines(reader) {
                let Ok(line) = line else { break };
                let _ = app.emit("listen-phrase", super::ListenLine { run, line });
            }
            let end = super::ListenLine { run, line: r#"{"kind":"end"}"#.into() };
            let _ = app.emit("listen-phrase", end);
        });
        let mut guard = TRANSCRIBE.lock().unwrap_or_else(|poison| poison.into_inner());
        *guard = Some(TranscribeRun { child, stdin });
        Ok(())
    }

    pub fn stop_transcribe() {
        let mut guard = TRANSCRIBE.lock().unwrap_or_else(|poison| poison.into_inner());
        let Some(mut run) = guard.take() else { return };
        drop(guard);
        let _ = std::io::Write::write_all(&mut run.stdin, b"stop\n");
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(300));
            let _ = run.child.kill();
            let _ = run.child.wait();
        });
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
        wait_for_dialog(&rx).map(|granted| if granted { "granted".into() } else { "denied".into() })
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
        match wait_for_dialog(&rx) {
            Ok(SFSpeechRecognizerAuthorizationStatus::Authorized) => Ok("granted".into()),
            Ok(_) => Ok("denied".into()),
            Err(message) => Err(message),
        }
    }

    /// The system permission dialog is delivered on the main thread. A blocking wait never lets it appear.
    fn wait_for_dialog<T>(rx: &mpsc::Receiver<T>) -> Result<T, String> {
        let run_loop = NSRunLoop::mainRunLoop();
        let start = std::time::Instant::now();
        loop {
            if let Ok(value) = rx.try_recv() {
                return Ok(value);
            }
            if start.elapsed() > Duration::from_secs(180) {
                return Err("The permission dialog was closed.".into());
            }
            let until = NSDate::dateWithTimeIntervalSinceNow(0.05);
            let _ = run_loop.runMode_beforeDate(unsafe { NSDefaultRunLoopMode }, &until);
        }
    }
}
