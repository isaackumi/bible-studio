use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use rusqlite::{params, Connection};
use serde_json::Value;
use tauri::{AppHandle, Manager};
use uuid::Uuid;

use crate::bible;

pub struct Db(pub Mutex<Connection>);

pub fn open(app: &AppHandle) -> Result<Db, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join("church.db");
    let conn = Connection::open(&path).map_err(|e| e.to_string())?;
    conn.execute_batch("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;")
        .map_err(|e| e.to_string())?;
    migrate(&conn)?;
    bible::seed_kjv_if_needed(&conn, &kjv_path(app))?;
    Ok(Db(Mutex::new(conn)))
}

fn kjv_path(app: &AppHandle) -> PathBuf {
    if let Ok(path) = app
        .path()
        .resolve("resources/kjv.json", tauri::path::BaseDirectory::Resource)
    {
        if path.exists() {
            return path;
        }
    }
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources/kjv.json")
}

fn migrate(conn: &Connection) -> Result<(), String> {
    let sql = include_str!("../migrations/001_init.sql");
    conn.execute_batch(sql).map_err(|e| e.to_string())?;
    let applied: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM schema_migrations WHERE version = 1",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    if applied == 0 {
        conn.execute(
            "INSERT INTO schema_migrations (version, description) VALUES (1, 'init')",
            [],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
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

pub fn song_delete(conn: &Connection, id: &str) -> Result<(), String> {
    conn.execute("DELETE FROM songs WHERE id = ?1", params![id])
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

pub fn service_list(conn: &Connection) -> Result<Vec<Value>, String> {
    let mut stmt = conn
        .prepare("SELECT id, name, updated_at FROM services ORDER BY updated_at DESC")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, String>(0)?,
                "name": row.get::<_, String>(1)?,
                "updatedAt": row.get::<_, String>(2)?,
            }))
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

pub fn import_media(conn: &Connection, app: &AppHandle, source: &Path) -> Result<Value, String> {
    if !source.exists() {
        return Err("That image file could not be found.".into());
    }
    let ext = source
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("img")
        .to_ascii_lowercase();
    let allowed = ["png", "jpg", "jpeg", "webp", "gif"];
    if !allowed.contains(&ext.as_str()) {
        return Err("Use a PNG, JPEG, WebP, or GIF image.".into());
    }
    let id = Uuid::new_v4().to_string();
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("media");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let dest = dir.join(format!("{id}.{ext}"));
    fs::copy(source, &dest).map_err(|e| e.to_string())?;
    let name = source
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("image")
        .to_string();
    let created = chrono_now();
    let path = dest.to_string_lossy().to_string();
    conn.execute(
        "INSERT INTO media_assets (id, name, path, kind, created_at) VALUES (?1, ?2, ?3, 'image', ?4)",
        params![id, name, path, created],
    )
    .map_err(|e| e.to_string())?;
    Ok(serde_json::json!({
        "id": id,
        "name": name,
        "path": path,
        "kind": "image",
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
    use super::*;

    fn test_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        migrate(&conn).unwrap();
        conn
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
