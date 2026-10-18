mod bible;
mod db;
mod displays;
mod remote;
#[cfg(any(target_os = "macos", target_os = "windows"))]
mod noise;
mod ndi;
mod voice;

use serde_json::Value;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::db::Db;
use crate::displays::{reconcile_blocking, set_preferences, status, Output, OutputStatus};

fn with_db<T>(state: &State<Db>, f: impl FnOnce(&rusqlite::Connection) -> Result<T, String>) -> Result<T, String> {
    let guard = state.0.lock().unwrap_or_else(|poison| poison.into_inner());
    f(&guard)
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

#[tauri::command]
fn workspace_load(db: State<Db>) -> Result<Option<Value>, String> {
    with_db(&db, db::workspace_load)
}

#[tauri::command]
fn workspace_save(db: State<Db>, document: Value) -> Result<(), String> {
    with_db(&db, |conn| db::workspace_save(conn, &document))
}

#[tauri::command]
fn theme_list(db: State<Db>) -> Result<Vec<Value>, String> {
    with_db(&db, db::theme_list)
}

#[tauri::command]
fn theme_delete(db: State<Db>, id: String) -> Result<(), String> {
    with_db(&db, |conn| db::theme_delete(conn, &id))
}

#[tauri::command]
fn theme_save(db: State<Db>, document: Value) -> Result<(), String> {
    with_db(&db, |conn| db::theme_save(conn, &document))
}

#[tauri::command]
fn song_list(db: State<Db>) -> Result<Vec<Value>, String> {
    with_db(&db, db::song_list)
}

#[tauri::command]
fn song_search(db: State<Db>, query: String) -> Result<Vec<Value>, String> {
    with_db(&db, |conn| db::song_search(conn, &query))
}

#[tauri::command]
fn song_save(db: State<Db>, document: Value) -> Result<(), String> {
    with_db(&db, |conn| db::song_save(conn, &document))
}

#[tauri::command]
fn service_delete(db: State<Db>, id: String) -> Result<(), String> {
    with_db(&db, |conn| db::service_delete(conn, &id))
}

#[tauri::command]
fn media_delete(db: State<Db>, id: String) -> Result<(), String> {
    with_db(&db, |conn| db::media_delete(conn, &id))
}

#[tauri::command]
fn song_delete(db: State<Db>, id: String) -> Result<(), String> {
    with_db(&db, |conn| db::song_delete(conn, &id))
}

#[tauri::command]
fn sermon_list(db: State<Db>) -> Result<Vec<Value>, String> {
    with_db(&db, db::sermon_list)
}

#[tauri::command]
fn sermon_save(db: State<Db>, document: Value) -> Result<(), String> {
    with_db(&db, |conn| db::sermon_save(conn, &document))
}

#[tauri::command]
fn sermon_delete(db: State<Db>, id: String) -> Result<(), String> {
    with_db(&db, |conn| db::sermon_delete(conn, &id))
}

#[tauri::command]
fn service_list(db: State<Db>) -> Result<Vec<Value>, String> {
    with_db(&db, db::service_list)
}

#[tauri::command]
fn service_get(db: State<Db>, id: String) -> Result<Option<Value>, String> {
    with_db(&db, |conn| db::service_get(conn, &id))
}

#[tauri::command]
fn service_save(db: State<Db>, document: Value) -> Result<(), String> {
    with_db(&db, |conn| db::service_save(conn, &document))
}

#[tauri::command]
fn import_library(db: State<Db>, snapshot: Value) -> Result<(), String> {
    with_db(&db, |conn| db::import_library(conn, &snapshot))
}

#[tauri::command]
fn media_list(db: State<Db>) -> Result<Vec<Value>, String> {
    with_db(&db, db::media_list)
}

#[tauri::command]
fn import_media(app: AppHandle, db: State<Db>, path: String) -> Result<Value, String> {
    with_db(&db, |conn| db::import_media(conn, &app, std::path::Path::new(&path)))
}

/// Raw image bytes in the request body; the name is URL-encoded in `x-media-name`.
#[tauri::command]
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

#[tauri::command]
fn bible_translations(db: State<Db>) -> Result<Vec<Value>, String> {
    with_db(&db, bible::translations)
}

#[tauri::command]
fn bible_install(app: AppHandle, db: State<Db>, id: String) -> Result<(), String> {
    let resources = db::resource_dir(&app);
    with_db(&db, |conn| bible::install_translation(conn, &resources, &id))
}

#[tauri::command]
fn bible_remove(db: State<Db>, id: String) -> Result<(), String> {
    with_db(&db, |conn| bible::remove_translation(conn, &id))
}

#[tauri::command]
fn bible_books(db: State<Db>, translation_id: String) -> Result<Vec<Value>, String> {
    with_db(&db, |conn| bible::books(conn, &translation_id))
}

#[tauri::command]
fn bible_verses(db: State<Db>, translation_id: String, book_ord: i32, chapter: i32) -> Result<Vec<Value>, String> {
    with_db(&db, |conn| bible::verses(conn, &translation_id, book_ord, chapter))
}

#[tauri::command]
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

#[tauri::command]
fn bible_search(db: State<Db>, translation_id: String, query: String) -> Result<Vec<Value>, String> {
    with_db(&db, |conn| bible::search(conn, &translation_id, &query))
}

#[tauri::command]
fn request_listen_access() -> Result<voice::ListenAccess, String> {
    voice::request_access()
}

#[tauri::command]
fn open_privacy_settings() -> Result<(), String> {
    voice::open_privacy_settings()
}

#[tauri::command]
fn start_sermon_listen(app: tauri::AppHandle, run: u64, filter: Option<String>) -> Result<(), String> {
    voice::start_transcribe(app, run, filter.as_deref().unwrap_or("off"))
}

/// Mic check: room and cleaned levels arrive as `noise-test` events until stopped.
#[tauri::command]
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
fn start_ndi(app: tauri::AppHandle, name: String, fps: u32, pattern: bool) -> Result<(), String> {
    ndi::start(app, ndi::Output::Program, &name, fps, pattern)
}

#[tauri::command]
fn stop_ndi() {
    ndi::stop(ndi::Output::Program);
}

/// Send only the words on Program, on a transparent picture, for keying over cameras in OBS or
/// vMix (macOS). Status arrives as `ndi-key-status` events; `ndi_key_words` sets the words.
#[tauri::command]
fn start_ndi_key(app: tauri::AppHandle, name: String, fps: u32) -> Result<(), String> {
    ndi::start(app, ndi::Output::Key, &name, fps, false)
}

#[tauri::command]
fn stop_ndi_key() {
    ndi::stop(ndi::Output::Key);
}

#[tauri::command]
fn ndi_key_words(cue: String, body: String) {
    ndi::key_words(&cue, &body);
}

#[tauri::command]
fn stop_noise_test() {
    #[cfg(any(target_os = "macos", target_os = "windows"))]
    noise::stop_test();
}

#[tauri::command]
fn stop_sermon_listen() {
    voice::stop_transcribe();
}

#[tauri::command]
fn start_remote_lan(app: AppHandle, lan: State<Arc<remote::LanRemote>>) -> Value {
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
#[tauri::command]
fn backup_write(dir: String, name: String, contents: String) -> Result<(), String> {
    let folder = std::path::PathBuf::from(&dir);
    if !folder.is_dir() {
        return Err("The backup folder is not there any more. Choose it again.".into());
    }
    let name = backup_file_name(&name)?;
    let temp = folder.join(format!("{name}.partial"));
    std::fs::write(&temp, contents).map_err(|error| format!("The backup could not be written. {error}"))?;
    std::fs::rename(&temp, folder.join(name)).map_err(|error| format!("The backup could not be saved. {error}"))?;
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
#[tauri::command]
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
#[tauri::command]
fn crash_log(app: tauri::AppHandle) -> String {
    use tauri::Manager;
    app.path()
        .app_log_dir()
        .ok()
        .and_then(|dir| std::fs::read_to_string(dir.join("crash.log")).ok())
        .map(|text| text.chars().rev().take(8000).collect::<Vec<_>>().into_iter().rev().collect())
        .unwrap_or_default()
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

/// POST a request to the church's own AI service (sermon summaries). The reply body comes back
/// as text whatever the status, since the services explain errors in it. Long timeout: a summary
/// can take a while on a local model.
#[tauri::command]
async fn ai_post(url: String, headers: std::collections::HashMap<String, String>, body: String) -> Result<String, String> {
    if !ai_url_allowed(&url) {
        return Err("The AI address must start with https:// (or be a model on this computer).".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let agent: ureq::Agent = ureq::Agent::config_builder()
            .http_status_as_error(false)
            .timeout_global(Some(std::time::Duration::from_secs(120)))
            .build()
            .into();
        let mut request = agent.post(&url);
        for (name, value) in &headers {
            request = request.header(name.as_str(), value.as_str());
        }
        let mut response = request
            .send(body.as_bytes())
            .map_err(|error| format!("The AI service could not be reached. {error}"))?;
        response
            .body_mut()
            .read_to_string()
            .map_err(|error| format!("The AI service sent an unreadable reply. {error}"))
    })
    .await
    .map_err(|error| error.to_string())?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();
    voice::relaunch_inside_bundle();
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(Output::default())
        .setup(|app| {
            record_panics(app.handle());
            let database = db::open(app.handle()).map_err(|message| std::io::Error::other(message))?;
            app.manage(database);
            displays::place_operator(app.handle());
            displays::reconcile(app.handle()).map_err(|message| std::io::Error::other(message))?;
            displays::start(app.handle().clone());
            app.manage(Arc::new(remote::LanRemote::default()));
            ndi::start_hub();
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            pco_get,
            ai_post,
            crash_log,
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
            bible_remove,
            bible_books,
            bible_verses,
            bible_passage,
            bible_search,
            request_listen_access,
            open_privacy_settings,
            start_sermon_listen,
            stop_sermon_listen,
            start_noise_test,
            start_ndi,
            stop_ndi,
            start_ndi_key,
            stop_ndi_key,
            ndi_key_words,
            stop_noise_test,
            start_remote_lan,
            remote_lan_status,
            stop_remote_lan,
            remote_reply
        ])
        .run(tauri::generate_context!())
        .expect("error while running Church Studio");
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
