//! Cloud space, the app's side of the files: a media file is hashed, sent and fetched here, by
//! streaming, so a video never passes through the webview; and the sync record (what the cloud last
//! agreed to) lives in the app data folder, written through a `.part` so a crash never leaves half
//! a file.

use serde::Serialize;
use std::path::{Path, PathBuf};
use std::time::Duration;
use tauri::Manager;

/// A connection that stalls fails instead of waiting for ever; a large video may take a while.
fn agent() -> ureq::Agent {
    ureq::Agent::config_builder()
        .http_status_as_error(false)
        .timeout_connect(Some(Duration::from_secs(15)))
        .timeout_recv_response(Some(Duration::from_secs(60)))
        .timeout_send_body(Some(Duration::from_secs(20 * 60)))
        .timeout_recv_body(Some(Duration::from_secs(20 * 60)))
        .build()
        .into()
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Hashed {
    pub hash: String,
    pub bytes: u64,
    pub name: String,
    pub kind: String,
    pub ext: String,
}

/// SHA-256 of a file as hex, with its size, read a megabyte at a time.
pub fn hash_file(path: &Path) -> Result<(String, u64), String> {
    let bytes = std::fs::metadata(path).map_err(|_| "That file could not be found.".to_string())?.len();
    let digest = crate::storage::fingerprint(path).ok_or("That file could not be read.")?;
    Ok((digest.iter().map(|byte| format!("{byte:02x}")).collect(), bytes))
}

fn extension_of(path: &Path) -> String {
    path.extension().and_then(|ext| ext.to_str()).unwrap_or_default().to_ascii_lowercase()
}

pub(crate) fn content_type(ext: &str) -> &'static str {
    match ext {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "svg" => "image/svg+xml",
        "mp4" | "m4v" => "video/mp4",
        "mov" => "video/quicktime",
        "webm" => "video/webm",
        "mp3" => "audio/mpeg",
        "m4a" | "aac" => "audio/mp4",
        "wav" => "audio/wav",
        "ogg" | "oga" => "audio/ogg",
        "flac" => "audio/flac",
        _ => "application/octet-stream",
    }
}

/// A media file's hash, size and kind, for the claim that asks the cloud whether to send it.
#[tauri::command(async)]
pub fn cloud_hash(db: tauri::State<'_, crate::db::Db>, id: String) -> Result<Hashed, String> {
    let (name, path, kind) = media_row(&db, &id)?;
    let (hash, bytes) = hash_file(&path)?;
    Ok(Hashed { hash, bytes, name, kind, ext: extension_of(&path) })
}

fn media_row(db: &tauri::State<'_, crate::db::Db>, id: &str) -> Result<(String, PathBuf, String), String> {
    let conn = db.0.lock().map_err(|_| "The library is busy. Try again.".to_string())?;
    let row = crate::db::media_get(&conn, id)?.ok_or("That file is not in Media.")?;
    Ok((row.0, PathBuf::from(row.1), row.2))
}

/// Send a media file to the cloud (after a claim said to). `url` is the file's own address.
#[tauri::command(async)]
pub fn cloud_upload(db: tauri::State<'_, crate::db::Db>, id: String, url: String, token: String, device: String) -> Result<(), String> {
    let (_, path, _) = media_row(&db, &id)?;
    let bytes = std::fs::metadata(&path).map_err(|_| "That file could not be found.".to_string())?.len();
    let mut file = std::fs::File::open(&path).map_err(|_| "That file could not be read.".to_string())?;
    let response = agent()
        .put(&url)
        .header("authorization", &format!("Bearer {token}"))
        .header("x-device", &device)
        .header("content-type", content_type(&extension_of(&path)))
        .header("content-length", &bytes.to_string())
        .send(ureq::SendBody::from_reader(&mut file))
        .map_err(|error| format!("The upload could not finish. Check the internet connection. ({error})"))?;
    let status = response.status().as_u16();
    if (200..300).contains(&status) {
        return Ok(());
    }
    Err(refusal(status, response))
}

/// What the server said when it refused, in its own words when it gave any.
fn refusal(status: u16, mut response: ureq::http::Response<ureq::Body>) -> String {
    let text = response.body_mut().read_to_string().unwrap_or_default();
    let said = serde_json::from_str::<serde_json::Value>(&text).ok().and_then(|value| value["error"].as_str().map(str::to_string));
    said.unwrap_or_else(|| format!("The cloud said no ({status})."))
}

/// Fetch a media file from the cloud into Media, keeping the id it had on the computer that sent it.
#[tauri::command(async)]
#[allow(clippy::too_many_arguments)]
pub fn cloud_download(app: tauri::AppHandle, db: tauri::State<'_, crate::db::Db>, url: String, token: String, device: String, id: String, name: String, kind: String, ext: String, created_at: String, hash: String) -> Result<serde_json::Value, String> {
    let ext = ext.to_ascii_lowercase();
    if id.len() != 36 || !id.chars().all(|c| c.is_ascii_hexdigit() || c == '-') {
        return Err("That file has no proper id.".into());
    }
    let kind_ok = crate::db::media_kind(&ext).ok_or("That kind of file cannot be added to Media.")?;
    if kind_ok != kind {
        return Err("That file's kind does not match its name.".into());
    }
    let dir = app.path().app_data_dir().map_err(|error| error.to_string())?.join("media");
    std::fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    let dest = dir.join(format!("{id}.{ext}"));
    if dest.exists() {
        let conn = db.0.lock().map_err(|_| "The library is busy. Try again.".to_string())?;
        crate::db::record_media_at(&conn, &id, &name, &dest, &kind, &created_at)?;
        return Ok(serde_json::json!({ "id": id, "path": dest.to_string_lossy() }));
    }
    let part = dir.join(format!("{id}.{ext}.part"));
    let mut response = agent()
        .get(&url)
        .header("authorization", &format!("Bearer {token}"))
        .header("x-device", &device)
        .call()
        .map_err(|error| format!("The download could not start. Check the internet connection. ({error})"))?;
    let status = response.status().as_u16();
    if !(200..300).contains(&status) {
        return Err(refusal(status, response));
    }
    let copied = (|| -> Result<(), String> {
        let mut out = std::fs::File::create(&part).map_err(|error| error.to_string())?;
        let mut reader = response.body_mut().as_reader();
        std::io::copy(&mut reader, &mut out).map_err(|error| format!("The download could not finish. ({error})"))?;
        Ok(())
    })();
    // The bytes must be the file that was promised: a download cut short or a wrong file is not kept.
    if copied.is_ok() && !hash.is_empty() {
        match hash_file(&part) {
            Ok((got, _)) if got == hash => {}
            _ => {
                let _ = std::fs::remove_file(&part);
                return Err("The download did not come through whole. It will be tried again.".into());
            }
        }
    }
    if let Err(error) = copied {
        let _ = std::fs::remove_file(&part);
        return Err(error);
    }
    crate::storage::rename_patiently(&part, &dest).map_err(|error| error.to_string())?;
    let conn = db.0.lock().map_err(|_| "The library is busy. Try again.".to_string())?;
    crate::db::record_media_at(&conn, &id, &name, &dest, &kind, &created_at)?;
    Ok(serde_json::json!({ "id": id, "path": dest.to_string_lossy() }))
}

fn state_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().app_data_dir().map_err(|error| error.to_string())?.join("cloud-sync.json"))
}

/// The sync record as saved; "" when there is none yet.
pub fn read_state(path: &Path) -> String {
    std::fs::read_to_string(path).unwrap_or_default()
}

/// Save the sync record through a `.part`, so a crash never leaves half of it.
pub fn write_state(path: &Path, text: &str) -> Result<(), String> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|error| error.to_string())?;
    }
    let part = path.with_extension("json.part");
    std::fs::write(&part, text).map_err(|error| error.to_string())?;
    crate::storage::rename_patiently(&part, path).map_err(|error| error.to_string())
}

#[tauri::command(async)]
pub fn cloud_state_read(app: tauri::AppHandle) -> Result<String, String> {
    Ok(read_state(&state_path(&app)?))
}

#[tauri::command(async)]
pub fn cloud_state_write(app: tauri::AppHandle, text: String) -> Result<(), String> {
    write_state(&state_path(&app)?, &text)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("cs-cloud-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn hashes_a_file_by_streaming_and_names_its_kind() {
        let dir = scratch();
        let path = dir.join("abc.PNG");
        std::fs::write(&path, b"abc").unwrap();
        let (hash, bytes) = hash_file(&path).unwrap();
        assert_eq!(hash, "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
        assert_eq!(bytes, 3);
        assert_eq!(extension_of(&path), "png");
        assert_eq!(content_type("png"), "image/png");
        assert_eq!(content_type("mov"), "video/quicktime");
        assert!(hash_file(&dir.join("missing.png")).is_err());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn state_round_trips_and_survives_a_missing_file() {
        let dir = scratch();
        let path = dir.join("deeper").join("cloud-sync.json");
        assert_eq!(read_state(&path), "");
        write_state(&path, "{\"seq\":3}").unwrap();
        assert_eq!(read_state(&path), "{\"seq\":3}");
        assert!(!dir.join("deeper").join("cloud-sync.json.part").exists());
        write_state(&path, "{\"seq\":4}").unwrap();
        assert_eq!(read_state(&path), "{\"seq\":4}");
        let _ = std::fs::remove_dir_all(&dir);
    }
}
