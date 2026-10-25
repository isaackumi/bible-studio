//! The network this computer is on, by name ("GraceChurch-5G"), for Settings › Screens: so a church
//! knows which Wi-Fi a TV must join to show the screen. macOS (and Windows 11) share a Wi-Fi name
//! only with apps allowed to use Location: until then the name is "hidden", and the desk can ask.

use serde::Serialize;

#[derive(Serialize, Debug, PartialEq)]
pub struct Network {
    /// "wifi", "wired" or "unknown".
    pub kind: &'static str,
    pub name: Option<String>,
    /// A Wi-Fi network whose name the system keeps back until Location is allowed.
    pub hidden: bool,
}

/// `ipconfig getsummary <interface>` on a Mac: the kind of link, and the SSID unless it is redacted.
fn read_mac_summary(text: &str) -> Network {
    let field = |key: &str| text.lines().find_map(|line| line.trim().strip_prefix(key).and_then(|rest| rest.trim_start().strip_prefix(':')).map(|value| value.trim().to_string()));
    match field("InterfaceType").as_deref() {
        Some("WiFi") => match field("SSID") {
            Some(name) if !name.is_empty() && name != "<redacted>" => Network { kind: "wifi", name: Some(name), hidden: false },
            _ => Network { kind: "wifi", name: None, hidden: true },
        },
        Some("Ethernet") => Network { kind: "wired", name: None, hidden: false },
        _ => Network { kind: "unknown", name: None, hidden: false },
    }
}

/// `netsh wlan show interfaces` on Windows: the connected SSID (not the BSSID), or why it is not given.
#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
fn read_netsh(text: &str) -> Network {
    let ssid = text.lines().find_map(|line| {
        let (key, value) = line.split_once(':')?;
        (key.trim() == "SSID").then(|| value.trim().to_string()).filter(|value| !value.is_empty())
    });
    match ssid {
        Some(name) => Network { kind: "wifi", name: Some(name), hidden: false },
        // Windows 11 asks for Location before it names the network.
        None if text.to_ascii_lowercase().contains("location") => Network { kind: "wifi", name: None, hidden: true },
        None => Network { kind: "unknown", name: None, hidden: false },
    }
}

/// `nmcli -t -f active,ssid dev wifi` on Linux: the line marked active.
#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
fn read_nmcli(text: &str) -> Network {
    match text.lines().find_map(|line| line.strip_prefix("yes:")).filter(|name| !name.is_empty()) {
        Some(name) => Network { kind: "wifi", name: Some(name.to_string()), hidden: false },
        None => Network { kind: "unknown", name: None, hidden: false },
    }
}

#[allow(dead_code)]
fn output(program: &str, args: &[&str]) -> Option<String> {
    let mut command = std::process::Command::new(program);
    command.args(args);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000); // no console window
    }
    let result = command.output().ok()?;
    Some(String::from_utf8_lossy(&result.stdout).into_owned())
}

/// The network this computer is on now.
#[tauri::command(async)]
pub fn network_name() -> Network {
    #[cfg(target_os = "macos")]
    {
        let interface = output("route", &["-n", "get", "default"]).and_then(|text| text.lines().find_map(|line| line.trim().strip_prefix("interface:").map(|name| name.trim().to_string())));
        let Some(interface) = interface else { return Network { kind: "unknown", name: None, hidden: false } };
        let mut network = read_mac_summary(&output("ipconfig", &["getsummary", &interface]).unwrap_or_default());
        if network.kind == "wifi" && network.name.is_none() {
            // Allowed to use Location: CoreWLAN names it.
            let name = unsafe { objc2_core_wlan::CWWiFiClient::sharedWiFiClient().interface().and_then(|wifi| wifi.ssid()).map(|ssid| ssid.to_string()) };
            if let Some(name) = name.filter(|name| !name.is_empty()) {
                network = Network { kind: "wifi", name: Some(name), hidden: false };
            }
        }
        network
    }
    #[cfg(target_os = "windows")]
    {
        read_netsh(&output("netsh", &["wlan", "show", "interfaces"]).unwrap_or_default())
    }
    #[cfg(target_os = "linux")]
    {
        read_nmcli(&output("nmcli", &["-t", "-f", "active,ssid", "dev", "wifi"]).unwrap_or_default())
    }
}

#[cfg(target_os = "macos")]
thread_local! {
    /// Kept while macOS asks, so the question is not dropped as soon as it appears.
    static LOCATION: std::cell::RefCell<Option<objc2::rc::Retained<objc2_core_location::CLLocationManager>>> = const { std::cell::RefCell::new(None) };
}

/// Ask to use Location, which is what lets the system say the Wi-Fi network's name (macOS). On
/// Windows the switch is in Settings › Privacy › Location: the desk opens that page instead.
#[tauri::command]
pub fn network_allow_location(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        return app
            .run_on_main_thread(|| {
                LOCATION.with(|kept| {
                    let manager = unsafe { objc2_core_location::CLLocationManager::new() };
                    unsafe { manager.requestWhenInUseAuthorization() };
                    *kept.borrow_mut() = Some(manager);
                });
            })
            .map_err(|error| error.to_string());
    }
    #[allow(unreachable_code)]
    {
        let _ = app;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_wifi_name_on_a_mac_or_says_it_is_hidden() {
        assert_eq!(read_mac_summary("<dictionary> {\n  InterfaceType : WiFi\n  SSID : GraceChurch-5G\n}"), Network { kind: "wifi", name: Some("GraceChurch-5G".into()), hidden: false });
        assert_eq!(read_mac_summary("  InterfaceType : WiFi\n  SSID : <redacted>\n"), Network { kind: "wifi", name: None, hidden: true });
        assert_eq!(read_mac_summary("  InterfaceType : Ethernet\n"), Network { kind: "wired", name: None, hidden: false });
    }

    #[test]
    fn reads_the_wifi_name_on_windows_not_the_access_points_address() {
        let text = "    Name                   : Wi-Fi\n    State                  : connected\n    SSID                   : Grace Church\n    BSSID                  : aa:bb:cc:dd:ee:ff\n";
        assert_eq!(read_netsh(text), Network { kind: "wifi", name: Some("Grace Church".into()), hidden: false });
        assert!(read_netsh("Network shell commands need location permission to access WLAN information.").hidden);
        assert_eq!(read_netsh("There is no wireless interface on the system.").kind, "unknown");
    }

    #[test]
    fn reads_the_active_wifi_on_linux() {
        assert_eq!(read_nmcli("no:Neighbours\nyes:Grace Church\n").name.as_deref(), Some("Grace Church"));
        assert_eq!(read_nmcli("no:Neighbours\n").name, None);
    }
}
