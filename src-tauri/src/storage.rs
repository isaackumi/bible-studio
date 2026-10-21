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
    fn compacting_keeps_the_data() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        conn.execute_batch("CREATE TABLE t (v TEXT); INSERT INTO t VALUES ('kept');").unwrap();
        compact(&conn).unwrap();
        let value: String = conn.query_row("SELECT v FROM t", [], |row| row.get(0)).unwrap();
        assert_eq!(value, "kept");
    }
}
