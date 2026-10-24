// Nested ifs read as the steps they are; let-chains are not used here.
#![allow(clippy::collapsible_if)]


mod audio_out;
mod easyworship;
mod bible;
mod entitlement;
mod signin;
mod db;
mod diagnostics;
mod places;
mod displays;
mod remote;
#[cfg(any(target_os = "macos", target_os = "windows"))]
mod noise;
mod broadcast;
mod ndi;
mod voice;
mod storage;
#[cfg(any(target_os = "macos", target_os = "windows"))]
mod whisper;

use serde_json::Value;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager, State};

use crate::db::Db;
use crate::displays::{reconcile_blocking, set_preferences, status, Output, OutputStatus};

fn with_db<T>(state: &State<Db>, f: impl FnOnce(&rusqlite::Connection) -> Result<T, String>) -> Result<T, String> {
    let guard = state.0.lock().unwrap_or_else(|poison| poison.into_inner());
    f(&guard)
}

/// The library that could not be opened and was set aside at launch (its file name), for the desk to say once.
struct StartupNotice(Mutex<Option<String>>);

/// One entry of a pictures folder: a picture, a video, or a folder inside it.
#[derive(serde::Serialize)]
struct FolderEntry {
    name: String,
    path: String,
    kind: &'static str,
    bytes: u64,
    modified: u64,
    /// A folder: how many pictures and videos are directly inside it (shown on its tile).
    items: u32,
    /// A folder: how many folders are directly inside it (a folder of albums has no pictures of its own).
    folders: u32,
}

/// What a file is by its name: a picture, a video, or neither.
fn media_kind(name: &str) -> Option<&'static str> {
    let ext = std::path::Path::new(name).extension().and_then(|e| e.to_str()).unwrap_or("").to_ascii_lowercase();
    match ext.as_str() {
        "jpg" | "jpeg" | "png" | "gif" | "bmp" | "webp" => Some("image"),
        "mp4" | "m4v" | "mov" | "webm" => Some("video"),
        _ => None,
    }
}

/// Pictures and videos, and folders, directly inside a folder (each count stops at 9999).
fn media_count(dir: &std::path::Path) -> (u32, u32) {
    let (mut media, mut folders) = (0u32, 0u32);
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten().take(20_000) {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with('.') {
                continue;
            }
            if media_kind(&name).is_some() {
                media = (media + 1).min(9999);
            } else if entry.file_type().map(|kind| kind.is_dir()).unwrap_or(false) {
                folders = (folders + 1).min(9999);
            }
        }
    }
    (media, folders)
}

/// The pictures in a folder the person chose (and the folders inside it), shown where they are,
/// with no copying: the folder is opened to the window's picture loader, without its subfolders.
#[tauri::command(async)]
fn picture_folder(app: AppHandle, path: String) -> Result<Vec<FolderEntry>, String> {
    let dir = std::path::PathBuf::from(&path);
    if !dir.is_dir() {
        return Err("That folder could not be found.".into());
    }
    app.asset_protocol_scope().allow_directory(&dir, false).map_err(|error| error.to_string())?;
    list_pictures(&dir)
}

/// A folder's pictures (JPEG, PNG, GIF, BMP, WebP), videos (MP4, MOV, WebM) and the folders inside
/// it; hidden ones left out.
fn list_pictures(dir: &std::path::Path) -> Result<Vec<FolderEntry>, String> {
    let mut entries = Vec::new();
    for entry in std::fs::read_dir(dir).map_err(|error| format!("That folder could not be read. {error}"))?.flatten().take(10_000) {
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') {
            continue;
        }
        let Ok(meta) = entry.metadata() else { continue };
        let modified = meta.modified().ok().and_then(|at| at.duration_since(std::time::UNIX_EPOCH).ok()).map(|at| at.as_millis() as u64).unwrap_or(0);
        let (kind, (items, folders)) = if meta.is_dir() {
            ("folder", media_count(&entry.path()))
        } else {
            match media_kind(&name) {
                Some(kind) => (kind, (0, 0)),
                None => continue,
            }
        };
        entries.push(FolderEntry { name, path: entry.path().to_string_lossy().to_string(), kind, bytes: meta.len(), modified, items, folders });
    }
    Ok(entries)
}

/// Where pictures usually are on this computer: Pictures, Desktop, and synced cloud drives.
#[tauri::command(async)]
fn picture_places(app: AppHandle) -> Vec<places::Place> {
    let path = app.path();
    places::find(path.home_dir().ok(), path.picture_dir().ok(), path.desktop_dir().ok())
}

/// Get ready for the browser to come back after signing in: the port it returns to.
#[tauri::command]
fn signin_listen(app: AppHandle) -> Result<u16, String> {
    signin::listen(app)
}

#[tauri::command]
fn startup_notice(notice: State<StartupNotice>) -> Option<String> {
    notice.0.lock().unwrap_or_else(|poison| poison.into_inner()).take()
}

#[tauri::command]
fn output_status(output: State<Output>) -> OutputStatus {
    status(&output)
}

#[tauri::command]
fn open_audience(app: AppHandle, output: State<Output>) -> Result<OutputStatus, String> {
    let mode = output
        .mode
        .lock()
        .unwrap_or_else(|poison| poison.into_inner())
        .clone();
    set_preferences(&output, true, &mode);
    reconcile_blocking(&app)?;
    Ok(status(&output))
}

#[tauri::command]
fn set_output(app: AppHandle, output: State<Output>, enabled: bool, mode: String) -> Result<OutputStatus, String> {
    set_preferences(&output, enabled, &mode);
    reconcile_blocking(&app)?;
    Ok(status(&output))
}

#[tauri::command]
fn refresh_displays(app: AppHandle, output: State<Output>) -> Result<OutputStatus, String> {
    *output
        .signature
        .lock()
        .unwrap_or_else(|poison| poison.into_inner()) = String::new();
    reconcile_blocking(&app)?;
    Ok(status(&output))
}

#[tauri::command]
fn test_output(app: AppHandle, output: State<Output>) -> Result<(), String> {
    let _ = output;
    app.emit("output-test", true).map_err(|e| e.to_string())
}

#[tauri::command]
fn assign_audience(app: AppHandle, output: State<Output>, display_key: Option<String>) -> Result<OutputStatus, String> {
    let key = display_key.filter(|value| !value.is_empty());
    *output
        .audience_key
        .lock()
        .unwrap_or_else(|poison| poison.into_inner()) = key;
    *output
        .signature
        .lock()
        .unwrap_or_else(|poison| poison.into_inner()) = String::new();
    reconcile_blocking(&app)?;
    Ok(status(&output))
}

#[tauri::command]
fn assign_operator(app: AppHandle, output: State<Output>, display_key: Option<String>) -> Result<OutputStatus, String> {
    let key = display_key.filter(|value| !value.is_empty());
    *output
        .operator_key
        .lock()
        .unwrap_or_else(|poison| poison.into_inner()) = key.clone();
    let app2 = app.clone();
    app.run_on_main_thread(move || displays::place_operator_on(&app2, key.as_deref()))
        .map_err(|e| e.to_string())?;
    Ok(status(&output))
}

#[tauri::command]
fn close_audience(app: AppHandle, output: State<Output>) -> Result<OutputStatus, String> {
    let mode = output
        .mode
        .lock()
        .unwrap_or_else(|poison| poison.into_inner())
        .clone();
    set_preferences(&output, false, &mode);
    reconcile_blocking(&app)?;
    Ok(status(&output))
}

#[tauri::command]
fn publish_program(app: AppHandle, output: State<Output>, frame: Value) -> Result<(), String> {
    *output
        .program
        .lock()
        .unwrap_or_else(|poison| poison.into_inner()) = frame.clone();
    app.emit("program-frame", frame).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_program(output: State<Output>) -> Value {
    output
        .program
        .lock()
        .unwrap_or_else(|poison| poison.into_inner())
        .clone()
}

#[tauri::command(async)]
fn workspace_load(db: State<Db>) -> Result<Option<Value>, String> {
    with_db(&db, db::workspace_load)
}

#[tauri::command(async)]
fn workspace_save(db: State<Db>, document: Value) -> Result<(), String> {
    with_db(&db, |conn| db::workspace_save(conn, &document))
}

#[tauri::command(async)]
fn theme_list(db: State<Db>) -> Result<Vec<Value>, String> {
    with_db(&db, db::theme_list)
}

#[tauri::command(async)]
fn theme_delete(db: State<Db>, id: String) -> Result<(), String> {
    with_db(&db, |conn| db::theme_delete(conn, &id))
}

#[tauri::command(async)]
fn theme_save(db: State<Db>, document: Value) -> Result<(), String> {
    with_db(&db, |conn| db::theme_save(conn, &document))
}

#[tauri::command(async)]
fn song_list(db: State<Db>) -> Result<Vec<Value>, String> {
    with_db(&db, db::song_list)
}

#[tauri::command(async)]
fn song_search(db: State<Db>, query: String) -> Result<Vec<Value>, String> {
    with_db(&db, |conn| db::song_search(conn, &query))
}

#[tauri::command(async)]
fn song_save(db: State<Db>, document: Value) -> Result<(), String> {
    with_db(&db, |conn| db::song_save(conn, &document))
}

#[tauri::command(async)]
fn service_delete(db: State<Db>, id: String) -> Result<(), String> {
    with_db(&db, |conn| db::service_delete(conn, &id))
}

#[tauri::command(async)]
fn media_delete(db: State<Db>, id: String) -> Result<(), String> {
    with_db(&db, |conn| db::media_delete(conn, &id))
}

#[tauri::command(async)]
fn song_delete(db: State<Db>, id: String) -> Result<(), String> {
    with_db(&db, |conn| db::song_delete(conn, &id))
}

#[tauri::command(async)]
fn sermon_list(db: State<Db>) -> Result<Vec<Value>, String> {
    with_db(&db, db::sermon_list)
}

#[tauri::command(async)]
fn sermon_save(db: State<Db>, document: Value) -> Result<(), String> {
    with_db(&db, |conn| db::sermon_save(conn, &document))
}

#[tauri::command(async)]
fn sermon_delete(db: State<Db>, id: String) -> Result<(), String> {
    with_db(&db, |conn| db::sermon_delete(conn, &id))
}

#[tauri::command(async)]
fn service_list(db: State<Db>) -> Result<Vec<Value>, String> {
    with_db(&db, db::service_list)
}

#[tauri::command(async)]
fn service_get(db: State<Db>, id: String) -> Result<Option<Value>, String> {
    with_db(&db, |conn| db::service_get(conn, &id))
}

#[tauri::command(async)]
fn service_save(db: State<Db>, document: Value) -> Result<(), String> {
    with_db(&db, |conn| db::service_save(conn, &document))
}

#[tauri::command(async)]
fn import_library(db: State<Db>, snapshot: Value) -> Result<(), String> {
    with_db(&db, |conn| db::import_library(conn, &snapshot))
}

#[tauri::command(async)]
fn media_list(db: State<Db>) -> Result<Vec<Value>, String> {
    with_db(&db, db::media_list)
}

/// Facts for the Readiness check: which of these files are missing, and whether the library
/// reads back whole. The church sees only the outcome, in its own words.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ReadyFacts {
    missing: Vec<usize>,
    library_ok: bool,
}

#[tauri::command(async)]
fn ready_facts(db: State<Db>, paths: Vec<String>) -> ReadyFacts {
    let missing = paths.iter().enumerate().filter(|(_, path)| !std::path::Path::new(path).is_file()).map(|(index, _)| index).collect();
    let library_ok = with_db(&db, |conn| conn.query_row("PRAGMA quick_check", [], |row| row.get::<_, String>(0)).map_err(|error| error.to_string()))
        .map(|answer| answer == "ok")
        .unwrap_or(false);
    ReadyFacts { missing, library_ok }
}

/// The desk is up and usable: the launch's length is noted for the Performance page.
#[tauri::command]
fn desk_ready(app: AppHandle, steps: Vec<(String, u64)>) {
    diagnostics::desk_ready(&app, steps);
}

/// Figures for the Performance page and the support file: recent launches, freezes in the last 30
/// days, memory, and space on the drive that holds the library.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct HealthFacts {
    startups: Vec<diagnostics::Startup>,
    hangs: Vec<diagnostics::Hang>,
    memory: diagnostics::Memory,
    library_free: Option<u64>,
    uptime_secs: u64,
}

#[tauri::command(async)]
fn health_facts(app: AppHandle) -> HealthFacts {
    let crash_log = app.path().app_log_dir().ok().and_then(|dir| std::fs::read_to_string(dir.join("crash.log")).ok()).unwrap_or_default();
    let month_ago = diagnostics::now_secs().saturating_sub(30 * 86_400);
    HealthFacts {
        startups: diagnostics::read_startups(&app),
        hangs: diagnostics::hangs_since(&crash_log, month_ago),
        memory: diagnostics::memory(),
        library_free: app.path().app_data_dir().ok().and_then(|dir| storage::free_space(&dir)),
        uptime_secs: diagnostics::uptime_secs(),
    }
}

/// Room left where recordings are saved, in bytes (None when it cannot be told).
#[tauri::command(async)]
fn record_room(folder: Option<String>) -> Option<u64> {
    let file = broadcast::record_path(folder.as_deref(), "x");
    storage::free_space(file.parent()?)
}

/// Add a file to Media. A file already there (the same bytes) is not stored twice: its entry comes
/// back marked `existing`. The copy (a clone where the drive allows) happens outside the library's
/// lock, so a long video does not hold up saving.
#[tauri::command(async)]
fn import_media(app: AppHandle, db: State<Db>, path: String) -> Result<Value, String> {
    let source = std::path::Path::new(&path);
    let (name, ext, kind) = db::media_source(source)?;
    let kept: Vec<Value> = with_db(&db, db::media_list)?.into_iter().filter(|asset| asset["kind"] == kind).collect();
    let paths: Vec<std::path::PathBuf> = kept.iter().map(|asset| std::path::PathBuf::from(asset["path"].as_str().unwrap_or_default())).collect();
    if let Some(index) = storage::same_file(source, &paths) {
        let mut found = kept[index].clone();
        found["existing"] = Value::Bool(true);
        return Ok(found);
    }
    let (id, dest) = db::media_dest(&app, &ext)?;
    storage::clone_or_copy(source, &dest)?;
    with_db(&db, |conn| db::record_media(conn, &id, &name, &dest, kind))
}

/// Raw image bytes in the request body; the name is URL-encoded in `x-media-name`.
#[tauri::command(async)]
fn import_media_bytes(app: AppHandle, db: State<Db>, request: tauri::ipc::Request<'_>) -> Result<Value, String> {
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err("Send the image as raw bytes.".into());
    };
    let name = request
        .headers()
        .get("x-media-name")
        .and_then(|value| value.to_str().ok())
        .map(percent_decode)
        .unwrap_or_else(|| "image".into());
    let kept: Vec<Value> = with_db(&db, db::media_list)?.into_iter().filter(|asset| asset["kind"] == "image").collect();
    let paths: Vec<std::path::PathBuf> = kept.iter().map(|asset| std::path::PathBuf::from(asset["path"].as_str().unwrap_or_default())).collect();
    if let Some(index) = storage::same_bytes(bytes, &paths) {
        let mut found = kept[index].clone();
        found["existing"] = Value::Bool(true);
        return Ok(found);
    }
    with_db(&db, |conn| db::import_media_bytes(conn, &app, &name, bytes))
}

/// Decode `encodeURIComponent` output; invalid sequences are kept as typed.
fn percent_decode(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' && index + 2 < bytes.len() {
            if let Ok(value) = u8::from_str_radix(&input[index + 1..index + 3], 16) {
                out.push(value);
                index += 3;
                continue;
            }
        }
        out.push(bytes[index]);
        index += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

#[tauri::command(async)]
fn bible_translations(db: State<Db>) -> Result<Vec<Value>, String> {
    with_db(&db, bible::translations)
}

#[tauri::command(async)]
fn bible_install(app: AppHandle, db: State<Db>, id: String) -> Result<(), String> {
    // A Bible that downloads on request: fetched and checked first, without holding the library.
    if bible::is_download(&id) {
        let dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("bibles");
        let path = bible::fetch_download(&id, &dir)?;
        return with_db(&db, |conn| bible::install_download(conn, &id, &path));
    }
    let resources = db::resource_dir(&app);
    with_db(&db, |conn| bible::install_translation(conn, &resources, &id))
}

/// Install a Bible read from a church's own file. Returns its id.
#[tauri::command(async)]
fn bible_import(db: State<Db>, bible: bible::ImportedBible) -> Result<String, String> {
    with_db(&db, |conn| bible::import_translation(conn, &bible))
}

/// A translation's whole text (books of chapters of verses), for the voice word index.
#[tauri::command(async)]
fn bible_source(db: State<Db>, translation_id: String) -> Result<Vec<Vec<Vec<String>>>, String> {
    with_db(&db, |conn| bible::source_books(conn, &translation_id))
}

#[tauri::command(async)]
fn bible_remove(db: State<Db>, id: String) -> Result<(), String> {
    with_db(&db, |conn| bible::remove_translation(conn, &id))
}

#[tauri::command(async)]
fn bible_books(db: State<Db>, translation_id: String) -> Result<Vec<Value>, String> {
    with_db(&db, |conn| bible::books(conn, &translation_id))
}

#[tauri::command(async)]
fn bible_verses(db: State<Db>, translation_id: String, book_ord: i32, chapter: i32) -> Result<Vec<Value>, String> {
    with_db(&db, |conn| bible::verses(conn, &translation_id, book_ord, chapter))
}

#[tauri::command(async)]
fn bible_passage(
    db: State<Db>,
    translation_id: String,
    book_ord: i32,
    chapter: i32,
    start_verse: i32,
    end_verse: i32,
) -> Result<Vec<Value>, String> {
    with_db(&db, |conn| {
        bible::passage(conn, &translation_id, book_ord, chapter, start_verse, end_verse)
    })
}

#[tauri::command(async)]
fn bible_search(db: State<Db>, translation_id: String, query: String) -> Result<Vec<Value>, String> {
    with_db(&db, |conn| bible::search(conn, &translation_id, &query))
}

#[tauri::command(async)]
fn request_listen_access() -> Result<voice::ListenAccess, String> {
    voice::request_access()
}

#[tauri::command]
fn open_privacy_settings(pane: Option<String>) -> Result<(), String> {
    voice::open_privacy_settings(pane.as_deref())
}

#[tauri::command(async)]
fn start_sermon_listen(app: tauri::AppHandle, run: u64, filter: Option<String>, words: Option<Vec<String>>, engine: Option<String>) -> Result<(), String> {
    voice::start_transcribe(app, run, filter.as_deref().unwrap_or("off"), &words.unwrap_or_default(), engine.as_deref() == Some("accurate"))
}

/// Space on this computer: what the app keeps, and the safe ways to make it smaller.
#[tauri::command(async)]
fn storage_usage(app: tauri::AppHandle) -> Result<storage::Usage, String> {
    storage::usage(&app)
}

#[tauri::command(async)]
fn storage_clear_cache(app: tauri::AppHandle) -> u64 {
    storage::clear_cache(&app)
}

#[tauri::command(async)]
fn storage_unused_media(app: tauri::AppHandle, db: tauri::State<'_, db::Db>) -> Result<Vec<storage::Unused>, String> {
    let media = app.path().app_data_dir().map_err(|error| error.to_string())?.join("media");
    let conn = db.0.lock().map_err(|_| "The library is busy. Try again.".to_string())?;
    storage::unused_media(&conn, &media)
}

/// Every picture and video with where it is used (Settings › Storage › Review files).
#[tauri::command(async)]
fn storage_media_usage(app: tauri::AppHandle, db: tauri::State<'_, db::Db>) -> Result<Vec<storage::MediaUse>, String> {
    let media = app.path().app_data_dir().map_err(|error| error.to_string())?.join("media");
    let conn = db.0.lock().map_err(|_| "The library is busy. Try again.".to_string())?;
    storage::media_usage(&conn, &media)
}

/// Delete unused pictures and videos: Media entries by id, leftover files by path.
#[tauri::command(async)]
fn storage_remove_unused(app: tauri::AppHandle, db: tauri::State<'_, db::Db>, ids: Vec<String>, files: Vec<String>) -> Result<(), String> {
    let media = app.path().app_data_dir().map_err(|error| error.to_string())?.join("media");
    let conn = db.0.lock().map_err(|_| "The library is busy. Try again.".to_string())?;
    for id in ids {
        db::media_delete(&conn, &id)?;
    }
    for file in files {
        storage::remove_leftover(&media, &file)?;
    }
    Ok(())
}

#[tauri::command(async)]
fn storage_compact(db: tauri::State<'_, db::Db>) -> Result<(), String> {
    let conn = db.0.lock().map_err(|_| "The library is busy. Try again.".to_string())?;
    storage::compact(&conn)
}

/// Accurate listening's model: whether it is here, and getting or removing it.
#[tauri::command(async)]
fn whisper_status(app: tauri::AppHandle) -> serde_json::Value {
    #[cfg(any(target_os = "macos", target_os = "windows"))]
    {
        serde_json::to_value(whisper::status(&app)).unwrap_or_default()
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = app;
        serde_json::json!({ "installed": false, "downloading": false, "bytes": 0, "unsupported": true })
    }
}

#[tauri::command]
fn whisper_download(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(any(target_os = "macos", target_os = "windows"))]
    {
        whisper::download(app)
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = app;
        Err("Accurate listening runs on macOS and Windows.".into())
    }
}

#[tauri::command]
fn whisper_cancel(app: tauri::AppHandle) {
    #[cfg(any(target_os = "macos", target_os = "windows"))]
    whisper::cancel_download(&app);
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    let _ = app;
}

#[tauri::command(async)]
fn whisper_delete(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(any(target_os = "macos", target_os = "windows"))]
    {
        whisper::delete(&app)
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = app;
        Ok(())
    }
}

/// Mic check: room and cleaned levels arrive as `noise-test` events until stopped.
#[tauri::command(async)]
fn start_noise_test(app: tauri::AppHandle, filter: String) -> Result<(), String> {
    #[cfg(any(target_os = "macos", target_os = "windows"))]
    {
        noise::start_test(app, noise::Filter::parse(&filter))
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = (app, filter);
        Err("The mic check runs on macOS and Windows.".into())
    }
}

/// Send Program over the network as an NDI source (macOS). Status arrives as `ndi-status` events.
#[tauri::command]
fn start_ndi(app: tauri::AppHandle, name: String, fps: u32, pattern: bool, audio: Option<bool>) -> Result<(), String> {
    entitlement::require(&app, "church", "NDI")?;
    ndi::start(app, ndi::Output::Program, &name, fps, pattern, audio.unwrap_or(true))
}

/// Go live and/or record (see broadcast.rs). Returns where the recording is being saved.
#[tauri::command]
fn start_broadcast(app: tauri::AppHandle, options: broadcast::Options, stamp: String) -> Result<Option<String>, String> {
    entitlement::require(&app, "church", "Streaming and recording")?;
    broadcast::start(app, options, stamp)
}

#[tauri::command]
fn stop_broadcast() {
    broadcast::stop();
}

/// Whether the audience window may be captured for streaming and recording (asking once, if `ask`).
#[tauri::command]
fn screen_capture_allowed(ask: bool) -> bool {
    broadcast::screen_capture_allowed(ask)
}

/// Whether NDI output is in this install (it is not in every build yet).
#[tauri::command]
fn ndi_available() -> bool {
    ndi::available()
}

#[tauri::command]
fn stop_ndi() {
    ndi::stop(ndi::Output::Program);
}

/// Send only the words on Program, on a transparent picture, for keying over cameras in OBS or
/// vMix (macOS). Status arrives as `ndi-key-status` events; `ndi_key_words` sets the words.
#[tauri::command]
fn start_ndi_key(app: tauri::AppHandle, name: String, fps: u32) -> Result<(), String> {
    entitlement::require(&app, "church", "NDI")?;
    ndi::start(app, ndi::Output::Key, &name, fps, false, false)
}

#[tauri::command]
fn stop_ndi_key() {
    ndi::stop(ndi::Output::Key);
}

#[tauri::command]
fn ndi_key_words(cue: String, body: String) {
    ndi::key_words(&cue, &body);
}

#[tauri::command(async)]
fn stop_noise_test() {
    #[cfg(any(target_os = "macos", target_os = "windows"))]
    noise::stop_test();
}

#[tauri::command(async)]
fn stop_sermon_listen() {
    voice::stop_transcribe();
}

#[tauri::command]
fn start_remote_lan(app: AppHandle, lan: State<Arc<remote::LanRemote>>) -> Value {
    if let Err(message) = entitlement::require(&app, "premium", "The phone remote") {
        return serde_json::json!({ "listening": false, "url": "", "port": remote::PORT, "error": message });
    }
    remote::start(app, Arc::clone(&lan));
    remote_lan_status(lan)
}

#[tauri::command]
fn remote_lan_status(lan: State<Arc<remote::LanRemote>>) -> Value {
    let listening = *lan.listening.lock().unwrap_or_else(|poison| poison.into_inner());
    let url = lan.url.lock().unwrap_or_else(|poison| poison.into_inner()).clone();
    let error = lan.error.lock().unwrap_or_else(|poison| poison.into_inner()).clone();
    serde_json::json!({ "listening": listening, "url": url, "port": remote::PORT, "error": error })
}

#[tauri::command]
fn stop_remote_lan(lan: State<Arc<remote::LanRemote>>) {
    remote::stop(&lan);
}

#[tauri::command]
fn remote_reply(lan: State<Arc<remote::LanRemote>>, id: String, envelope: Value) {
    remote::reply(&lan, id, envelope);
}

fn backup_file_name(name: &str) -> Result<&str, String> {
    if name.starts_with("Church Studio backup ") && name.ends_with(".json") && !name.contains(['/', '\\']) && !name.contains("..") {
        Ok(name)
    } else {
        Err("That is not a Church Studio backup file name.".into())
    }
}

/// Write a backup into the chosen folder, then keep only the newest twenty there.
#[tauri::command(async)]
fn backup_write(dir: String, name: String, contents: String) -> Result<(), String> {
    let folder = std::path::PathBuf::from(&dir);
    if !folder.is_dir() {
        return Err("The backup folder is not there any more. Choose it again.".into());
    }
    let name = backup_file_name(&name)?;
    let temp = folder.join(format!("{name}.partial"));
    std::fs::write(&temp, contents).map_err(|error| format!("The backup could not be written. {error}"))?;
    storage::rename_patiently(&temp, &folder.join(name)).map_err(|error| format!("The backup could not be saved. {error}"))?;
    let mut backups: Vec<String> = std::fs::read_dir(&folder)
        .map_err(|error| error.to_string())?
        .filter_map(|entry| entry.ok()?.file_name().into_string().ok())
        .filter(|file| backup_file_name(file).is_ok())
        .collect();
    backups.sort();
    let extra = backups.len().saturating_sub(20);
    for old in &backups[..extra] {
        let _ = std::fs::remove_file(folder.join(old));
    }
    Ok(())
}

/// The newest backup in a folder: its name and contents, or nothing.
#[tauri::command(async)]
fn backup_latest(dir: String) -> Result<Option<(String, String)>, String> {
    let folder = std::path::PathBuf::from(&dir);
    if !folder.is_dir() {
        return Err("The backup folder is not there any more. Choose it again.".into());
    }
    let latest = std::fs::read_dir(&folder)
        .map_err(|error| error.to_string())?
        .filter_map(|entry| entry.ok()?.file_name().into_string().ok())
        .filter(|file| backup_file_name(file).is_ok())
        .max();
    match latest {
        Some(name) => {
            let contents = std::fs::read_to_string(folder.join(&name)).map_err(|error| error.to_string())?;
            Ok(Some((name, contents)))
        }
        None => Ok(None),
    }
}

/// The desktop crash log (Rust panics), for a problem report. Empty when nothing crashed.
#[tauri::command(async)]
fn crash_log(app: tauri::AppHandle) -> String {
    use tauri::Manager;
    app.path()
        .app_log_dir()
        .ok()
        .and_then(|dir| std::fs::read_to_string(dir.join("crash.log")).ok())
        .map(|text| text.chars().rev().take(8000).collect::<Vec<_>>().into_iter().rev().collect())
        .unwrap_or_default()
}

/// The last lines of church-studio.log, sent with a crash or hang report.
#[tauri::command(async)]
fn diagnostic_log(app: tauri::AppHandle) -> String {
    diagnostics::log_path(&app).map(|path| diagnostics::log_tail(&path, 60)).unwrap_or_default()
}

/// Write any panic to crash.log in the app's log folder, so a church can send it in.
fn record_panics(app: &tauri::AppHandle) {
    use tauri::Manager;
    let Ok(dir) = app.path().app_log_dir() else { return };
    let _ = std::fs::create_dir_all(&dir);
    let file = dir.join("crash.log");
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let when = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|time| time.as_secs())
            .unwrap_or(0);
        let line = format!("[{when}] {info}\n");
        if let Ok(mut log) = std::fs::OpenOptions::new().create(true).append(true).open(&file) {
            let _ = std::io::Write::write_all(&mut log, line.as_bytes());
        }
        previous(info);
    }));
}

/// Songs from an EasyWorship 6 or 7 library folder (read-only), words as RTF.
#[tauri::command]
async fn easyworship_songs(folder: String) -> Result<Vec<easyworship::EasyWorshipSong>, String> {
    tauri::async_runtime::spawn_blocking(move || easyworship::read_songs(&folder))
        .await
        .map_err(|error| error.to_string())?
}

/// GET JSON from Planning Center for the Services import. Only that API host is allowed, and
/// the response is returned as text whatever the status (its error bodies explain the problem).
#[tauri::command]
async fn pco_get(url: String, authorization: String) -> Result<String, String> {
    if !url.starts_with("https://api.planningcenteronline.com/") {
        return Err("Only Planning Center can be reached from here.".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let agent: ureq::Agent = ureq::Agent::config_builder()
            .http_status_as_error(false)
            .timeout_global(Some(std::time::Duration::from_secs(20)))
            .build()
            .into();
        let mut response = agent
            .get(&url)
            .header("Authorization", &authorization)
            .header("Accept", "application/json")
            .call()
            .map_err(|error| format!("Planning Center could not be reached. {error}"))?;
        response
            .body_mut()
            .read_to_string()
            .map_err(|error| format!("Planning Center sent an unreadable reply. {error}"))
    })
    .await
    .map_err(|error| error.to_string())?
}

/// True for an address the AI assistant may be sent to: any https service, or a model running
/// on this computer (Ollama, LM Studio) over plain http.
fn ai_url_allowed(url: &str) -> bool {
    let Ok(uri) = url.parse::<ureq::http::Uri>() else { return false };
    let Some(authority) = uri.authority() else { return false };
    // No "user@host" tricks: the host must be exactly what it looks like.
    if authority.as_str().contains('@') {
        return false;
    }
    match uri.scheme_str() {
        Some("https") => true,
        Some("http") => matches!(authority.host(), "localhost" | "127.0.0.1" | "[::1]"),
        _ => false,
    }
}

/// POST a request to the church's own AI service (sermon summaries, slides, captions). The reply
/// body comes back as text whatever the status, since the services explain errors in it.
#[tauri::command]
async fn ai_post(url: String, headers: std::collections::HashMap<String, String>, body: String) -> Result<String, String> {
    ai_send(url, headers, Some(body)).await
}

/// GET from the church's AI service: the list of models its key can use.
#[tauri::command]
async fn ai_get(url: String, headers: std::collections::HashMap<String, String>) -> Result<String, String> {
    ai_send(url, headers, None).await
}

/// Long timeout: a summary can take a while on a model running on this computer.
async fn ai_send(url: String, headers: std::collections::HashMap<String, String>, body: Option<String>) -> Result<String, String> {
    if !ai_url_allowed(&url) {
        return Err("The AI address must start with https:// (or be a model on this computer).".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let agent: ureq::Agent = ureq::Agent::config_builder()
            .http_status_as_error(false)
            .timeout_global(Some(std::time::Duration::from_secs(120)))
            .build()
            .into();
        let mut response = match body {
            Some(body) => {
                let mut request = agent.post(&url);
                for (name, value) in &headers {
                    request = request.header(name.as_str(), value.as_str());
                }
                request.send(body.as_bytes())
            }
            None => {
                let mut request = agent.get(&url);
                for (name, value) in &headers {
                    request = request.header(name.as_str(), value.as_str());
                }
                request.call()
            }
        }
        .map_err(|error| format!("The AI service could not be reached. {error}"))?;
        response
            .body_mut()
            .read_to_string()
            .map_err(|error| format!("The AI service sent an unreadable reply. {error}"))
    })
    .await
    .map_err(|error| error.to_string())?
}

/// True for a vMix address the desk may call: this computer or the church's own network
/// (10.x, 172.16–31.x, 192.168.x, *.local, a bare machine name). Never the internet.
fn lan_host_allowed(host: &str) -> bool {
    let host = host.trim().trim_start_matches('[').trim_end_matches(']').to_ascii_lowercase();
    if host == "::1" || host == "localhost" {
        return true;
    }
    if host.is_empty() || host.contains(['/', '@', ':', '?', '#', ' ', '\\']) {
        return false;
    }
    if host.ends_with(".local") {
        return true;
    }
    if let Ok(ip) = host.parse::<std::net::Ipv4Addr>() {
        return ip.is_private() || ip.is_loopback() || ip.is_link_local();
    }
    // A plain machine name on the network ("vmix-pc"), not a domain on the internet.
    !host.contains('.') && host.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
}

/// Ask vMix's Web API (it allows no browser pages, so the desk asks through here). `query` is
/// empty for the state XML, or "Function=…&Input=…" for an action. The reply comes back as text.
#[tauri::command]
async fn vmix_get(host: String, port: u16, query: String) -> Result<String, String> {
    if !lan_host_allowed(&host) {
        return Err("vMix must be on this computer or the church network.".into());
    }
    if query.chars().any(|c| c.is_control() || c == '#') || query.len() > 300 {
        return Err("That vMix request is not allowed.".into());
    }
    let url = if query.is_empty() { format!("http://{host}:{port}/api/") } else { format!("http://{host}:{port}/api/?{query}") };
    tauri::async_runtime::spawn_blocking(move || {
        let agent: ureq::Agent = ureq::Agent::config_builder()
            .http_status_as_error(false)
            .timeout_global(Some(std::time::Duration::from_secs(3)))
            .build()
            .into();
        let mut response = agent.get(&url).call().map_err(|error| format!("vMix could not be reached. {error}"))?;
        response.body_mut().read_to_string().map_err(|error| format!("vMix sent an unreadable reply. {error}"))
    })
    .await
    .map_err(|error| error.to_string())?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    diagnostics::install_logger();
    voice::relaunch_inside_bundle();
    tauri::Builder::default()
        // One copy at a time. A second copy (opened again from the Dock or Finder, or the
        // development build beside the installed one) kept its own stale copy of the workspace and
        // saved it over this one's, emptying playlists. Opening again now brings this desk forward.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            use tauri::Manager;
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(Output::default())
        .setup(|app| {
            record_panics(app.handle());
            diagnostics::open_log(app.handle());
            diagnostics::start_watchdog(app.handle().clone());
            log::info!("Church Studio {} starting on {}", env!("CARGO_PKG_VERSION"), std::env::consts::OS);
            diagnostics::doing("opening the library");
            let (database, notice) = db::open(app.handle()).map_err(std::io::Error::other)?;
            app.manage(database);
            app.manage(StartupNotice(Mutex::new(notice)));
            diagnostics::doing("reading the license");
            app.manage(entitlement::load(app.handle()));
            diagnostics::doing("placing the desk window");
            displays::place_operator(app.handle());
            // The screens are checked again every second, so a first look that fails is not fatal.
            diagnostics::doing("checking screens at launch");
            if let Err(error) = displays::reconcile(app.handle()) {
                log::warn!("Screens could not be placed at launch: {error}");
            }
            displays::start(app.handle().clone());
            app.manage(Arc::new(remote::LanRemote::default()));
            diagnostics::doing("starting NDI");
            ndi::start_hub();
            diagnostics::doing("running");
            log::info!("Started");
            Ok(())
        })
        // Each command from the desk is noted first: most run on the main thread, so the last one is
        // what the watchdog names when the window stops answering.
        .invoke_handler({
            let handler: Box<dyn Fn(tauri::ipc::Invoke<tauri::Wry>) -> bool + Send + Sync> = Box::new(tauri::generate_handler![
            entitlement::entitlement_status,
            entitlement::entitlement_set,
            entitlement::entitlement_note_time,
            entitlement::entitlement_clear,
            entitlement::entitlement_device,
            startup_notice,
            signin_listen,
            picture_folder,
            picture_places,
            pco_get,
            easyworship_songs,
            ai_post,
            ready_facts,
            desk_ready,
            health_facts,
            record_room,
            ai_get,
            crash_log,
            diagnostic_log,
            backup_write,
            backup_latest,
            output_status,
            open_audience,
            close_audience,
            set_output,
            refresh_displays,
            test_output,
            assign_audience,
            assign_operator,
            publish_program,
            get_program,
            workspace_load,
            workspace_save,
            theme_list,
            theme_save,
            theme_delete,
            song_list,
            song_search,
            song_save,
            song_delete,
            service_delete,
            media_delete,
            sermon_list,
            sermon_save,
            sermon_delete,
            service_list,
            service_get,
            service_save,
            import_library,
            media_list,
            import_media,
            import_media_bytes,
            bible_translations,
            bible_install,
            bible_import,
            bible_source,
            bible_remove,
            bible_books,
            bible_verses,
            bible_passage,
            bible_search,
            request_listen_access,
            open_privacy_settings,
            start_sermon_listen,
            whisper_status,
            storage_usage,
            storage_clear_cache,
            storage_compact,
            storage_unused_media,
            storage_media_usage,
            storage_remove_unused,
            whisper_download,
            whisper_cancel,
            whisper_delete,
            stop_sermon_listen,
            start_noise_test,
            start_ndi,
            ndi_available,
            stop_ndi,
            vmix_get,
            start_broadcast,
            screen_capture_allowed,
            stop_broadcast,
            start_ndi_key,
            stop_ndi_key,
            ndi_key_words,
            stop_noise_test,
            start_remote_lan,
            remote_lan_status,
            stop_remote_lan,
            remote_reply,
            audio_out::audio_outputs,
            audio_out::set_audio_output
        ]);
            move |invoke: tauri::ipc::Invoke<tauri::Wry>| {
                diagnostics::command(invoke.message.command());
                handler(invoke)
            }
        })
        .build(tauri::generate_context!())
        .expect("error while running Church Studio")
        .run(|_app, event| {
            // The Mac's sound output back to what it was before Church Studio chose one.
            if let tauri::RunEvent::Exit = event {
                audio_out::restore();
                // The speech helper and the microphone end with the app.
                voice::stop_transcribe();
            }
        });
}

#[cfg(test)]
mod tests {
    #[test]
    fn ai_addresses() {
        assert!(super::ai_url_allowed("https://api.anthropic.com/v1/messages"));
        assert!(super::ai_url_allowed("http://localhost:11434/v1/chat/completions"));
        assert!(!super::ai_url_allowed("http://example.com/v1"));
        assert!(!super::ai_url_allowed("file:///etc/passwd"));
        assert!(!super::ai_url_allowed("http://localhost:x@example.com/v1"));
        assert!(super::ai_url_allowed("http://127.0.0.1:1234/v1/chat/completions"));
    }

    use super::percent_decode;

    #[test]
    fn decodes_uri_component_names() {
        assert_eq!(percent_decode("Sermon%20notes%20%E2%80%94%20page%201.png"), "Sermon notes — page 1.png");
        assert_eq!(percent_decode("100%"), "100%");
        assert_eq!(percent_decode("%zz"), "%zz");
    }
}

#[cfg(test)]
mod backup_tests {
    use super::{backup_latest, backup_write};

    #[test]
    fn writes_keeps_twenty_and_reads_the_newest() {
        let dir = std::env::temp_dir().join(format!("cs-backup-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let folder = dir.to_string_lossy().to_string();
        for day in 1..=23 {
            let name = format!("Church Studio backup 2026-01-{day:02} 0900.json");
            backup_write(folder.clone(), name, format!("{{\"day\":{day}}}")).unwrap();
        }
        let count = std::fs::read_dir(&dir).unwrap().count();
        assert_eq!(count, 20);
        let (name, contents) = backup_latest(folder.clone()).unwrap().unwrap();
        assert_eq!(name, "Church Studio backup 2026-01-23 0900.json");
        assert_eq!(contents, "{\"day\":23}");
        assert!(backup_write(folder.clone(), "../escape.json".into(), "x".into()).is_err());
        std::fs::remove_dir_all(&dir).unwrap();
    }
}

#[cfg(test)]
mod vmix_tests {
    #[test]
    fn lists_pictures_videos_and_folders() {
        let dir = std::env::temp_dir().join(format!("cs-pictures-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(dir.join("Easter")).unwrap();
        for name in ["one.jpg", "two.mov", "notes.txt"] {
            std::fs::write(dir.join("Easter").join(name), b"x").unwrap();
        }
        for name in ["a.JPG", "b.png", "c.bmp", "notes.txt", ".hidden.png", "clip.mp4"] {
            std::fs::write(dir.join(name), b"x").unwrap();
        }
        let mut found: Vec<(String, &str)> = super::list_pictures(&dir).unwrap().into_iter().map(|entry| (entry.name, entry.kind)).collect();
        found.sort();
        assert_eq!(found, vec![("Easter".to_string(), "folder"), ("a.JPG".to_string(), "image"), ("b.png".to_string(), "image"), ("c.bmp".to_string(), "image"), ("clip.mp4".to_string(), "video")]);
        let easter = super::list_pictures(&dir).unwrap().into_iter().find(|entry| entry.kind == "folder").unwrap();
        assert_eq!((easter.items, easter.folders), (2, 0));
        // A folder of albums has no pictures of its own, but its folders are counted.
        std::fs::create_dir_all(dir.join("Easter").join("Sunrise")).unwrap();
        let easter = super::list_pictures(&dir).unwrap().into_iter().find(|entry| entry.kind == "folder").unwrap();
        assert_eq!((easter.items, easter.folders), (2, 1));
        let _ = std::fs::remove_dir_all(&dir);
    }

    use super::lan_host_allowed;

    #[test]
    fn vmix_stays_on_the_church_network() {
        for host in ["localhost", "127.0.0.1", "::1", "[::1]", "192.168.1.20", "10.0.0.5", "172.20.1.2", "vmix-pc", "VMIX.local"] {
            assert!(lan_host_allowed(host), "{host} should be allowed");
        }
        for host in ["", "8.8.8.8", "example.com", "evil.com/x", "user@192.168.1.2", "192.168.1.2:80", "172.40.1.1"] {
            assert!(!lan_host_allowed(host), "{host} should be refused");
        }
    }
}
