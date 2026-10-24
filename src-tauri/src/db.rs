use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use rusqlite::{params, Connection};
use serde_json::Value;
use tauri::{AppHandle, Manager};
use uuid::Uuid;

use crate::bible;

pub struct Db(pub Mutex<Connection>);

/// Open the library. One that cannot be opened is set aside (never deleted) and a new one started,
/// so the app still opens on a Sunday morning; the second value is the set-aside file's name, for the desk.
pub fn open(app: &AppHandle) -> Result<(Db, Option<String>), String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join("church.db");
    let resources = resource_dir(app);
    // Antivirus or a backup reading the file at that moment (common on Windows) locks it for a
    // second or two: wait it out before setting a good library aside. A damaged file is set aside
    // at once; anything else after a few tries, as before.
    let mut opened = open_at(&path, &resources);
    for _ in 0..4 {
        match &opened {
            Err(error) if !damaged(error) => {
                log::warn!("The library is busy, trying again: {error}");
                std::thread::sleep(std::time::Duration::from_millis(1000));
                opened = open_at(&path, &resources);
            }
            _ => break,
        }
    }
    match opened {
        Ok(conn) => Ok((Db(Mutex::new(conn)), None)),
        Err(error) => {
            log::error!("The library could not be opened: {error}");
            let kept = dir.join(format!("church.db.unreadable-{}", chrono_stamp()));
            fs::rename(&path, &kept).map_err(|e| format!("The library could not be opened ({error}) or set aside ({e})."))?;
            for side in ["-wal", "-shm"] {
                let _ = fs::rename(dir.join(format!("church.db{side}")), dir.join(format!("{}{side}", kept.display())));
            }
            let conn = open_at(&path, &resources)?;
            Ok((Db(Mutex::new(conn)), Some(kept.file_name().and_then(|name| name.to_str()).unwrap_or("church.db.unreadable").to_string())))
        }
    }
}

/// SQLite's words for a file that is not (or no longer) a readable database.
fn damaged(error: &str) -> bool {
    let error = error.to_lowercase();
    error.contains("not a database") || error.contains("malformed") || error.contains("encrypted") || error.contains("corrupt")
}

fn open_at(path: &Path, resources: &Path) -> Result<Connection, String> {
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    // The wait for a lock first, so switching to WAL waits too instead of failing at once.
    conn.execute_batch("PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;")
        .map_err(|e| e.to_string())?;
    migrate_keeping_copy(&conn, path)?;
    // The bundled Bibles: a missing one is logged, not fatal (the others, and downloads, still work).
    if let Err(error) = bible::seed_bundled_translations(&conn, resources) {
        log::warn!("A bundled Bible could not be installed: {error}");
    }
    Ok(conn)
}

/// Seconds since 1970, for file names.
fn chrono_stamp() -> u64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

pub fn resource_dir(app: &AppHandle) -> PathBuf {
    if let Ok(path) = app
        .path()
        .resolve("resources/kjv.json", tauri::path::BaseDirectory::Resource)
    {
        if let Some(dir) = path.parent() {
            if dir.join("kjv.json").exists() {
                return dir.to_path_buf();
            }
        }
    }
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources")
}

/// Every change to the tables, in order. Each runs once, in a transaction with its record in
/// schema_migrations, so a step that alters a table (ALTER TABLE) is never run twice.
const MIGRATIONS: &[(i64, &str, &str)] = &[
    (1, "init", include_str!("../migrations/001_init.sql")),
    (2, "sermons", include_str!("../migrations/002_sermons.sql")),
];

fn pending(conn: &Connection) -> Result<Vec<&'static (i64, &'static str, &'static str)>, String> {
    conn.execute_batch("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, description TEXT NOT NULL);")
        .map_err(|e| e.to_string())?;
    let mut statement = conn.prepare("SELECT version FROM schema_migrations").map_err(|e| e.to_string())?;
    let applied = statement
        .query_map([], |row| row.get::<_, i64>(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(MIGRATIONS.iter().filter(|(version, _, _)| !applied.contains(version)).collect())
}

fn migrate(conn: &Connection) -> Result<(), String> {
    for (version, description, sql) in pending(conn)? {
        let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
        tx.execute_batch(sql).map_err(|e| format!("Library update {version} ({description}) failed: {e}"))?;
        tx.execute("INSERT INTO schema_migrations (version, description) VALUES (?1, ?2)", params![version, description])
            .map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Before changing the tables of a library that already has data, keep a copy beside it
/// (church.db.before-v3), so a failed update can be undone by hand.
fn migrate_keeping_copy(conn: &Connection, path: &Path) -> Result<(), String> {
    let steps = pending(conn)?;
    let existing: i64 = conn.query_row("SELECT COUNT(*) FROM schema_migrations", [], |row| row.get(0)).map_err(|e| e.to_string())?;
    if let (Some(last), true) = (steps.last(), existing > 0) {
        let copy = path.with_file_name(format!("church.db.before-v{}", last.0));
        if !copy.exists() {
            conn.execute("VACUUM INTO ?1", params![copy.to_string_lossy()]).map_err(|e| format!("Could not keep a copy before updating the library: {e}"))?;
        }
    }
    migrate(conn)
}

fn parse_row(text: Result<String, rusqlite::Error>) -> Result<Option<Value>, String> {
    match text {
        Ok(text) => Ok(Some(serde_json::from_str(&text).map_err(|e| e.to_string())?)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

pub fn workspace_load(conn: &Connection) -> Result<Option<Value>, String> {
    parse_row(conn.query_row(
        "SELECT document FROM workspace WHERE id = 1",
        [],
        |row| row.get(0),
    ))
}

pub fn workspace_save(conn: &Connection, document: &Value) -> Result<(), String> {
    let text = serde_json::to_string(document).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO workspace (id, document) VALUES (1, ?1)
         ON CONFLICT(id) DO UPDATE SET document = excluded.document",
        params![text],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn list_documents(conn: &Connection, sql: &str) -> Result<Vec<Value>, String> {
    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for row in rows {
        let text = row.map_err(|e| e.to_string())?;
        out.push(serde_json::from_str(&text).map_err(|e| e.to_string())?);
    }
    Ok(out)
}

pub fn theme_list(conn: &Connection) -> Result<Vec<Value>, String> {
    list_documents(conn, "SELECT document FROM themes ORDER BY id")
}

pub fn theme_delete(conn: &Connection, id: &str) -> Result<(), String> {
    conn.execute("DELETE FROM themes WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn theme_save(conn: &Connection, document: &Value) -> Result<(), String> {
    let id = document
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or("Theme is missing an id")?;
    let text = serde_json::to_string(document).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO themes (id, document) VALUES (?1, ?2)
         ON CONFLICT(id) DO UPDATE SET document = excluded.document",
        params![id, text],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn song_list(conn: &Connection) -> Result<Vec<Value>, String> {
    list_documents(conn, "SELECT document FROM songs ORDER BY title COLLATE NOCASE")
}

pub fn song_save(conn: &Connection, document: &Value) -> Result<(), String> {
    let id = document
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or("Song is missing an id")?;
    let title = document
        .get("title")
        .and_then(|v| v.as_str())
        .unwrap_or("Untitled song");
    let text = serde_json::to_string(document).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO songs (id, title, document) VALUES (?1, ?2, ?3)
         ON CONFLICT(id) DO UPDATE SET title = excluded.title, document = excluded.document",
        params![id, title, text],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn service_delete(conn: &Connection, id: &str) -> Result<(), String> {
    conn.execute("DELETE FROM services WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Remove a picture, video or audio file from the library, and its copy in the app's folder.
pub fn media_delete(conn: &Connection, id: &str) -> Result<(), String> {
    let path: Option<String> = conn
        .query_row("SELECT path FROM media_assets WHERE id = ?1", params![id], |row| row.get(0))
        .ok();
    conn.execute("DELETE FROM media_assets WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    if let Some(path) = path {
        // Only files the app copied into its own media folder are removed.
        let file = std::path::Path::new(&path);
        if file.parent().and_then(|dir| dir.file_name()).map(|name| name == "media").unwrap_or(false) {
            let _ = fs::remove_file(file);
        }
    }
    Ok(())
}

pub fn song_delete(conn: &Connection, id: &str) -> Result<(), String> {
    conn.execute("DELETE FROM songs WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn sermon_list(conn: &Connection) -> Result<Vec<Value>, String> {
    list_documents(conn, "SELECT document FROM sermons ORDER BY title COLLATE NOCASE")
}

pub fn sermon_save(conn: &Connection, document: &Value) -> Result<(), String> {
    let id = document
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or("Sermon is missing an id")?;
    let title = document
        .get("title")
        .and_then(|v| v.as_str())
        .unwrap_or("Untitled sermon");
    let updated = document
        .get("updatedAt")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let text = serde_json::to_string(document).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO sermons (id, title, document, updated_at) VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(id) DO UPDATE SET title = excluded.title, document = excluded.document, updated_at = excluded.updated_at",
        params![id, title, text, updated],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn sermon_delete(conn: &Connection, id: &str) -> Result<(), String> {
    conn.execute("DELETE FROM sermons WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn song_search(conn: &Connection, query: &str) -> Result<Vec<Value>, String> {
    let like = format!("%{}%", query.trim());
    let mut stmt = conn
        .prepare(
            "SELECT document FROM songs
             WHERE title LIKE ?1 COLLATE NOCASE OR document LIKE ?1 COLLATE NOCASE
             ORDER BY title COLLATE NOCASE",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![like], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for row in rows {
        out.push(serde_json::from_str(&row.map_err(|e| e.to_string())?).map_err(|e| e.to_string())?);
    }
    Ok(out)
}

/// What the services list shows without opening a service: its start time, how many parts it
/// has (and how many are left out this time), and when it last ran (epoch ms).
fn service_summary(document: &Value) -> Value {
    let sections = document.get("sections").and_then(Value::as_array);
    let skipped = sections
        .map(|list| list.iter().filter(|section| section.get("skip").and_then(Value::as_bool) == Some(true)).count())
        .unwrap_or(0);
    let parts = sections.map(|list| list.len()).unwrap_or(0) - skipped;
    let last_run = document
        .get("runs")
        .and_then(Value::as_array)
        .and_then(|runs| runs.last())
        .and_then(|run| run.get("startedAt"))
        .and_then(Value::as_f64);
    serde_json::json!({
        "startTime": document.get("startTime").and_then(Value::as_str),
        "parts": parts,
        "skipped": skipped,
        "lastRunAt": last_run,
    })
}

pub fn service_list(conn: &Connection) -> Result<Vec<Value>, String> {
    let mut stmt = conn
        .prepare("SELECT id, name, updated_at, document FROM services ORDER BY updated_at DESC")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            let document: Value = serde_json::from_str(&row.get::<_, String>(3)?).unwrap_or(Value::Null);
            let mut summary = service_summary(&document);
            summary["id"] = Value::from(row.get::<_, String>(0)?);
            summary["name"] = Value::from(row.get::<_, String>(1)?);
            summary["updatedAt"] = Value::from(row.get::<_, String>(2)?);
            Ok(summary)
        })
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

pub fn service_get(conn: &Connection, id: &str) -> Result<Option<Value>, String> {
    parse_row(conn.query_row(
        "SELECT document FROM services WHERE id = ?1",
        params![id],
        |row| row.get(0),
    ))
}

pub fn service_save(conn: &Connection, document: &Value) -> Result<(), String> {
    let id = document
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or("Service is missing an id")?;
    let name = document
        .get("name")
        .and_then(|v| v.as_str())
        .unwrap_or("Untitled service");
    let updated = document
        .get("updatedAt")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let text = serde_json::to_string(document).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO services (id, name, document, updated_at) VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, document = excluded.document, updated_at = excluded.updated_at",
        params![id, name, text, updated],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn media_list(conn: &Connection) -> Result<Vec<Value>, String> {
    let mut stmt = conn
        .prepare("SELECT id, name, path, kind, created_at FROM media_assets ORDER BY created_at DESC")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, String>(0)?,
                "name": row.get::<_, String>(1)?,
                "path": row.get::<_, String>(2)?,
                "kind": row.get::<_, String>(3)?,
                "createdAt": row.get::<_, String>(4)?,
            }))
        })
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

/// A file to add to Media: its name, extension and kind, or why it cannot be added.
pub fn media_source(source: &Path) -> Result<(String, String, &'static str), String> {
    if !source.exists() {
        return Err("That image file could not be found.".into());
    }
    let ext = source
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("img")
        .to_ascii_lowercase();
    let kind = media_kind(&ext).ok_or("Use a PNG, JPEG, WebP, GIF or SVG image, an MP4, MOV, M4V or WebM video, or MP3, M4A, AAC, WAV, OGG or FLAC audio.")?;
    let name = source
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("image")
        .to_string();
    Ok((name, ext, kind))
}

/// Image, video or audio, by extension. Anything else is refused.
pub fn media_kind(ext: &str) -> Option<&'static str> {
    match ext {
        // An SVG is turned into a PNG by the desk straight after (fit-image.ts); until then it is
        // only ever shown as a picture, which cannot run its scripts.
        "png" | "jpg" | "jpeg" | "webp" | "gif" | "svg" => Some("image"),
        "mp4" | "m4v" | "mov" | "webm" => Some("video"),
        "mp3" | "m4a" | "aac" | "wav" | "ogg" | "oga" | "flac" => Some("audio"),
        _ => None,
    }
}

/// Largest in-memory image accepted (a rendered PDF page is a few MB at most).
pub const MAX_MEDIA_BYTES: usize = 25 * 1024 * 1024;

/// Image bytes from the webview (for example a rendered PDF page). The type comes from the
/// file signature, not the name.
pub fn import_media_bytes(conn: &Connection, app: &AppHandle, name: &str, bytes: &[u8]) -> Result<Value, String> {
    if bytes.is_empty() {
        return Err("The image was empty.".into());
    }
    if bytes.len() > MAX_MEDIA_BYTES {
        return Err("That image is too large.".into());
    }
    let ext = image_extension(bytes).ok_or("Use a PNG, JPEG, WebP, or GIF image.")?;
    let name = name.trim();
    let name = if name.is_empty() { "image" } else { name };
    store_media(conn, app, name, ext, "image", |dest| fs::write(dest, bytes).map_err(|e| e.to_string()))
}

pub fn image_extension(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(&[0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a]) {
        Some("png")
    } else if bytes.starts_with(&[0xff, 0xd8, 0xff]) {
        Some("jpg")
    } else if bytes.len() >= 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        Some("webp")
    } else if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        Some("gif")
    } else {
        None
    }
}

fn store_media(
    conn: &Connection,
    app: &AppHandle,
    name: &str,
    ext: &str,
    kind: &str,
    write: impl FnOnce(&Path) -> Result<(), String>,
) -> Result<Value, String> {
    let (id, dest) = media_dest(app, ext)?;
    write(&dest)?;
    record_media(conn, &id, name, &dest, kind)
}

/// A new file name in the media folder: its id and path.
pub fn media_dest(app: &AppHandle, ext: &str) -> Result<(String, PathBuf), String> {
    let id = Uuid::new_v4().to_string();
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("media");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let dest = dir.join(format!("{id}.{ext}"));
    Ok((id, dest))
}

/// The library's record of a file now in the media folder (the file goes if it cannot be recorded).
pub fn record_media(conn: &Connection, id: &str, name: &str, dest: &Path, kind: &str) -> Result<Value, String> {
    let created = chrono_now();
    let path = dest.to_string_lossy().to_string();
    if let Err(error) = conn.execute(
        "INSERT INTO media_assets (id, name, path, kind, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![id, name, path, kind, created],
    ) {
        let _ = fs::remove_file(dest);
        return Err(error.to_string());
    }
    Ok(serde_json::json!({
        "id": id,
        "name": name,
        "path": path,
        "kind": kind,
        "createdAt": created,
    }))
}

pub fn import_library(conn: &Connection, snapshot: &Value) -> Result<(), String> {
    import_library_until(conn, snapshot, None)
}

pub fn import_library_until(conn: &Connection, snapshot: &Value, fail_at: Option<&str>) -> Result<(), String> {
    validate_library(snapshot)?;
    conn.execute_batch("BEGIN IMMEDIATE")
        .map_err(|error| import_failure("start", &error))?;
    let outcome = write_library(conn, snapshot, fail_at);
    match outcome {
        Ok(()) => conn.execute_batch("COMMIT").map_err(|error| {
            let _ = conn.execute_batch("ROLLBACK");
            import_failure("finish", &error)
        }),
        Err(error) => {
            let _ = conn.execute_batch("ROLLBACK");
            Err(error)
        }
    }
}

fn import_failure(stage: &str, error: &impl std::fmt::Display) -> String {
    log::error!("library import {stage}: {error}");
    format!("Could not {stage} the library import. Nothing was changed.")
}

fn validate_library(snapshot: &Value) -> Result<(), String> {
    let record = snapshot.as_object().ok_or("The library file is not valid. Nothing was changed.")?;
    if record.get("schemaVersion").and_then(|v| v.as_i64()) != Some(1) {
        return Err("This library file needs a newer version of Church Studio. Nothing was changed.".into());
    }
    let songs = record.get("songs").and_then(|v| v.as_array()).ok_or("The library file is not valid. Nothing was changed.")?;
    let services = record.get("services").and_then(|v| v.as_array()).ok_or("The library file is not valid. Nothing was changed.")?;
    for song in songs {
        require_text(song, "id")?;
        require_text(song, "title")?;
        if song.get("sections").and_then(|v| v.as_array()).is_none() {
            return Err("A song in the library file is not valid. Nothing was changed.".into());
        }
    }
    for service in services {
        require_text(service, "id")?;
        require_text(service, "name")?;
        if service.get("sections").and_then(|v| v.as_array()).is_none() {
            return Err("A service in the library file is not valid. Nothing was changed.".into());
        }
    }
    if let Some(themes) = record.get("themes") {
        let themes = themes.as_array().ok_or("The library file is not valid. Nothing was changed.")?;
        for theme in themes {
            require_text(theme, "id")?;
            require_text(theme, "name")?;
        }
    }
    Ok(())
}

fn require_text(value: &Value, key: &str) -> Result<(), String> {
    match value.get(key).and_then(|v| v.as_str()) {
        Some(text) if !text.is_empty() => Ok(()),
        _ => Err("The library file is not valid. Nothing was changed.".into()),
    }
}

fn write_library(conn: &Connection, snapshot: &Value, fail_at: Option<&str>) -> Result<(), String> {
    let songs = snapshot.get("songs").and_then(|v| v.as_array()).cloned().unwrap_or_default();
    let services = snapshot.get("services").and_then(|v| v.as_array()).cloned().unwrap_or_default();
    for song in songs {
        song_save(conn, &song).map_err(|error| import_failure("save songs for", &error))?;
    }
    if fail_at == Some("songs") {
        return Err("Could not save songs. Nothing was changed.".into());
    }
    for service in services {
        service_save(conn, &service).map_err(|error| import_failure("save services for", &error))?;
    }
    if fail_at == Some("services") {
        return Err("Could not save services. Nothing was changed.".into());
    }
    if let Some(themes) = snapshot.get("themes").and_then(|v| v.as_array()) {
        for theme in themes {
            theme_save(conn, theme).map_err(|error| import_failure("save themes for", &error))?;
        }
    }
    if fail_at == Some("themes") {
        return Err("Could not save themes. Nothing was changed.".into());
    }
    Ok(())
}

fn chrono_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
        .to_string()
}

#[cfg(test)]
mod tests {
    #[test]
    fn reads_image_signatures() {
        assert_eq!(super::image_extension(&[0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a, 0]), Some("png"));
        assert_eq!(super::image_extension(&[0xff, 0xd8, 0xff, 0xe0]), Some("jpg"));
        assert_eq!(super::image_extension(b"RIFF\0\0\0\0WEBPVP8 "), Some("webp"));
        assert_eq!(super::image_extension(b"GIF89a..."), Some("gif"));
        assert_eq!(super::image_extension(b"%PDF-1.7"), None);
        assert_eq!(super::media_kind("mov"), Some("video"));
        assert_eq!(super::media_kind("png"), Some("image"));
        assert_eq!(super::media_kind("mp3"), Some("audio"));
        assert_eq!(super::media_kind("exe"), None);
        assert_eq!(super::media_kind("svg"), Some("image"));
    }

    use super::*;

    fn test_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        migrate(&conn).unwrap();
        conn
    }

    #[test]
    fn runs_each_library_update_once() {
        let conn = test_db();
        migrate(&conn).unwrap();
        let count: i64 = conn.query_row("SELECT COUNT(*) FROM schema_migrations", [], |row| row.get(0)).unwrap();
        assert_eq!(count, MIGRATIONS.len() as i64);
        assert!(pending(&conn).unwrap().is_empty());
        // A step that could only run once (as ALTER TABLE) is not run again on the next launch.
        conn.execute_batch("ALTER TABLE sermons ADD COLUMN once INTEGER").unwrap();
        conn.execute("INSERT INTO schema_migrations (version, description) VALUES (99, 'once')", []).unwrap();
        migrate(&conn).unwrap();
    }

    #[test]
    fn keeps_a_copy_before_updating_a_library_with_data() {
        let dir = std::env::temp_dir().join(format!("cs-migrate-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("church.db");
        let conn = Connection::open(&path).unwrap();
        migrate(&conn).unwrap();
        conn.execute("DELETE FROM schema_migrations WHERE version = 2", []).unwrap();
        migrate_keeping_copy(&conn, &path).unwrap();
        assert!(dir.join("church.db.before-v2").exists());
        // A new library has nothing to keep.
        let fresh = dir.join("fresh.db");
        migrate_keeping_copy(&Connection::open(&fresh).unwrap(), &fresh).unwrap();
        assert!(!dir.join("church.db.before-v1").exists());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn installs_a_downloaded_bible_and_removes_its_file() {
        let conn = test_db();
        let file = std::env::temp_dir().join(format!("cs-download-{}.json", std::process::id()));
        std::fs::copy(concat!(env!("CARGO_MANIFEST_DIR"), "/resources/twi.json"), &file).unwrap();
        crate::bible::install_download(&conn, "twiasante", &file).unwrap();
        assert!(!file.exists());
        let source: String = conn.query_row("SELECT source FROM bible_translations WHERE id = 'twiasante'", [], |row| row.get(0)).unwrap();
        assert_eq!(source, "download");
        assert_eq!(crate::bible::books(&conn, "twiasante").unwrap().len(), 66);
        assert!(crate::bible::install_download(&conn, "nkoNT", &file).is_err());
    }

    #[test]
    fn lists_services_with_their_start_parts_and_last_run() {
        let conn = test_db();
        service_save(&conn, &serde_json::json!({
            "id": "s1", "name": "Sunday", "updatedAt": "2026-10-20", "startTime": "09:00",
            "sections": [{ "id": "a" }, { "id": "b", "skip": true }, { "id": "c" }],
            "runs": [{ "startedAt": 1000.0 }, { "startedAt": 2000.0 }]
        }))
        .unwrap();
        let list = service_list(&conn).unwrap();
        assert_eq!(list[0]["name"], "Sunday");
        assert_eq!(list[0]["startTime"], "09:00");
        assert_eq!(list[0]["parts"], 2);
        assert_eq!(list[0]["skipped"], 1);
        assert_eq!(list[0]["lastRunAt"], 2000.0);
    }

    #[test]
    fn imports_a_church_bible_and_reads_it_back() {
        let conn = test_db();
        let bible: crate::bible::ImportedBible = serde_json::from_value(serde_json::json!({
            "name": "Nkwa Asɛm", "abbreviation": "TWI-2",
            "books": [{ "ord": 43, "name": "Yohane", "chapters": [[], [], ["", "Na Onyankopɔn dɔ wiase"]] }]
        }))
        .unwrap();
        let id = crate::bible::import_translation(&conn, &bible).unwrap();
        assert_eq!(id, "user-twi2");
        // A second import of the same file gets its own id.
        assert_eq!(crate::bible::import_translation(&conn, &bible).unwrap(), "user-twi2-2");
        let books = crate::bible::books(&conn, &id).unwrap();
        assert_eq!(books[0]["name"], "Yohane");
        let source = crate::bible::source_books(&conn, &id).unwrap();
        assert_eq!(source.len(), 66);
        assert_eq!(source[42][2][1], "Na Onyankopɔn dɔ wiase");
        assert!(source[0].is_empty());
    }

    fn count(conn: &Connection, table: &str) -> i64 {
        conn.query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |row| row.get(0))
            .unwrap()
    }

    fn seed(conn: &Connection) {
        song_save(conn, &serde_json::json!({"id":"song-old","title":"Old","sections":[]})).unwrap();
        service_save(conn, &serde_json::json!({"id":"svc-old","name":"Old","sections":[],"updatedAt":"1"})).unwrap();
        theme_save(conn, &serde_json::json!({"id":"theme-old","name":"Old"})).unwrap();
    }

    fn snapshot(with_theme: bool) -> Value {
        let mut value = serde_json::json!({
            "schemaVersion": 1,
            "songs": [{"id":"song-new","title":"New","sections":[]}],
            "services": [{"id":"svc-new","name":"New","sections":[],"updatedAt":"2"}]
        });
        if with_theme {
            value["themes"] = serde_json::json!([{"id":"theme-new","name":"New"}]);
        }
        value
    }

    #[test]
    fn sermons_roundtrip_keep_operator_notes_in_the_document() {
        let conn = test_db();
        sermon_save(
            &conn,
            &serde_json::json!({
                "id": "sermon-1",
                "title": "The Word",
                "speaker": "Ada",
                "notes": "OPERATOR-ONLY",
                "sections": [{"id":"sec-1","name":"Opening","notes":"Cue","items":[]}],
                "updatedAt": "2026-10-15T00:00:00.000Z"
            }),
        )
        .unwrap();
        let rows = sermon_list(&conn).unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0]["notes"], "OPERATOR-ONLY");
        assert_eq!(rows[0]["sections"][0]["notes"], "Cue");
        sermon_delete(&conn, "sermon-1").unwrap();
        assert_eq!(count(&conn, "sermons"), 0);
    }

    #[test]
    fn a_failed_stage_leaves_the_previous_rows() {
        for stage in ["songs", "services", "themes"] {
            let conn = test_db();
            seed(&conn);
            let error = import_library_until(&conn, &snapshot(true), Some(stage)).unwrap_err();
            assert!(error.contains("Nothing was changed."), "{error}");
            assert_eq!(count(&conn, "songs"), 1);
            assert_eq!(count(&conn, "services"), 1);
            assert_eq!(count(&conn, "themes"), 1);
            assert!(song_save(&conn, &serde_json::json!({"id":"song-after","title":"After","sections":[]})).is_ok());
        }
    }

    #[test]
    fn an_older_file_keeps_themes_and_a_retry_does_not_duplicate() {
        let conn = test_db();
        seed(&conn);
        let error = import_library(&conn, &serde_json::json!({"schemaVersion": 2, "songs": [], "services": []})).unwrap_err();
        assert!(error.contains("newer version"));
        assert_eq!(count(&conn, "songs"), 1);
        import_library(&conn, &snapshot(false)).unwrap();
        import_library(&conn, &snapshot(false)).unwrap();
        assert_eq!(count(&conn, "songs"), 2);
        assert_eq!(count(&conn, "services"), 2);
        assert_eq!(count(&conn, "themes"), 1);
        let kept = theme_list(&conn).unwrap();
        assert_eq!(kept.len(), 1);
        assert_eq!(kept[0]["id"], "theme-old");
    }
}
