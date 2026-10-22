//! The plan this computer runs on, decided here in the app's native core rather than in the
//! webview: only a lease signed by the license server (src/lib/domain/lease.ts) grants Premium or
//! Church, the lease must be for this computer's hardware, and a clock set back before the last
//! moment this computer is known to have seen is refused. Paid native features (NDI, streaming,
//! recording, the phone remote) ask `require` before they start.
//!
//! What is saved (entitlement.json in the app data folder) holds nothing secret: the lease is
//! signed, so editing the file cannot make or extend a lease. The file's `seen` time can be wound
//! back by hand, which with the clock set back stretches a lease until its `renewBy` at most; the
//! server checks the plan itself at every renewal.

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use ring::signature::{UnparsedPublicKey, ED25519};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager, State};

/// Church Studio's license public key (Ed25519, hex). The same key as src/lib/domain/license.ts.
const PUBLIC_KEY: &str = "8014f76328f5296fa6c0458aecdf5cfc17073eed8998b145b1abf73502536132";
/// The public key of the RFC 8032 test vector: the license server signs test-mode purchases with
/// its secret half. Development builds accept it; release builds never do, so a test purchase
/// cannot unlock a shipped copy.
const TEST_PUBLIC_KEY: &str = "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a";

/// Read a lease under every key this build trusts.
fn read_trusted(token: &str) -> Option<Lease> {
    read_lease(token, PUBLIC_KEY).or_else(|| if cfg!(debug_assertions) { read_lease(token, TEST_PUBLIC_KEY) } else { None })
}

/// A clock this far behind the last known time is treated as set back.
const CLOCK_SLACK_MS: u64 = 60 * 60 * 1000;

#[derive(Deserialize, Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Lease {
    pub v: u8,
    pub kind: String,
    pub plan: String,
    pub device: String,
    pub license: Option<String>,
    #[serde(default)]
    pub holder: String,
    pub issued_at: u64,
    pub renew_by: u64,
    pub ends_at: Option<u64>,
}

#[derive(Default, Serialize, Deserialize)]
struct Saved {
    lease: Option<String>,
    /// The latest time this computer is known to have reached (epoch ms).
    seen: u64,
}

#[derive(Default)]
pub struct Entitlement(Mutex<Saved>);

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

fn hex_bytes(text: &str) -> Vec<u8> {
    (0..text.len() / 2).filter_map(|i| u8::from_str_radix(&text[i * 2..i * 2 + 2], 16).ok()).collect()
}

/// Read and check a lease token. None unless it is well formed and signed by Church Studio.
pub fn read_lease(token: &str, public_key_hex: &str) -> Option<Lease> {
    let mut parts = token.trim().split('.');
    let (prefix, body, signature) = (parts.next()?, parts.next()?, parts.next()?);
    if prefix != "CSL1" || parts.next().is_some() {
        return None;
    }
    let body = URL_SAFE_NO_PAD.decode(body).ok()?;
    let signature = URL_SAFE_NO_PAD.decode(signature).ok()?;
    UnparsedPublicKey::new(&ED25519, hex_bytes(public_key_hex)).verify(&body, &signature).ok()?;
    let lease: Lease = serde_json::from_slice(&body).ok()?;
    let plan_ok = lease.plan == "premium" || lease.plan == "church";
    let kind_ok = lease.kind == "license" || lease.kind == "trial";
    (lease.v == 1 && plan_ok && kind_ok).then_some(lease)
}

/// What a lease gives this computer now: ("premium" | "church", None) or ("free", reason).
pub fn standing(lease: Option<&Lease>, device: &str, now: u64, seen: u64) -> (&'static str, Option<&'static str>) {
    let Some(lease) = lease else { return ("free", Some("none")) };
    if lease.device != device {
        return ("free", Some("device"));
    }
    if now + CLOCK_SLACK_MS < seen.max(lease.issued_at) {
        return ("free", Some("clock"));
    }
    if lease.ends_at.is_some_and(|end| now >= end) {
        return ("free", Some("ended"));
    }
    if now >= lease.renew_by {
        return ("free", Some("renew"));
    }
    (if lease.plan == "church" { "church" } else { "premium" }, None)
}

/// This computer's id: a hash of the machine's own hardware id, so it survives reinstalling the app
/// (one trial per computer) and says nothing about the machine itself.
pub fn device_id() -> &'static str {
    DEVICE.get_or_init(|| hashed(&hardware_id().unwrap_or_else(|| uuid::Uuid::new_v4().to_string())))
}

static DEVICE: OnceLock<String> = OnceLock::new();

fn hashed(raw: &str) -> String {
    let digest = Sha256::digest(format!("church-studio:{raw}").as_bytes());
    digest.iter().take(16).map(|byte| format!("{byte:02x}")).collect()
}

/// At start: the hardware id, or (when the machine will not say) a random id kept in the app data
/// folder, so this computer's id never changes between runs and its lease stays valid.
fn init_device(app: &AppHandle) {
    let raw = hardware_id().unwrap_or_else(|| {
        let path = app.path().app_data_dir().ok().map(|dir| dir.join("device-id"));
        let saved = path.as_ref().and_then(|path| std::fs::read_to_string(path).ok()).map(|text| text.trim().to_string()).filter(|text| !text.is_empty());
        saved.unwrap_or_else(|| {
            let made = uuid::Uuid::new_v4().to_string();
            if let Some(path) = path {
                let _ = path.parent().map(std::fs::create_dir_all);
                let _ = std::fs::write(path, &made);
            }
            made
        })
    });
    let _ = DEVICE.set(hashed(&raw));
}

#[cfg(target_os = "macos")]
fn hardware_id() -> Option<String> {
    let output = std::process::Command::new("/usr/sbin/ioreg").args(["-rd1", "-c", "IOPlatformExpertDevice"]).output().ok()?;
    let text = String::from_utf8_lossy(&output.stdout);
    let line = text.lines().find(|line| line.contains("IOPlatformUUID"))?;
    line.split('"').nth(3).map(str::to_string)
}

#[cfg(target_os = "windows")]
fn hardware_id() -> Option<String> {
    let output = std::process::Command::new("reg").args(["query", r"HKLM\SOFTWARE\Microsoft\Cryptography", "/v", "MachineGuid"]).output().ok()?;
    String::from_utf8_lossy(&output.stdout).split_whitespace().last().map(str::to_string)
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn hardware_id() -> Option<String> {
    ["/etc/machine-id", "/var/lib/dbus/machine-id"].iter().find_map(|path| std::fs::read_to_string(path).ok()).map(|text| text.trim().to_string()).filter(|text| !text.is_empty())
}

fn file(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_data_dir().ok().map(|dir| dir.join("entitlement.json"))
}

/// Load what was saved (at start).
pub fn load(app: &AppHandle) -> Entitlement {
    init_device(app);
    let saved = file(app).and_then(|path| std::fs::read_to_string(path).ok()).and_then(|text| serde_json::from_str::<Saved>(&text).ok()).unwrap_or_default();
    Entitlement(Mutex::new(saved))
}

fn persist(app: &AppHandle, saved: &Saved) {
    if let Some(path) = file(app) {
        if let Some(dir) = path.parent() {
            let _ = std::fs::create_dir_all(dir);
        }
        // Written beside it, then swapped in: a crash mid-write never leaves half a file, which
        // would read as no license at all and drop an offline church to Free.
        if let Ok(text) = serde_json::to_string(saved) {
            let temp = path.with_extension("json.tmp");
            if std::fs::write(&temp, text).is_ok() {
                let _ = std::fs::rename(&temp, &path);
            }
        }
    }
}

fn status_of(saved: &Saved) -> Value {
    let lease = saved.lease.as_deref().and_then(read_trusted);
    let now = now_ms();
    let (plan, reason) = standing(lease.as_ref(), device_id(), now, saved.seen);
    json!({
        "plan": plan,
        "reason": reason,
        "device": device_id(),
        "kind": lease.as_ref().map(|l| l.kind.clone()),
        "leasePlan": lease.as_ref().map(|l| l.plan.clone()),
        "license": lease.as_ref().and_then(|l| l.license.clone()),
        "holder": lease.as_ref().map(|l| l.holder.clone()).unwrap_or_default(),
        "endsAt": lease.as_ref().and_then(|l| l.ends_at),
        "renewBy": lease.as_ref().map(|l| l.renew_by),
        "issuedAt": lease.as_ref().map(|l| l.issued_at),
    })
}

/// Raise the latest known time (never lower it) and save when it moved.
fn note_seen(app: &AppHandle, saved: &mut Saved, at: u64) {
    if at > saved.seen {
        saved.seen = at;
        persist(app, saved);
    }
}

/// The plan now (and why it is Free, if it is).
#[tauri::command]
pub fn entitlement_status(app: AppHandle, state: State<Entitlement>) -> Value {
    let mut saved = state.0.lock().unwrap_or_else(|poison| poison.into_inner());
    let status = status_of(&saved);
    // A clock that is not set back moves the known time forward.
    if status["reason"] != "clock" {
        note_seen(&app, &mut saved, now_ms());
    }
    status
}

/// Keep a lease from the server. Refused unless it is signed, for this computer, and not older
/// than the one kept already.
#[tauri::command]
pub fn entitlement_set(app: AppHandle, state: State<Entitlement>, token: String) -> Result<Value, String> {
    let lease = read_trusted(&token).ok_or("That is not a lease from Church Studio.")?;
    if lease.device != device_id() {
        return Err("That lease is for another computer.".into());
    }
    let mut saved = state.0.lock().unwrap_or_else(|poison| poison.into_inner());
    let current = saved.lease.as_deref().and_then(read_trusted);
    let newer = current.as_ref().is_none_or(|current| lease.issued_at > current.issued_at || current.device != lease.device);
    if newer {
        // A new lease carries the server's time, which outranks any earlier reading of this
        // computer's clock: a clock that once ran ahead does not lock the church out.
        // Only a newer lease does this, so handing back an old one cannot wind `seen` back.
        saved.seen = lease.issued_at;
        saved.lease = Some(token);
    } else {
        saved.seen = saved.seen.max(lease.issued_at);
    }
    persist(&app, &saved);
    Ok(status_of(&saved))
}

/// The server's clock from a check-in: the known time never trails it.
#[tauri::command]
pub fn entitlement_note_time(app: AppHandle, state: State<Entitlement>, at: u64) -> Value {
    let mut saved = state.0.lock().unwrap_or_else(|poison| poison.into_inner());
    note_seen(&app, &mut saved, at);
    status_of(&saved)
}

/// Back to Free on this computer (Remove license).
#[tauri::command]
pub fn entitlement_clear(app: AppHandle, state: State<Entitlement>) -> Value {
    let mut saved = state.0.lock().unwrap_or_else(|poison| poison.into_inner());
    saved.lease = None;
    persist(&app, &saved);
    status_of(&saved)
}

/// This computer's id, for the server.
#[tauri::command]
pub fn entitlement_device() -> Value {
    json!({ "device": device_id() })
}

/// For native commands: an error unless this computer's plan includes `need` ("premium" or "church").
pub fn require(app: &AppHandle, need: &str, feature: &str) -> Result<(), String> {
    let state = app.state::<Entitlement>();
    let saved = state.0.lock().unwrap_or_else(|poison| poison.into_inner());
    let plan = status_of(&saved)["plan"].as_str().unwrap_or("free").to_string();
    let rank = |plan: &str| match plan {
        "church" => 2,
        "premium" => 1,
        _ => 0,
    };
    // Development builds take the desk's test codes (PREMIUM-TEST, CHURCH-TEST), which never reach
    // this core, so paid native features can be tried there; release builds check the lease.
    if rank(&plan) >= rank(need) || cfg!(debug_assertions) {
        Ok(())
    } else {
        Err(format!("{feature} is part of the {} plan.", if need == "church" { "Church" } else { "Premium" }))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // A lease made by the TypeScript signer (src/lib/domain/lease.ts) with a test key, so both
    // sides are checked against the same bytes.
    const TEST_PUBLIC: &str = TEST_PUBLIC_KEY;

    fn sample() -> Lease {
        Lease { v: 1, kind: "license".into(), plan: "church".into(), device: "dev-1".into(), license: Some("abcd1234".into()), holder: String::new(), issued_at: 1_000, renew_by: 10_000, ends_at: Some(20_000) }
    }

    #[test]
    fn standing_follows_device_time_and_clock() {
        let lease = sample();
        assert_eq!(standing(Some(&lease), "dev-1", 5_000, 0), ("church", None));
        assert_eq!(standing(Some(&lease), "dev-2", 5_000, 0), ("free", Some("device")));
        assert_eq!(standing(Some(&lease), "dev-1", 10_000, 0), ("free", Some("renew")));
        assert_eq!(standing(Some(&lease), "dev-1", 25_000, 0), ("free", Some("ended")));
        // Seen at 4 hours; the clock now says 1 second: set back.
        assert_eq!(standing(Some(&lease), "dev-1", 1_000, 4 * 60 * 60 * 1000), ("free", Some("clock")));
        assert_eq!(standing(None, "dev-1", 5_000, 0), ("free", Some("none")));
    }

    #[test]
    fn reads_a_lease_signed_by_the_typescript_signer() {
        let token = "CSL1.eyJ2IjoxLCJraW5kIjoibGljZW5zZSIsInBsYW4iOiJjaHVyY2giLCJkZXZpY2UiOiJkZXYtMSIsImxpY2Vuc2UiOiJhYmNkMTIzNCIsImhvbGRlciI6IkdyYWNlIiwiaXNzdWVkQXQiOjEwMDAsInJlbmV3QnkiOjEwMDAwLCJlbmRzQXQiOjIwMDAwfQ.1bUqtcvLVRllbGEfEaQkbtVa5QasBwZEkgxYrpr5irheFfdvUHcR_PpXP5eKIOisIkiRek7bn8vdYuH8whxoCA";
        let lease = read_lease(token, TEST_PUBLIC).expect("signed by the test key");
        assert_eq!(lease, Lease { holder: "Grace".into(), ..sample() });
        // The same token is refused under Church Studio's real key, and when edited.
        assert!(read_lease(token, PUBLIC_KEY).is_none());
        let mut edited = token.to_string();
        let at = 30;
        let flipped = if &edited[at..at + 1] == "A" { "B" } else { "A" };
        edited.replace_range(at..at + 1, flipped);
        assert!(read_lease(&edited, TEST_PUBLIC).is_none());
    }

    #[test]
    fn refuses_tokens_that_are_not_signed() {
        assert!(read_lease("CSL1.e30.AAAA", TEST_PUBLIC).is_none());
        assert!(read_lease("nonsense", TEST_PUBLIC).is_none());
    }

    #[test]
    fn device_id_is_stable_and_short() {
        assert_eq!(device_id(), device_id());
        assert_eq!(device_id().len(), 32);
    }
}
