// Sound outputs: the computer's speakers, a USB interface to the church's mixer, a display's own
// audio over HDMI or DisplayPort. The desk lists them (with how each is connected, so it can tell
// the operator's laptop from the church's sound system) and chooses where the congregation hears
// Church Studio.
//
// On a Mac the choice is made by setting the Mac's sound output (Core Audio's default output
// device): it is the one route that carries everything Church Studio plays, music on the desk and
// videos and YouTube on the audience screens alike. The output the Mac had before is put back when
// Church Studio quits, if it is still the one Church Studio chose. On Windows the list comes from
// WASAPI (through cpal) and the web view sends the music to the chosen output itself.

use serde::Serialize;

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AudioOutput {
    /// Stable for the device across restarts and reconnections (Core Audio's UID; the name on Windows).
    pub id: String,
    /// The name the computer gives it, as the operator sees it in the computer's own settings.
    pub name: String,
    /// "built-in", "usb", "hdmi", "displayport", "thunderbolt", "firewire", "pci", "bluetooth",
    /// "airplay", "virtual", "aggregate" or "unknown".
    pub transport: String,
    /// The computer's sound output now.
    pub is_default: bool,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AudioOutputs {
    pub outputs: Vec<AudioOutput>,
    /// Church Studio can make an output the computer's sound output (a Mac).
    pub can_set_default: bool,
}

/// Off the main thread: reading the outputs can take a moment (Bluetooth, a sleeping HDMI screen).
#[tauri::command(async)]
pub fn audio_outputs() -> AudioOutputs {
    AudioOutputs { outputs: platform::outputs(), can_set_default: cfg!(any(target_os = "macos", target_os = "windows")) }
}

/// Make this output the computer's sound output (a Mac, or Windows). The first change remembers what was there.
#[tauri::command(async)]
pub fn set_audio_output(id: String) -> Result<(), String> {
    platform::set_default(&id)
}

/// At quit: the Mac's sound output back to what it was, unless someone has changed it since.
pub fn restore() {
    platform::restore();
}

#[cfg(target_os = "macos")]
mod platform {
    use super::AudioOutput;
    use coreaudio_sys::*;
    use std::ffi::c_void;
    use std::sync::Mutex;

    /// (what the Mac had, what Church Studio set), by UID, from the first change.
    static CHANGED: Mutex<Option<(String, String)>> = Mutex::new(None);

    fn address(selector: u32, scope: u32) -> AudioObjectPropertyAddress {
        AudioObjectPropertyAddress { mSelector: selector, mScope: scope, mElement: kAudioObjectPropertyElementMaster }
    }

    fn get<T: Copy + Default>(object: AudioObjectID, selector: u32, scope: u32) -> Option<T> {
        let address = address(selector, scope);
        let mut value = T::default();
        let mut size = std::mem::size_of::<T>() as u32;
        let status = unsafe { AudioObjectGetPropertyData(object, &address, 0, std::ptr::null(), &mut size, &mut value as *mut T as *mut c_void) };
        (status == 0).then_some(value)
    }

    fn string(object: AudioObjectID, selector: u32) -> Option<String> {
        let reference: CFStringRef = get::<usize>(object, selector, kAudioObjectPropertyScopeGlobal)? as CFStringRef;
        if reference.is_null() {
            return None;
        }
        let mut buffer = [0 as std::os::raw::c_char; 512];
        let ok = unsafe { CFStringGetCString(reference, buffer.as_mut_ptr(), buffer.len() as _, kCFStringEncodingUTF8) };
        unsafe { CFRelease(reference as CFTypeRef) };
        if ok == 0 {
            return None;
        }
        Some(unsafe { std::ffi::CStr::from_ptr(buffer.as_ptr()) }.to_string_lossy().into_owned())
    }

    fn devices() -> Vec<AudioObjectID> {
        let address = address(kAudioHardwarePropertyDevices, kAudioObjectPropertyScopeGlobal);
        let mut size = 0u32;
        if unsafe { AudioObjectGetPropertyDataSize(kAudioObjectSystemObject, &address, 0, std::ptr::null(), &mut size) } != 0 {
            return Vec::new();
        }
        let mut ids = vec![0 as AudioObjectID; size as usize / std::mem::size_of::<AudioObjectID>()];
        let status = unsafe { AudioObjectGetPropertyData(kAudioObjectSystemObject, &address, 0, std::ptr::null(), &mut size, ids.as_mut_ptr() as *mut c_void) };
        if status != 0 {
            return Vec::new();
        }
        ids.truncate(size as usize / std::mem::size_of::<AudioObjectID>());
        ids
    }

    /// A device can play sound when it has output streams (a microphone has none).
    fn plays(device: AudioObjectID) -> bool {
        let address = address(kAudioDevicePropertyStreams, kAudioObjectPropertyScopeOutput);
        let mut size = 0u32;
        unsafe { AudioObjectGetPropertyDataSize(device, &address, 0, std::ptr::null(), &mut size) == 0 && size > 0 }
    }

    fn transport(device: AudioObjectID) -> &'static str {
        #[allow(non_upper_case_globals)]
        match get::<u32>(device, kAudioDevicePropertyTransportType, kAudioObjectPropertyScopeGlobal).unwrap_or(0) {
            kAudioDeviceTransportTypeBuiltIn => "built-in",
            kAudioDeviceTransportTypeUSB => "usb",
            kAudioDeviceTransportTypeHDMI => "hdmi",
            kAudioDeviceTransportTypeDisplayPort => "displayport",
            kAudioDeviceTransportTypeThunderbolt => "thunderbolt",
            kAudioDeviceTransportTypeFireWire => "firewire",
            kAudioDeviceTransportTypePCI => "pci",
            kAudioDeviceTransportTypeBluetooth | kAudioDeviceTransportTypeBluetoothLE => "bluetooth",
            kAudioDeviceTransportTypeAirPlay => "airplay",
            kAudioDeviceTransportTypeVirtual => "virtual",
            kAudioDeviceTransportTypeAggregate | kAudioDeviceTransportTypeAutoAggregate => "aggregate",
            _ => "unknown",
        }
    }

    fn default_device() -> Option<AudioObjectID> {
        get::<AudioObjectID>(kAudioObjectSystemObject, kAudioHardwarePropertyDefaultOutputDevice, kAudioObjectPropertyScopeGlobal)
    }

    pub fn outputs() -> Vec<AudioOutput> {
        let default = default_device();
        devices()
            .into_iter()
            .filter(|&device| plays(device))
            .filter_map(|device| {
                let id = string(device, kAudioDevicePropertyDeviceUID)?;
                let name = string(device, kAudioObjectPropertyName).unwrap_or_else(|| id.clone());
                Some(AudioOutput { id, name, transport: transport(device).into(), is_default: Some(device) == default })
            })
            .collect()
    }

    fn device_by_uid(uid: &str) -> Option<AudioObjectID> {
        devices().into_iter().find(|&device| plays(device) && string(device, kAudioDevicePropertyDeviceUID).as_deref() == Some(uid))
    }

    fn make_default(device: AudioObjectID) -> Result<(), String> {
        let address = address(kAudioHardwarePropertyDefaultOutputDevice, kAudioObjectPropertyScopeGlobal);
        let status = unsafe { AudioObjectSetPropertyData(kAudioObjectSystemObject, &address, 0, std::ptr::null(), std::mem::size_of::<AudioObjectID>() as u32, &device as *const AudioObjectID as *const c_void) };
        if status == 0 { Ok(()) } else { Err(format!("The Mac did not switch its sound output (Core Audio {status}).")) }
    }

    pub fn set_default(uid: &str) -> Result<(), String> {
        let device = device_by_uid(uid).ok_or("That sound output is not connected.")?;
        let before = default_device().and_then(|current| string(current, kAudioDevicePropertyDeviceUID));
        if before.as_deref() == Some(uid) {
            return Ok(());
        }
        make_default(device)?;
        let mut changed = CHANGED.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        match changed.as_mut() {
            Some((_, set)) => *set = uid.to_string(),
            None => *changed = before.map(|before| (before, uid.to_string())),
        }
        log::info!("Sound output set to {uid}");
        Ok(())
    }

    pub fn restore() {
        let Some((before, set)) = CHANGED.lock().ok().and_then(|mut changed| changed.take()) else { return };
        let now = default_device().and_then(|current| string(current, kAudioDevicePropertyDeviceUID));
        if now.as_deref() != Some(set.as_str()) {
            return;
        }
        if let Some(device) = device_by_uid(&before) {
            let _ = make_default(device);
        }
    }
}

#[cfg(target_os = "windows")]
mod platform {
    //! Windows' own list of sound outputs (the MMDevice API): each output's name, the adapter it
    //! belongs to and its form factor, read without opening the device. The default output is set
    //! through IPolicyConfig, which Windows' own Sound settings use; it is not in the SDK, but it has
    //! kept the same shape since Windows 7 and tools like EarTrumpet and SoundSwitch rely on it.
    #![allow(non_snake_case)]
    use super::AudioOutput;
    use std::ffi::c_void;
    use std::sync::Mutex;
    use windows::core::{interface, Interface, IUnknown, IUnknown_Vtbl, GUID, HRESULT, PCWSTR, PWSTR};
    use windows::Win32::Devices::FunctionDiscovery::PKEY_Device_FriendlyName;
    use windows::Win32::Foundation::PROPERTYKEY;
    use windows::Win32::Media::Audio::{eCommunications, eConsole, eMultimedia, eRender, ERole, IMMDevice, IMMDeviceEnumerator, MMDeviceEnumerator, PKEY_AudioEndpoint_FormFactor, DEVICE_STATE_ACTIVE};
    use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CoTaskMemFree, CLSCTX_ALL, COINIT_MULTITHREADED, STGM_READ};

    // The method names and order are the interface's own (its table of functions), so they stay as
    // Windows has them (non_snake_case is allowed for this module).
    #[interface("f8679f50-850a-41cf-9c72-430f290290c8")]
    unsafe trait IPolicyConfig: IUnknown {
        fn GetMixFormat(&self, device: PCWSTR, format: *mut *mut c_void) -> HRESULT;
        fn GetDeviceFormat(&self, device: PCWSTR, default: i32, format: *mut *mut c_void) -> HRESULT;
        fn ResetDeviceFormat(&self, device: PCWSTR) -> HRESULT;
        fn SetDeviceFormat(&self, device: PCWSTR, endpoint: *mut c_void, mix: *mut c_void) -> HRESULT;
        fn GetProcessingPeriod(&self, device: PCWSTR, default: i32, default_period: *mut i64, minimum: *mut i64) -> HRESULT;
        fn SetProcessingPeriod(&self, device: PCWSTR, period: *mut i64) -> HRESULT;
        fn GetShareMode(&self, device: PCWSTR, mode: *mut c_void) -> HRESULT;
        fn SetShareMode(&self, device: PCWSTR, mode: *mut c_void) -> HRESULT;
        fn GetPropertyValue(&self, device: PCWSTR, fx: i32, key: *const PROPERTYKEY, value: *mut c_void) -> HRESULT;
        fn SetPropertyValue(&self, device: PCWSTR, fx: i32, key: *const PROPERTYKEY, value: *mut c_void) -> HRESULT;
        fn SetDefaultEndpoint(&self, device: PCWSTR, role: ERole) -> HRESULT;
        fn SetEndpointVisibility(&self, device: PCWSTR, visible: i32) -> HRESULT;
    }
    const CLSID_POLICY_CONFIG: GUID = GUID::from_u128(0x870af99c_171d_4f9e_af0d_e63df40c2bc9);
    /// The adapter an output belongs to ("USB Audio CODEC", "NVIDIA High Definition Audio").
    const PKEY_DEVICE_INTERFACE_FRIENDLY_NAME: PROPERTYKEY = PROPERTYKEY { fmtid: GUID::from_u128(0x026e516e_b814_414b_83cd_856d6fef4822), pid: 2 };
    /// EndpointFormFactor: a display's own audio (HDMI or DisplayPort).
    const DIGITAL_AUDIO_DISPLAY_DEVICE: u32 = 9;

    /// (what Windows had, what Church Studio set), by endpoint id, from the first change.
    static CHANGED: Mutex<Option<(String, String)>> = Mutex::new(None);

    fn enumerator() -> Option<IMMDeviceEnumerator> {
        unsafe {
            // Any thread a command runs on: an apartment of its own, or the one it already has.
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
            CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL).ok()
        }
    }

    fn take(text: PWSTR) -> Option<String> {
        if text.is_null() {
            return None;
        }
        let value = unsafe { text.to_string() }.ok();
        unsafe { CoTaskMemFree(Some(text.0 as *const c_void)) };
        value
    }

    fn id_of(device: &IMMDevice) -> Option<String> {
        take(unsafe { device.GetId() }.ok()?)
    }

    fn default_id(enumerator: &IMMDeviceEnumerator) -> Option<String> {
        id_of(&unsafe { enumerator.GetDefaultAudioEndpoint(eRender, eConsole) }.ok()?)
    }

    /// How an output is connected, from its form factor and its name and adapter's.
    pub(super) fn transport(name: &str, adapter: &str, form: u32) -> &'static str {
        if form == DIGITAL_AUDIO_DISPLAY_DEVICE {
            return if format!("{name} {adapter}").to_lowercase().contains("displayport") { "displayport" } else { "hdmi" };
        }
        let named = by_name(&format!("{name} ({adapter})"));
        if named != "unknown" {
            return named;
        }
        by_name(adapter)
    }

    /// WASAPI names say how a device is connected ("Speakers (Realtek…)", "DELL U2415 (NVIDIA High
    /// Definition Audio)", "Speakers (USB Audio CODEC)").
    pub(super) fn by_name(name: &str) -> &'static str {
        let lower = name.to_lowercase();
        if lower.contains("bluetooth") || lower.contains("hands-free") || lower.contains("headset (") {
            "bluetooth"
        } else if lower.contains("usb") || lower.contains("focusrite") || lower.contains("behringer") || lower.contains("scarlett") || lower.contains("audient") || lower.contains("presonus") || lower.contains("motu") || lower.contains("yamaha") || lower.contains("allen & heath") {
            "usb"
        } else if lower.contains("hdmi") || lower.contains("nvidia high definition") || lower.contains("amd high definition") || lower.contains("intel(r) display audio") {
            "hdmi"
        } else if lower.contains("displayport") {
            "displayport"
        } else if lower.contains("virtual") || lower.contains("cable") || lower.contains("voicemeeter") || lower.contains("steam streaming") || lower.contains("teams") {
            "virtual"
        } else if lower.contains("realtek") || lower.contains("speakers (") || lower.contains("conexant") || lower.contains("intel(r) smart sound") {
            "built-in"
        } else {
            "unknown"
        }
    }

    pub fn outputs() -> Vec<AudioOutput> {
        let Some(enumerator) = enumerator() else { return Vec::new() };
        let default = default_id(&enumerator);
        let Ok(collection) = (unsafe { enumerator.EnumAudioEndpoints(eRender, DEVICE_STATE_ACTIVE) }) else { return Vec::new() };
        let count = unsafe { collection.GetCount() }.unwrap_or(0);
        (0..count)
            .filter_map(|index| {
                let device = unsafe { collection.Item(index) }.ok()?;
                let id = id_of(&device)?;
                let store = unsafe { device.OpenPropertyStore(STGM_READ) }.ok()?;
                let text = |key: &PROPERTYKEY| unsafe { store.GetValue(key) }.ok().map(|value| value.to_string()).filter(|value| !value.is_empty());
                let name = text(&PKEY_Device_FriendlyName).unwrap_or_else(|| id.clone());
                let adapter = text(&PKEY_DEVICE_INTERFACE_FRIENDLY_NAME).unwrap_or_default();
                let form = unsafe { store.GetValue(&PKEY_AudioEndpoint_FormFactor) }.ok().and_then(|value| u32::try_from(&value).ok()).unwrap_or(10);
                Some(AudioOutput { is_default: Some(&id) == default.as_ref(), transport: transport(&name, &adapter, form).into(), id, name })
            })
            .collect()
    }

    fn make_default(id: &str) -> Result<(), String> {
        let _ = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };
        let policy: IPolicyConfig = unsafe { CoCreateInstance(&CLSID_POLICY_CONFIG, None, CLSCTX_ALL) }.map_err(|error| format!("Windows did not let Church Studio choose the sound output ({error})."))?;
        let wide: Vec<u16> = id.encode_utf16().chain(std::iter::once(0)).collect();
        // Everyday sound and media; calls (the communications default) are left as they are.
        for role in [eConsole, eMultimedia] {
            unsafe { policy.SetDefaultEndpoint(PCWSTR(wide.as_ptr()), role) }.ok().map_err(|error| format!("Windows did not switch its sound output ({error})."))?;
        }
        let _ = eCommunications;
        Ok(())
    }

    pub fn set_default(id: &str) -> Result<(), String> {
        let enumerator = enumerator().ok_or("Windows' sound outputs could not be read.")?;
        if !outputs().iter().any(|output| output.id == id) {
            return Err("That sound output is not connected.".into());
        }
        let before = default_id(&enumerator);
        if before.as_deref() == Some(id) {
            return Ok(());
        }
        make_default(id)?;
        let mut changed = CHANGED.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        match changed.as_mut() {
            Some((_, set)) => *set = id.to_string(),
            None => *changed = before.map(|before| (before, id.to_string())),
        }
        log::info!("Sound output set to {id}");
        Ok(())
    }

    pub fn restore() {
        let Some((before, set)) = CHANGED.lock().ok().and_then(|mut changed| changed.take()) else { return };
        let Some(enumerator) = enumerator() else { return };
        if default_id(&enumerator).as_deref() != Some(set.as_str()) {
            return;
        }
        if outputs().iter().any(|output| output.id == before) {
            let _ = make_default(&before);
        }
    }

    #[allow(dead_code)]
    fn _assert_interface(policy: &IPolicyConfig) -> IUnknown {
        policy.cast().expect("an IPolicyConfig is an IUnknown")
    }
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
mod platform {
    use super::AudioOutput;

    pub fn outputs() -> Vec<AudioOutput> {
        Vec::new()
    }

    pub fn set_default(_id: &str) -> Result<(), String> {
        Err("Choose the sound output in the computer's settings.".into())
    }

    pub fn restore() {}
}

#[cfg(test)]
mod tests {
    #[cfg(target_os = "macos")]
    #[test]
    fn lists_this_macs_outputs_with_one_default() {
        let outputs = super::platform::outputs();
        // A Mac always has an output (its speakers, or a virtual one on a build machine).
        assert!(!outputs.is_empty());
        assert!(outputs.iter().filter(|output| output.is_default).count() <= 1);
        assert!(outputs.iter().all(|output| !output.id.is_empty() && !output.name.is_empty()));
    }

    /// Switches this Mac's sound output to another connected output and back (run by hand: --ignored).
    #[cfg(target_os = "macos")]
    #[test]
    #[ignore]
    fn switches_the_macs_output_and_puts_it_back() {
        let outputs = super::platform::outputs();
        let before = outputs.iter().find(|output| output.is_default).expect("a default output").clone();
        let Some(other) = outputs.iter().find(|output| !output.is_default && output.transport != "virtual") else { return };
        super::platform::set_default(&other.id).expect("switched");
        let now = super::platform::outputs();
        assert_eq!(now.iter().find(|output| output.is_default).map(|output| output.id.clone()), Some(other.id.clone()));
        eprintln!("switched {} -> {}", before.name, other.name);
        super::platform::restore();
        let after = super::platform::outputs();
        assert_eq!(after.iter().find(|output| output.is_default).map(|output| output.id.clone()), Some(before.id.clone()));
        eprintln!("restored {}", before.name);
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn reads_how_a_windows_output_is_connected() {
        use super::platform::{by_name, transport};
        assert_eq!(by_name("Speakers (Realtek(R) Audio)"), "built-in");
        assert_eq!(by_name("DELL U2415 (NVIDIA High Definition Audio)"), "hdmi");
        assert_eq!(by_name("Speakers (Focusrite USB Audio)"), "usb");
        assert_eq!(by_name("CABLE Input (VB-Audio Virtual Cable)"), "virtual");
        assert_eq!(transport("DELL U2415", "NVIDIA High Definition Audio", 9), "hdmi");
        assert_eq!(transport("Speakers", "USB Audio CODEC", 1), "usb");
    }
}
