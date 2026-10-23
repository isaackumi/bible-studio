//! Space on this computer: what Church Studio keeps (library, pictures and videos, the speech model,
//! the window's cache) and the safe ways to make it smaller. Nothing here touches the library's
//! content: clearing the cache only drops copies the window can fetch again, and compacting the
//! library rewrites the same data in less space.

use serde::Serialize;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Usage {
    /// Songs, services, sermons, settings and Bibles (the database and its journal).
    pub library: u64,
    /// Pictures, videos and other files added to Media.
    pub media: u64,
    /// The speech model for Accurate listening, when downloaded.
    pub models: u64,
    /// The window's cache of downloaded files (safe to clear).
    pub cache: u64,
    /// Where it all lives, to show in Finder or Explorer.
    pub folder: String,
}

fn size_of(path: &Path) -> u64 {
    let Ok(meta) = std::fs::symlink_metadata(path) else { return 0 };
    if meta.is_file() {
        return meta.len();
    }
    if !meta.is_dir() {
        return 0;
    }
    std::fs::read_dir(path).map(|entries| entries.flatten().map(|entry| size_of(&entry.path())).sum()).unwrap_or(0)
}

/// The window's own cache folders (WebKit on macOS, WebView2 on Windows).
fn cache_dirs(app: &AppHandle) -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    if let Ok(cache) = app.path().app_cache_dir() {
        dirs.push(cache.join("WebKit").join("NetworkCache"));
    }
    if let Ok(local) = app.path().app_local_data_dir() {
        let profile = local.join("EBWebView").join("Default");
        for name in ["Cache", "Code Cache", "GPUCache"] {
            dirs.push(profile.join(name));
        }
    }
    dirs
}

pub fn usage(app: &AppHandle) -> Result<Usage, String> {
    let data = app.path().app_data_dir().map_err(|error| error.to_string())?;
    let library = ["church.db", "church.db-wal", "church.db-shm"].iter().map(|name| size_of(&data.join(name))).sum();
    Ok(Usage {
        library,
        media: size_of(&data.join("media")),
        models: size_of(&data.join("models")),
        cache: cache_dirs(app).iter().map(|dir| size_of(dir)).sum(),
        folder: data.display().to_string(),
    })
}

/// Drop the window's cached copies of downloaded files. Returns the bytes freed.
pub fn clear_cache(app: &AppHandle) -> u64 {
    let mut freed = 0;
    for dir in cache_dirs(app) {
        let before = size_of(&dir);
        let Ok(entries) = std::fs::read_dir(&dir) else { continue };
        for entry in entries.flatten() {
            let path = entry.path();
            // A file the window is using can stay; the rest goes.
            let _ = if path.is_dir() { std::fs::remove_dir_all(&path) } else { std::fs::remove_file(&path) };
        }
        freed += before.saturating_sub(size_of(&dir));
    }
    freed
}

/// Rewrite the library in the least space (the same songs and services, nothing removed).
pub fn compact(conn: &rusqlite::Connection) -> Result<(), String> {
    conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE); VACUUM; PRAGMA wal_checkpoint(TRUNCATE);").map_err(|error| format!("The library could not be compacted. {error}"))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Unused {
    /// The Media entry's id, or empty for a leftover file no entry points to.
    pub id: String,
    pub name: String,
    pub path: String,
    pub bytes: u64,
}

/// A Media entry (or leftover file) and where it is used: the tables that mention it, none if unused.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaUse {
    pub id: String,
    pub name: String,
    pub path: String,
    pub bytes: u64,
    pub used_in: Vec<&'static str>,
}

const DOCUMENT_TABLES: [&str; 5] = ["songs", "services", "sermons", "themes", "workspace"];

/**
 * Pictures and videos nothing uses: no song, service, sermon, theme, slide deck, look or setting
 * mentions their id or file name. Also files left in the media folder that no Media entry points
 * to. Nothing is deleted here; the church chooses.
 */
pub fn unused_media(conn: &rusqlite::Connection, media_dir: &Path) -> Result<Vec<Unused>, String> {
    Ok(media_usage(conn, media_dir)?
        .into_iter()
        .filter(|entry| entry.used_in.is_empty())
        .map(|entry| Unused { id: entry.id, name: entry.name, path: entry.path, bytes: entry.bytes })
        .collect())
}

/// Every Media entry with where it is used, so the church can see used and unused side by side.
pub fn media_usage(conn: &rusqlite::Connection, media_dir: &Path) -> Result<Vec<MediaUse>, String> {
    let mut documents: Vec<(&'static str, String)> = Vec::new();
    for table in DOCUMENT_TABLES {
        let mut statement = conn.prepare(&format!("SELECT document FROM {table}")).map_err(|error| error.to_string())?;
        let rows = statement.query_map([], |row| row.get::<_, String>(0)).map_err(|error| error.to_string())?;
        let mut everything = String::new();
        for row in rows.flatten() {
            everything.push_str(&row);
            everything.push('\n');
        }
        documents.push((table, everything));
    }
    let mut statement = conn.prepare("SELECT id, name, path FROM media_assets").map_err(|error| error.to_string())?;
    let assets: Vec<(String, String, String)> = statement
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))
        .map_err(|error| error.to_string())?
        .flatten()
        .collect();
    let file_name = |path: &str| Path::new(path).file_name().map(|name| name.to_string_lossy().to_string()).unwrap_or_default();
    let mut usage = Vec::new();
    for (id, name, path) in &assets {
        let file = file_name(path);
        let used_in = documents
            .iter()
            .filter(|(_, text)| text.contains(id.as_str()) || (!file.is_empty() && text.contains(file.as_str())))
            .map(|(table, _)| *table)
            .collect();
        usage.push(MediaUse { id: id.clone(), name: name.clone(), path: path.clone(), bytes: size_of(Path::new(path)), used_in });
    }
    // Files in the media folder that no entry points to (left by an interrupted import).
    let known: std::collections::HashSet<String> = assets.iter().map(|(_, _, path)| file_name(path)).collect();
    if let Ok(entries) = std::fs::read_dir(media_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            let name = file_name(&path.to_string_lossy());
            if path.is_file() && !name.starts_with('.') && !known.contains(&name) {
                usage.push(MediaUse { id: String::new(), name: name.clone(), path: path.display().to_string(), bytes: size_of(&path), used_in: Vec::new() });
            }
        }
    }
    usage.sort_by_key(|entry| std::cmp::Reverse(entry.bytes));
    Ok(usage)
}

/// Remove a leftover file, only if it sits in the app's own media folder.
pub fn remove_leftover(media_dir: &Path, path: &str) -> Result<(), String> {
    let file = Path::new(path);
    let inside = file.parent().map(|dir| dir == media_dir).unwrap_or(false);
    if !inside || !file.is_file() {
        return Err("Only leftover files in Church Studio's own media folder can be removed here.".into());
    }
    std::fs::remove_file(file).map_err(|error| error.to_string())
}

/// Bring a file into the media folder. Where the drive can (APFS on a Mac, btrfs or xfs on Linux,
/// ReFS on Windows) this is a clone: instant, no extra space, and still a file of its own when the
/// original is moved or deleted. Elsewhere it is a plain copy.
pub fn clone_or_copy(source: &Path, dest: &Path) -> Result<(), String> {
    reflink_copy::reflink_or_copy(source, dest).map(|_| ()).map_err(|error| error.to_string())
}

/// Which of `kept` holds exactly the same bytes as `source`: compared by size first, so only a file
/// of the same size is read through.
pub fn same_file(source: &Path, kept: &[PathBuf]) -> Option<usize> {
    let size = std::fs::metadata(source).ok()?.len();
    let mut digest: Option<[u8; 32]> = None;
    for (index, path) in kept.iter().enumerate() {
        if std::fs::metadata(path).map(|meta| meta.len()).ok() != Some(size) || path == source {
            continue;
        }
        if digest.is_none() {
            digest = Some(fingerprint(source)?);
        }
        if fingerprint(path) == digest {
            return Some(index);
        }
    }
    None
}

/// Which of `kept` holds exactly these bytes (a picture made smaller in the window, say).
pub fn same_bytes(bytes: &[u8], kept: &[PathBuf]) -> Option<usize> {
    use sha2::{Digest, Sha256};
    let digest: [u8; 32] = Sha256::digest(bytes).into();
    kept.iter().position(|path| std::fs::metadata(path).map(|meta| meta.len()).ok() == Some(bytes.len() as u64) && fingerprint(path) == Some(digest))
}

fn fingerprint(path: &Path) -> Option<[u8; 32]> {
    use sha2::{Digest, Sha256};
    use std::io::Read;
    let mut file = std::fs::File::open(path).ok()?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0u8; 1 << 20];
    loop {
        let read = file.read(&mut buffer).ok()?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Some(hasher.finalize().into())
}

/// Space left for Church Studio on the drive that holds `path`, in bytes.
pub fn free_space(path: &Path) -> Option<u64> {
    // The folder may not exist yet (no recording made): ask about the nearest one that does.
    let existing = path.ancestors().find(|ancestor| ancestor.exists())?;
    fs4::available_space(existing).ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sizes_add_up_through_folders() {
        let dir = std::env::temp_dir().join(format!("cs-size-{}", std::process::id()));
        std::fs::create_dir_all(dir.join("inner")).unwrap();
        std::fs::write(dir.join("a.bin"), vec![0u8; 1000]).unwrap();
        std::fs::write(dir.join("inner").join("b.bin"), vec![0u8; 500]).unwrap();
        assert_eq!(size_of(&dir), 1500);
        assert_eq!(size_of(&dir.join("missing")), 0);
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn finds_media_nothing_uses() {
        let dir = std::env::temp_dir().join(format!("cs-unused-{}", std::process::id()));
        let media = dir.join("media");
        std::fs::create_dir_all(&media).unwrap();
        for name in ["used.jpg", "byname.png", "lonely.mp4", "leftover.mov"] {
            std::fs::write(media.join(name), vec![0u8; 10]).unwrap();
        }
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        conn.execute_batch("CREATE TABLE media_assets (id TEXT, name TEXT, path TEXT, kind TEXT, created_at TEXT); CREATE TABLE songs (id TEXT, title TEXT, document TEXT); CREATE TABLE services (id TEXT, name TEXT, document TEXT, updated_at TEXT); CREATE TABLE sermons (id TEXT, title TEXT, document TEXT, updated_at TEXT); CREATE TABLE themes (id TEXT, document TEXT); CREATE TABLE workspace (id INTEGER, document TEXT);").unwrap();
        for (id, file) in [("m-used", "used.jpg"), ("m-byname", "byname.png"), ("m-lonely", "lonely.mp4")] {
            conn.execute("INSERT INTO media_assets VALUES (?1, ?2, ?3, 'image', '')", rusqlite::params![id, file, media.join(file).display().to_string()]).unwrap();
        }
        conn.execute("INSERT INTO songs VALUES ('s', 'Song', '{\"background\":\"m-used\"}')", []).unwrap();
        conn.execute("INSERT INTO workspace VALUES (1, '{\"decks\":[{\"src\":\"asset://media/byname.png\"}]}')", []).unwrap();
        let unused = unused_media(&conn, &media).unwrap();
        let names: Vec<&str> = unused.iter().map(|item| item.name.as_str()).collect();
        assert!(names.contains(&"lonely.mp4") && names.contains(&"leftover.mov"));
        assert!(!names.contains(&"used.jpg") && !names.contains(&"byname.png"));
        // The full picture says where each one is used, so used and unused can be compared.
        let usage = media_usage(&conn, &media).unwrap();
        let used_in = |name: &str| usage.iter().find(|item| item.name == name).unwrap().used_in.clone();
        assert_eq!(used_in("used.jpg"), vec!["songs"]);
        assert_eq!(used_in("byname.png"), vec!["workspace"]);
        assert!(used_in("lonely.mp4").is_empty() && used_in("leftover.mov").is_empty());
        assert!(remove_leftover(&media, "/etc/hosts").is_err());
        remove_leftover(&media, &media.join("leftover.mov").display().to_string()).unwrap();
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn compacting_keeps_the_data() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        conn.execute_batch("CREATE TABLE t (v TEXT); INSERT INTO t VALUES ('kept');").unwrap();
        compact(&conn).unwrap();
        let value: String = conn.query_row("SELECT v FROM t", [], |row| row.get(0)).unwrap();
        assert_eq!(value, "kept");
    }

    #[test]
    fn finds_the_same_file_and_clones() {
        let dir = std::env::temp_dir().join(format!("cs-same-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let a = dir.join("a.png");
        let b = dir.join("b.png");
        let c = dir.join("c.png");
        let source = dir.join("new.png");
        std::fs::write(&a, b"one picture").unwrap();
        std::fs::write(&b, b"two picture").unwrap();
        std::fs::write(&c, b"other size, longer").unwrap();
        std::fs::write(&source, b"two picture").unwrap();
        assert_eq!(super::same_file(&source, &[a.clone(), c.clone(), b.clone()]), Some(2));
        assert_eq!(super::same_file(&source, &[a.clone(), c.clone()]), None);
        assert_eq!(super::same_bytes(b"one picture", &[b.clone(), a.clone()]), Some(1));
        let copy = dir.join("copy.png");
        super::clone_or_copy(&source, &copy).unwrap();
        assert_eq!(std::fs::read(&copy).unwrap(), b"two picture");
        assert!(super::free_space(&dir.join("not-made-yet/sub")).unwrap() > 0);
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
