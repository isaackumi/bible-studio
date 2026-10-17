mod bible;
mod db;
mod displays;
mod remote;
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
fn start_sermon_listen(app: tauri::AppHandle, run: u64) -> Result<(), String> {
    voice::start_transcribe(app, run)
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();
    voice::relaunch_inside_bundle();
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(Output::default())
        .setup(|app| {
            record_panics(app.handle());
            let database = db::open(app.handle()).map_err(|message| std::io::Error::other(message))?;
            app.manage(database);
            displays::place_operator(app.handle());
            displays::reconcile(app.handle()).map_err(|message| std::io::Error::other(message))?;
            displays::start(app.handle().clone());
            app.manage(Arc::new(remote::LanRemote::default()));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            pco_get,
            crash_log,
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
    use super::percent_decode;

    #[test]
    fn decodes_uri_component_names() {
        assert_eq!(percent_decode("Sermon%20notes%20%E2%80%94%20page%201.png"), "Sermon notes — page 1.png");
        assert_eq!(percent_decode("100%"), "100%");
        assert_eq!(percent_decode("%zz"), "%zz");
    }
}
