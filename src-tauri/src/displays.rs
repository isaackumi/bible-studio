use std::sync::Mutex;
use std::time::Duration;

use serde::Serialize;
use tauri::{
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, Monitor, PhysicalPosition, WebviewUrl,
    WebviewWindow, WebviewWindowBuilder,
};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DisplayInfo {
    pub key: String,
    pub name: String,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub scale: f64,
    pub primary: bool,
    pub audience: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OutputStatus {
    pub desired: bool,
    pub online: bool,
    pub display_name: String,
    pub message: String,
    pub audience_key: Option<String>,
    pub operator_key: Option<String>,
    pub displays: Vec<DisplayInfo>,
    pub mode: String,
}

pub struct Output {
    pub program: Mutex<serde_json::Value>,
    pub desired: Mutex<bool>,
    pub online: Mutex<bool>,
    pub display_name: Mutex<String>,
    pub message: Mutex<String>,
    pub signature: Mutex<String>,
    pub displays: Mutex<Vec<DisplayInfo>>,
    pub audience_key: Mutex<Option<String>>,
    pub operator_key: Mutex<Option<String>>,
    pub mode: Mutex<String>,
}

impl Default for Output {
    fn default() -> Self {
        Self {
            program: Mutex::new(serde_json::json!({
                "revision": 0,
                "transition": "cut",
                "transitionMs": 0,
                "frame": null
            })),
            desired: Mutex::new(false),
            online: Mutex::new(false),
            display_name: Mutex::new(String::new()),
            message: Mutex::new("Looking for the audience display".into()),
            signature: Mutex::new(String::new()),
            displays: Mutex::new(Vec::new()),
            audience_key: Mutex::new(None),
            operator_key: Mutex::new(None),
            mode: Mutex::new("window".into()),
        }
    }
}

fn lock<T>(mutex: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(|poison| poison.into_inner())
}

pub fn status(output: &Output) -> OutputStatus {
    OutputStatus {
        desired: *lock(&output.desired),
        online: *lock(&output.online),
        display_name: lock(&output.display_name).clone(),
        message: lock(&output.message).clone(),
        audience_key: lock(&output.audience_key).clone(),
        operator_key: lock(&output.operator_key).clone(),
        displays: lock(&output.displays).clone(),
        mode: lock(&output.mode).clone(),
    }
}

pub fn set_preferences(output: &Output, enabled: bool, mode: &str) {
    *lock(&output.desired) = enabled;
    *lock(&output.mode) = if mode == "fullscreen" {
        "fullscreen".into()
    } else {
        "window".into()
    };
    *lock(&output.signature) = String::new();
}

/// Window commands must run on the main thread. This waits so the operator sees the result.
pub fn reconcile_blocking(app: &AppHandle) -> Result<(), String> {
    let (tx, rx) = std::sync::mpsc::channel();
    let app2 = app.clone();
    app.run_on_main_thread(move || {
        let _ = tx.send(reconcile(&app2));
    })
    .map_err(|error| error.to_string())?;
    rx.recv_timeout(Duration::from_secs(3))
        .map_err(|_| "The display update did not finish.".to_string())?
}

pub fn start(app: AppHandle) {
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_millis(1000));
        let tick = app.clone();
        if app
            .run_on_main_thread(move || {
                if let Err(error) = reconcile(&tick) {
                    log::error!("display reconcile: {error}");
                }
            })
            .is_err()
        {
            break;
        }
    });
}

pub fn reconcile(app: &AppHandle) -> Result<(), String> {
    let output = app.state::<Output>();
    let monitors = match app.available_monitors() {
        Ok(monitors) => monitors,
        Err(error) => {
            log::error!("display list: {error}");
            publish(
                app,
                &output,
                false,
                String::new(),
                "Displays could not be listed. Output stays where it was.".into(),
                "unavailable",
            );
            return Ok(());
        }
    };
    let primary = app.primary_monitor().unwrap_or(None);
    let primary_key = primary.as_ref().map(monitor_key);
    let assigned = lock(&output.audience_key).clone();
    let candidates = monitors
        .iter()
        .map(|monitor| DisplayCandidate {
            key: display_key_of(monitor),
            primary: Some(monitor_key(monitor).as_str()) == primary_key.as_deref(),
        })
        .collect::<Vec<_>>();
    let chosen_index = choose_index(&candidates, assigned.as_deref());
    let displays = monitors
        .iter()
        .enumerate()
        .map(|(index, monitor)| display_info(monitor, primary_key.as_deref(), chosen_index == Some(index)))
        .collect::<Vec<_>>();
    let mode = lock(&output.mode).clone();
    let fullscreen = mode == "fullscreen";
    let signature = format!(
        "{}|{mode}",
        displays
            .iter()
            .map(|d| format!("{}:{}:{}:{}:{}", d.name, d.x, d.y, d.width, d.height))
            .collect::<Vec<_>>()
            .join("|")
    );
    *lock(&output.displays) = displays.clone();

    let desired = *lock(&output.desired);
    if !desired {
        if let Some(window) = app.get_webview_window("audience") {
            window.destroy().map_err(|e| e.to_string())?;
        }
        publish(
            app,
            &output,
            false,
            String::new(),
            "Audience output is closed".into(),
            &signature,
        );
        return Ok(());
    }

    let Some(index) = chosen_index else {
        if fallback_allowed(assigned.as_deref()) && place_with_appkit(app, &output)? {
            return Ok(());
        }
        if let Some(window) = app.get_webview_window("audience") {
            window.hide().map_err(|e| e.to_string())?;
        }
        let message = match assigned.as_deref() {
            Some(key) => {
                let name = key.split('|').next().unwrap_or("Audience");
                format!("Audience display {name} disconnected. Program is held until it returns.")
            }
            None => {
                if displays.iter().any(|display| !display.primary) {
                    "Choose an audience display, then open output.".into()
                } else if displays.is_empty() {
                    "No displays were detected.".into()
                } else {
                    "No external display is connected. Connect one, or choose this screen as the audience.".into()
                }
            }
        };
        publish(
            app,
            &output,
            false,
            String::new(),
            message,
            &signature,
        );
        return Ok(());
    };

    let monitor = &monitors[index];
    let name = monitor_name(monitor);
    let window = ensure_window(app, monitor)?;
    let previous = lock(&output.signature).clone();
    let needs_place = previous != signature
        || !window.is_visible().unwrap_or(false)
        || (!fullscreen && !frame_matches(&window, monitor));
    if needs_place {
        place(&window, monitor, fullscreen)?;
        window.show().map_err(|e| e.to_string())?;
        if !fullscreen {
            // Do not focus the operator. Focusing it can pull the audience window back.
            join_active_space(&window)?;
        }
        let (x, y, width, height) = logical_frame(monitor);
        log::info!("AUDIENCE_PLACED name={name} mode={mode} logical={x},{y} {width}x{height}");
    }
    publish(
        app,
        &output,
        true,
        name.clone(),
        format!("Audience on {name}"),
        &signature,
    );
    Ok(())
}

/// Tauri sometimes reports no monitors while CoreGraphics still has the Dell.
#[cfg(target_os = "macos")]
fn place_with_appkit(app: &AppHandle, output: &Output) -> Result<bool, String> {
    let Some((x, y, width, height)) = external_display_points() else {
        return Ok(false);
    };
    let window = if let Some(window) = app.get_webview_window("audience") {
        window
    } else {
        WebviewWindowBuilder::new(app, "audience", WebviewUrl::default())
            .title("Audience")
            .decorations(false)
            .always_on_top(true)
            .skip_taskbar(true)
            .visible(false)
            .focused(false)
            .visible_on_all_workspaces(true)
            .resizable(false)
            .shadow(false)
            .inner_size(960.0, 540.0)
            .build()
            .map_err(|e| e.to_string())?
    };
    let fullscreen = lock(&output.mode).as_str() == "fullscreen";
    window.set_decorations(false).map_err(|e| e.to_string())?;
    if fullscreen {
        window
            .set_position(LogicalPosition::new(x as f64 + 40.0, y as f64 + 40.0))
            .map_err(|e| e.to_string())?;
        window
            .set_fullscreen_on_monitor(PhysicalPosition::new(x as f64, y as f64))
            .map_err(|e| e.to_string())?;
    } else {
        window.set_fullscreen(false).map_err(|e| e.to_string())?;
        let _ = window.set_simple_fullscreen(false);
        window
            .set_position(LogicalPosition::new(x as f64, y as f64))
            .map_err(|e| e.to_string())?;
        window
            .set_size(LogicalSize::new(width as f64, height as f64))
            .map_err(|e| e.to_string())?;
        join_active_space(&window)?;
    }
    window.show().map_err(|e| e.to_string())?;
    log::info!("AUDIENCE_PLACE cg-points={x},{y} {width}x{height} fullscreen={fullscreen}");
    let fallback_key = display_key("External display", width, height, 1.0);
    {
        let mut listed = lock(&output.displays).clone();
        for item in &mut listed {
            item.audience = false;
        }
        if let Some(existing) = listed.iter_mut().find(|item| item.key == fallback_key) {
            existing.audience = true;
        } else {
            listed.push(DisplayInfo {
                key: fallback_key,
                name: "External display".into(),
                x,
                y,
                width,
                height,
                scale: 1.0,
                primary: false,
                audience: true,
            });
        }
        *lock(&output.displays) = listed;
    }
    publish(
        app,
        output,
        true,
        "External display".into(),
        "Audience on External display".into(),
        &format!("cg:{x}:{y}:{width}:{height}"),
    );
    Ok(true)
}

#[cfg(target_os = "macos")]
fn external_display_points() -> Option<(i32, i32, u32, u32)> {
    #[repr(C)]
    #[derive(Clone, Copy)]
    struct CgPoint {
        x: f64,
        y: f64,
    }
    #[repr(C)]
    #[derive(Clone, Copy)]
    struct CgSize {
        width: f64,
        height: f64,
    }
    #[repr(C)]
    #[derive(Clone, Copy)]
    struct CgRect {
        origin: CgPoint,
        size: CgSize,
    }
    #[link(name = "CoreGraphics", kind = "framework")]
    unsafe extern "C" {
        fn CGGetOnlineDisplayList(max_displays: u32, displays: *mut u32, count: *mut u32) -> i32;
        fn CGDisplayBounds(display: u32) -> CgRect;
        fn CGDisplayIsMain(display: u32) -> u32;
    }
    unsafe {
        let mut ids = [0u32; 8];
        let mut count = 0u32;
        if CGGetOnlineDisplayList(8, ids.as_mut_ptr(), &mut count) != 0 || count < 2 {
            return None;
        }
        for id in ids.into_iter().take(count as usize) {
            if CGDisplayIsMain(id) != 0 {
                continue;
            }
            let bounds = CGDisplayBounds(id);
            return Some((
                bounds.origin.x.round() as i32,
                bounds.origin.y.round() as i32,
                bounds.size.width.round() as u32,
                bounds.size.height.round() as u32,
            ));
        }
        None
    }
}

#[cfg(not(target_os = "macos"))]
fn place_with_appkit(_app: &AppHandle, _output: &Output) -> Result<bool, String> {
    Ok(false)
}

fn publish(
    app: &AppHandle,
    output: &Output,
    online: bool,
    name: String,
    message: String,
    signature: &str,
) {
    let changed = *lock(&output.online) != online
        || *lock(&output.display_name) != name
        || *lock(&output.message) != message
        || *lock(&output.signature) != signature;
    if changed {
        log::info!("displays {signature} online={online} message={message}");
    }
    *lock(&output.online) = online;
    *lock(&output.display_name) = name;
    *lock(&output.message) = message;
    *lock(&output.signature) = signature.to_string();
    if changed {
        let _ = app.emit("output-status", status(output));
    }
}

/// Tao reports monitor origin in physical pixels and then multiplies an already-physical
/// pixel size by the scale factor again. Points are what AppKit window placement uses.
fn logical_frame(monitor: &Monitor) -> (f64, f64, f64, f64) {
    logical_points(
        monitor.position().x,
        monitor.position().y,
        monitor.size().width,
        monitor.size().height,
        monitor.scale_factor(),
    )
}

fn logical_points(x: i32, y: i32, width: u32, height: u32, scale: f64) -> (f64, f64, f64, f64) {
    let scale = if scale.is_finite() && scale > 0.0 { scale } else { 1.0 };
    (
        x as f64 / scale,
        y as f64 / scale,
        (width as f64 / scale / scale).max(1.0),
        (height as f64 / scale / scale).max(1.0),
    )
}

fn ensure_window(app: &AppHandle, monitor: &Monitor) -> Result<WebviewWindow, String> {
    if let Some(window) = app.get_webview_window("audience") {
        return Ok(window);
    }
    let (x, y, width, height) = logical_frame(monitor);
    WebviewWindowBuilder::new(app, "audience", WebviewUrl::default())
        .title("Audience")
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .visible(false)
        .focused(false)
        .visible_on_all_workspaces(true)
        .resizable(false)
        .shadow(false)
        .position(x, y)
        .inner_size(width, height)
        .build()
        .map_err(|e| e.to_string())
}

fn place(window: &WebviewWindow, monitor: &Monitor, fullscreen: bool) -> Result<(), String> {
    let (x, y, width, height) = logical_frame(monitor);
    window.set_decorations(false).map_err(|e| e.to_string())?;
    window
        .set_visible_on_all_workspaces(true)
        .map_err(|e| e.to_string())?;
    if fullscreen {
        window.set_fullscreen(false).map_err(|e| e.to_string())?;
        #[cfg(target_os = "macos")]
        {
            let _ = window.set_simple_fullscreen(false);
        }
        window
            .set_position(LogicalPosition::new(x + 40.0, y + 40.0))
            .map_err(|e| e.to_string())?;
        let position = monitor.position();
        window
            .set_fullscreen_on_monitor(PhysicalPosition::new(position.x as f64, position.y as f64))
            .map_err(|e| e.to_string())?;
    } else {
        window.set_fullscreen(false).map_err(|e| e.to_string())?;
        #[cfg(target_os = "macos")]
        {
            let _ = window.set_simple_fullscreen(false);
        }
        window
            .set_position(LogicalPosition::new(x, y))
            .map_err(|e| e.to_string())?;
        window
            .set_size(LogicalSize::new(width, height))
            .map_err(|e| e.to_string())?;
    }
    log::info!("AUDIENCE_PLACE logical={x},{y} {width}x{height} fullscreen={fullscreen}");
    Ok(())
}

/// Keep the output above other windows without moving it off the display.
#[cfg(target_os = "macos")]
fn join_active_space(window: &WebviewWindow) -> Result<(), String> {
    use objc2_app_kit::{NSWindow, NSWindowCollectionBehavior, NSScreenSaverWindowLevel};
    let pointer = window.ns_window().map_err(|e| e.to_string())?;
    let ns_window = unsafe { &*(pointer as *const NSWindow) };
    let behavior = NSWindowCollectionBehavior::CanJoinAllSpaces
        | NSWindowCollectionBehavior::FullScreenAuxiliary
        | NSWindowCollectionBehavior::Stationary
        | NSWindowCollectionBehavior::IgnoresCycle
        | NSWindowCollectionBehavior::FullScreenDisallowsTiling;
    ns_window.setCollectionBehavior(behavior);
    ns_window.setLevel(NSScreenSaverWindowLevel);
    ns_window.setHidesOnDeactivate(false);
    ns_window.orderFrontRegardless();
    Ok(())
}

#[cfg(not(target_os = "macos"))]
fn join_active_space(_window: &WebviewWindow) -> Result<(), String> {
    Ok(())
}


fn frame_matches(window: &WebviewWindow, monitor: &Monitor) -> bool {
    let Ok(position) = window.outer_position() else {
        return false;
    };
    let Ok(size) = window.outer_size() else {
        return false;
    };
    let (x, y, width, height) = logical_frame(monitor);
    let scale = window.scale_factor().unwrap_or(1.0);
    let target_x = (x * scale).round() as i32;
    let target_y = (y * scale).round() as i32;
    let target_w = (width * scale).round() as u32;
    let target_h = (height * scale).round() as u32;
    (position.x - target_x).abs() <= 8
        && (position.y - target_y).abs() <= 8
        && size.width.abs_diff(target_w) <= 8
        && size.height.abs_diff(target_h) <= 8
}

pub fn place_operator(app: &AppHandle) {
    place_operator_on(app, None);
}

pub fn place_operator_on(app: &AppHandle, key: Option<&str>) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let monitors = app.available_monitors().unwrap_or_default();
    let target = key.and_then(|key| monitors.iter().find(|monitor| display_key_of(monitor) == key));
    let primary = app.primary_monitor().ok().flatten();
    let monitor = target.or(primary.as_ref());
    if let Some(monitor) = monitor {
        let position = monitor.position();
        let _ = window.set_position(PhysicalPosition::new(position.x, position.y));
    }
    let _ = window.maximize();
    let _ = window.set_focus();
}


#[allow(dead_code)]
fn focus_operator(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_focus();
    }
}

struct DisplayCandidate {
    key: String,
    primary: bool,
}

fn choose_index(candidates: &[DisplayCandidate], assigned: Option<&str>) -> Option<usize> {
    if let Some(key) = assigned {
        return candidates.iter().position(|candidate| candidate.key == key);
    }
    candidates.iter().position(|candidate| !candidate.primary)
}

fn fallback_allowed(assigned: Option<&str>) -> bool {
    match assigned {
        None => true,
        Some(key) => key.starts_with("External display|"),
    }
}

fn display_key(name: &str, width: u32, height: u32, scale: f64) -> String {
    format!("{}|{}x{}|{:.2}", name.replace('|', "/"), width, height, scale)
}

fn display_key_of(monitor: &Monitor) -> String {
    let size = monitor.size();
    display_key(&monitor_name(monitor), size.width, size.height, monitor.scale_factor())
}

fn monitor_name(monitor: &Monitor) -> String {
    monitor.name().cloned().unwrap_or_else(|| "Display".into())
}

fn monitor_key(monitor: &Monitor) -> String {
    format!(
        "{}:{}:{}",
        monitor_name(monitor),
        monitor.position().x,
        monitor.position().y
    )
}

fn display_info(monitor: &Monitor, primary_key: Option<&str>, audience: bool) -> DisplayInfo {
    let key = monitor_key(monitor);
    let (x, y, width, height) = logical_frame(monitor);
    DisplayInfo {
        key: display_key_of(monitor),
        name: monitor_name(monitor),
        x: x.round() as i32,
        y: y.round() as i32,
        width: width.round() as u32,
        height: height.round() as u32,
        scale: monitor.scale_factor(),
        primary: Some(key.as_str()) == primary_key,
        audience,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn candidate(key: &str, primary: bool) -> DisplayCandidate {
        DisplayCandidate {
            key: key.into(),
            primary,
        }
    }

    #[test]
    fn retina_monitor_reports_become_points() {
        let (x, y, width, height) = logical_points(0, 0, 6048, 3928, 2.0);
        assert_eq!((x, y), (0.0, 0.0));
        assert!((width - 1512.0).abs() < 0.01);
        assert!((height - 982.0).abs() < 0.01);
    }

    #[test]
    fn a_one_to_one_display_keeps_its_points() {
        let (x, _y, width, height) = logical_points(1512, 0, 1920, 1080, 1.0);
        assert_eq!((x, width, height), (1512.0, 1920.0, 1080.0));
    }

    #[test]
    fn display_key_is_stable() {
        assert_eq!(display_key("DELL U2415", 1920, 1200, 1.0), "DELL U2415|1920x1200|1.00");
        assert_eq!(display_key("Name|Odd", 100, 100, 2.0), "Name/Odd|100x100|2.00");
    }

    #[test]
    fn auto_uses_the_external_display() {
        let displays = vec![
            candidate("mac|2560x1600|2.00", true),
            candidate("dell|1920x1200|1.00", false),
        ];
        assert_eq!(choose_index(&displays, None), Some(1));
    }

    #[test]
    fn an_assigned_primary_display_is_honored() {
        let displays = vec![
            candidate("mac|2560x1600|2.00", true),
            candidate("dell|1920x1200|1.00", false),
        ];
        assert_eq!(choose_index(&displays, Some("mac|2560x1600|2.00")), Some(0));
    }

    #[test]
    fn a_missing_assignment_does_not_move_to_another_display() {
        let displays = vec![
            candidate("mac|2560x1600|2.00", true),
            candidate("dell|1920x1200|1.00", false),
        ];
        assert_eq!(choose_index(&displays, Some("gone|1x1|1.00")), None);
        assert!(!fallback_allowed(Some("gone|1x1|1.00")));
    }

    #[test]
    fn a_laptop_alone_stays_closed_until_it_is_assigned() {
        let displays = vec![candidate("mac|2560x1600|2.00", true)];
        assert_eq!(choose_index(&displays, None), None);
        assert!(fallback_allowed(None));
        assert!(fallback_allowed(Some("External display|1920x1200|1.00")));
    }
}
