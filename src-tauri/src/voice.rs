use serde::Serialize;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ListenAccess {
    pub microphone: String,
    pub speech: String,
}

/// Open System Settings › Privacy at the microphone, or (`screen`) at Screen & System Audio Recording.
pub fn open_privacy_settings(pane: Option<&str>) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let anchor = if pane == Some("screen") { "Privacy_ScreenCapture" } else { "Privacy_Microphone" };
        std::process::Command::new("open")
            .arg(format!("x-apple.systempreferences:com.apple.preference.security?{anchor}"))
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = pane;
        Err("Privacy settings are opened on macOS.".into())
    }
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

/// `filter` is the Noise filter setting: "off", "light" or "strong". `words` are the church's own
/// words (names, places) for the recognizer to expect, beside the book names it always expects.
pub fn start_transcribe(app: tauri::AppHandle, run: u64, filter: &str, words: &[String]) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        macos::start_transcribe(app, run, crate::noise::Filter::parse(filter), &expected(words))
    }
    #[cfg(target_os = "windows")]
    {
        windows::start_transcribe(app, run, crate::noise::Filter::parse(filter), &expected(words))
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = (app, run, filter, words);
        Err("Listening runs on macOS and Windows.".into())
    }
}

/// The words to expect, one per line for the helper's CHURCH_STUDIO_WORDS: short, plain, at most 80.
#[cfg_attr(not(any(target_os = "macos", target_os = "windows")), allow(dead_code))]
fn expected(words: &[String]) -> String {
    words
        .iter()
        .map(|word| word.chars().filter(|c| !c.is_control()).take(60).collect::<String>().trim().to_string())
        .filter(|word| !word.is_empty())
        .take(80)
        .collect::<Vec<_>>()
        .join("\n")
}

pub fn stop_transcribe() {
    #[cfg(any(target_os = "macos", target_os = "windows"))]
    helper::stop();
}

/// The speech helper process, shared by macOS (Swift) and Windows (PowerShell): it prints one
/// JSON line per phrase, which is forwarded to the app as a `listen-phrase` event.
#[cfg(any(target_os = "macos", target_os = "windows"))]
mod helper {
    use std::time::Duration;

    struct Running {
        child: std::process::Child,
        /// Plain microphone mode: the helper hears the mic itself; "stop" goes down this pipe.
        stdin: Option<std::process::ChildStdin>,
        /// Filtered mode: this app captures and cleans the mic and streams it down stdin.
        feed: Option<crate::noise::Feed>,
    }

    static RUNNING: std::sync::Mutex<Option<Running>> = std::sync::Mutex::new(None);

    /// `feed`: the share of cleaned signal to stream to the helper (None = the helper uses the mic).
    pub fn start(app: tauri::AppHandle, run: u64, mut command: std::process::Command, feed: Option<f32>) -> Result<(), String> {
        stop();
        let mut child = command
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::inherit())
            .spawn()
            .map_err(|error| format!("Could not start the speech helper. {error}"))?;
        let stdout = child.stdout.take().ok_or("The speech helper produced no transcript stream.")?;
        let mut stdin = child.stdin.take().ok_or("The speech helper could not be stopped later.")?;
        let (stdin, feed) = match feed {
            None => (Some(stdin), None),
            Some(mix) => {
                let levels_app = app.clone();
                let started = crate::noise::start(
                    mix,
                    move |bytes| std::io::Write::write_all(&mut stdin, bytes).is_ok(),
                    move |_room, clean| {
                        use tauri::Emitter;
                        let line = format!(r#"{{"kind":"level","value":{:.3}}}"#, (clean * 4.0).min(1.0));
                        let _ = levels_app.emit("listen-phrase", super::ListenLine { run, line });
                    },
                );
                match started {
                    // The pipe moved into the feed; closing it is how the helper stops.
                    Ok(feed) => (None, Some(feed)),
                    Err(message) => {
                        let _ = child.kill();
                        let _ = child.wait();
                        return Err(message);
                    }
                }
            }
        };
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
        let mut guard = RUNNING.lock().unwrap_or_else(|poison| poison.into_inner());
        *guard = Some(Running { child, stdin, feed });
        Ok(())
    }

    pub fn stop() {
        let mut guard = RUNNING.lock().unwrap_or_else(|poison| poison.into_inner());
        let Some(mut running) = guard.take() else { return };
        drop(guard);
        // Closing the feed closes the helper's input, which ends it; otherwise ask it to stop.
        if let Some(feed) = running.feed.take() {
            feed.stop();
        }
        if let Some(stdin) = running.stdin.as_mut() {
            let _ = std::io::Write::write_all(stdin, b"stop\n");
        }
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(300));
            let _ = running.child.kill();
            let _ = running.child.wait();
        });
    }
}

/// Windows: the offline recognizer built into Windows, through a bundled PowerShell script.
#[cfg(target_os = "windows")]
mod windows {
    use tauri::Manager;

    /// With the filter on, the recognizer hears audio cleaned here instead of the microphone.
    pub fn start_transcribe(app: tauri::AppHandle, run: u64, filter: crate::noise::Filter, words: &str) -> Result<(), String> {
        let script = app
            .path()
            .resolve("resources/transcribe-windows.ps1", tauri::path::BaseDirectory::Resource)
            .ok()
            .filter(|path| path.exists())
            .ok_or("The Windows speech helper is missing from this install. Reinstall Church Studio.")?;
        let mut command = std::process::Command::new("powershell.exe");
        command.args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File"]).arg(script);
        command.env("CHURCH_STUDIO_WORDS", words);
        if filter != crate::noise::Filter::Off {
            command.arg("-Stdin");
        }
        {
            use std::os::windows::process::CommandExt;
            // No console window flashing up behind the desk.
            command.creation_flags(0x0800_0000);
        }
        let feed = (filter != crate::noise::Filter::Off).then(|| filter.mix());
        super::helper::start(app, run, command, feed)
    }
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
        // Helpers live beside the app binary so macOS attributes their permissions to Church Studio.
        for (name, identifier) in [
            ("church-studio-transcribe", "app.churchstudio.present.transcribe"),
            ("church-studio-ndi", "app.churchstudio.present.ndi"),
        ] {
            let helper_src = parent.join(name);
            let helper_dst = macos_dir.join(name);
            if helper_src.exists() {
                let _ = refresh_binary(&helper_src, &helper_dst);
                let _ = std::process::Command::new("codesign")
                    .args(["--force", "--sign", "-", "--identifier", identifier])
                    .arg(&helper_dst)
                    .status();
            }
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

    /// With the filter on, the helper hears audio cleaned here instead of the microphone.
    pub fn start_transcribe(app: tauri::AppHandle, run: u64, filter: crate::noise::Filter, words: &str) -> Result<(), String> {
        let path = std::env::current_exe()
            .ok()
            .and_then(|exe| exe.parent().map(|dir| dir.join("church-studio-transcribe")))
            .filter(|path| path.exists())
            .ok_or("The on-device transcriber was not built. Quit Church Studio and run npm run tauri dev again.")?;
        let mut command = std::process::Command::new(&path);
        command.env("CHURCH_STUDIO_WORDS", words);
        let feed = (filter != crate::noise::Filter::Off).then(|| filter.mix());
        if feed.is_some() {
            command.env("CHURCH_STUDIO_AUDIO", "stdin");
        }
        super::helper::start(app, run, command, feed)
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
