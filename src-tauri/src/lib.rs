mod bible;
mod db;
mod displays;
mod voice;

use serde_json::Value;
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

#[tauri::command]
fn bible_translations(db: State<Db>) -> Result<Vec<Value>, String> {
    with_db(&db, bible::translations)
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
fn start_sermon_listen(app: tauri::AppHandle) -> Result<(), String> {
    voice::start_transcribe(app)
}

#[tauri::command]
fn stop_sermon_listen() {
    voice::stop_transcribe();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();
    voice::relaunch_inside_bundle();
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(Output::default())
        .setup(|app| {
            let database = db::open(app.handle()).map_err(|message| std::io::Error::other(message))?;
            app.manage(database);
            displays::place_operator(app.handle());
            displays::reconcile(app.handle()).map_err(|message| std::io::Error::other(message))?;
            displays::start(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
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
            bible_translations,
            bible_books,
            bible_verses,
            bible_passage,
            bible_search,
            request_listen_access,
            open_privacy_settings,
            start_sermon_listen,
            stop_sermon_listen
        ])
        .run(tauri::generate_context!())
        .expect("error while running Church Studio");
}
