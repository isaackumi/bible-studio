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

pub fn request_access() -> Result<ListenAccess, String> {
    #[cfg(target_os = "macos")]
    {
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
    use std::sync::mpsc;
    use std::time::Duration;

    use block2::RcBlock;
    use objc2::runtime::Bool;
    use objc2_av_foundation::{AVAuthorizationStatus, AVCaptureDevice, AVMediaTypeAudio};
    use objc2_speech::{SFSpeechRecognizer, SFSpeechRecognizerAuthorizationStatus};

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
