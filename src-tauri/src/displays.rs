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
    /// True after we ask AppKit to leave native fullscreen, until that bit is gone.
    #[cfg_attr(not(target_os = "macos"), allow(dead_code))]
    leaving_fullscreen: Mutex<bool>,
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
            leaving_fullscreen: Mutex::new(false),
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
            key: display_key_in(monitor, &monitors),
            primary: Some(monitor_key(monitor).as_str()) == primary_key.as_deref(),
        })
        .collect::<Vec<_>>();
    // Where the operator window is now: the audience never opens on top of it.
    let operator_key = app
        .get_webview_window("main")
        .and_then(|window| window.current_monitor().ok().flatten())
        .map(|monitor| display_key_in(&monitor, &monitors));
    let chosen_index = choose_index(&candidates, assigned.as_deref(), operator_key.as_deref());
    let displays = monitors
        .iter()
        .enumerate()
        .map(|(index, monitor)| display_info(monitor, &monitors, primary_key.as_deref(), chosen_index == Some(index)))
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
        let message = match displays.iter().find(|display| !display.primary) {
            Some(display) => format!(
                "External display detected: {}. Open output to show Program there.",
                display.name
            ),
            None if displays.is_empty() => "No displays were detected.".into(),
            None => "No external display is connected.".into(),
        };
        publish(app, &output, false, String::new(), message, &signature);
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
        || !frame_matches(&window, monitor);
    if needs_place {
        if release_native_fullscreen(&window, &output) {
            log::info!("AUDIENCE_LEAVE_FULLSCREEN");
            return Ok(());
        }
        // An assigned audience display the operator window was dragged onto: the desk moves to
        // another display first, so the audience does not cover it.
        if operator_key.as_deref() == Some(display_key_in(monitor, &monitors).as_str()) {
            if let Some(other) = monitors.iter().find(|other| display_key_in(other, &monitors) != display_key_in(monitor, &monitors)) {
                move_operator(app, other);
                log::info!("OPERATOR_MOVED_OFF_AUDIENCE to={}", monitor_name(other));
            }
        }
        crate::diagnostics::doing("placing the audience window");
        place(&window, monitor, fullscreen)?;
        window.show().map_err(|e| e.to_string())?;
        crate::diagnostics::doing("running");
        // Both modes are a dedicated output: above the menu bar and Dock of that display.
        // Do not focus the operator. Focusing it can pull the audience window back.
        join_active_space(&window)?;
        let (x, y, width, height) = screen_frame(monitor);
        log::info!("AUDIENCE_PLACED name={name} mode={mode} logical={x},{y} {width}x{height}");
    }
    // Read the real window frame back and say plainly if it does not cover the display.
    let message = match coverage(&window, monitor) {
        Some(report) if !report.covers => {
            log::warn!("AUDIENCE_COVERAGE {}", report.detail);
            format!("Audience on {name}, but the window does not cover the whole screen ({}).", report.detail)
        }
        _ => format!("Audience on {name}"),
    };
    publish(app, &output, true, name.clone(), message, &signature);
    Ok(())
}

/// Tauri sometimes reports no monitors while CoreGraphics still has the Dell.
#[cfg(target_os = "macos")]
fn place_with_appkit(app: &AppHandle, output: &Output) -> Result<bool, String> {
    let Some((x, y, width, height)) = first_external_ns_frame().or_else(external_display_points) else {
        return Ok(false);
    };
    let window = if let Some(window) = app.get_webview_window("audience") {
        window
    } else {
        audience_window(app)
            .inner_size(960.0, 540.0)
            .build()
            .map_err(|e| e.to_string())?
    };
    let fullscreen = lock(&output.mode).as_str() == "fullscreen";
    if release_native_fullscreen(&window, output) {
        log::info!("AUDIENCE_LEAVE_FULLSCREEN");
        return Ok(true);
    }
    window.set_decorations(false).map_err(|e| e.to_string())?;
    cover_cocoa_frame(&window, (x as f64, y as f64, width as f64, height as f64))?;
    window.show().map_err(|e| e.to_string())?;
    join_active_space(&window)?;
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
        fn CGMainDisplayID() -> u32;
    }
    unsafe {
        let main_height = CGDisplayBounds(CGMainDisplayID()).size.height;
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
            // CoreGraphics is top-left; AppKit window frames are bottom-left.
            let cocoa_y = top_left_to_cocoa_y(bounds.origin.y, bounds.size.height, main_height);
            return Some((
                bounds.origin.x.round() as i32,
                cocoa_y.round() as i32,
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

fn audience_window(app: &AppHandle) -> WebviewWindowBuilder<'_, tauri::Wry, AppHandle> {
    WebviewWindowBuilder::new(app, "audience", WebviewUrl::default())
        .initialization_script("window.__CHURCH_STUDIO_SURFACE__='audience';")
        .title("Audience")
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .visible(false)
        .focused(false)
        .visible_on_all_workspaces(true)
        .resizable(false)
        .shadow(false)
}

fn ensure_window(app: &AppHandle, monitor: &Monitor) -> Result<WebviewWindow, String> {
    if let Some(window) = app.get_webview_window("audience") {
        return Ok(window);
    }
    // The builder takes top-left coordinates; place() then sets the exact AppKit frame.
    let (x, y, width, height) = logical_frame(monitor);
    log::info!("Creating the audience window on {}", monitor_name(monitor));
    crate::diagnostics::doing("creating the audience window");
    let built = audience_window(app)
        .position(x, y)
        .inner_size(width, height)
        .build()
        .map_err(|e| e.to_string());
    crate::diagnostics::doing("running");
    built
}

fn place(window: &WebviewWindow, monitor: &Monitor, fullscreen: bool) -> Result<(), String> {
    window.set_decorations(false).map_err(|e| e.to_string())?;
    window
        .set_visible_on_all_workspaces(true)
        .map_err(|e| e.to_string())?;
    // Cover the display with a borderless window. AppKit aborts if the fullscreen
    // style bit is cleared outside a fullscreen transition.
    #[cfg(target_os = "macos")]
    {
        if let Some(frame) = ns_screen_frame(monitor) {
            cover_cocoa_frame(window, frame)?;
            let (x, y, width, height) = frame;
            log::info!("AUDIENCE_PLACE cocoa={x},{y} {width}x{height} fullscreen={fullscreen}");
            return Ok(());
        }
    }
    let (x, y, width, height) = logical_frame(monitor);
    window
        .set_size(LogicalSize::new(width, height))
        .map_err(|e| e.to_string())?;
    window
        .set_position(LogicalPosition::new(x, y))
        .map_err(|e| e.to_string())?;
    log::info!("AUDIENCE_PLACE logical={x},{y} {width}x{height} fullscreen={fullscreen}");
    Ok(())
}

/// Set the window to an AppKit frame (points, bottom-left origin) in one call.
/// Using NSScreen.frame end to end avoids two bugs of the tao path: its top-left Y
/// misplaced displays that are not top-aligned with the main screen, and resizing
/// after moving kept the bottom-left fixed, shifting the top edge.
#[cfg(target_os = "macos")]
fn cover_cocoa_frame(window: &WebviewWindow, frame: (f64, f64, f64, f64)) -> Result<(), String> {
    use objc2_app_kit::NSWindow;
    use objc2_foundation::{NSPoint, NSRect, NSSize};
    let pointer = window.ns_window().map_err(|e| e.to_string())?;
    let ns_window = unsafe { &*(pointer as *const NSWindow) };
    let (x, y, width, height) = frame;
    ns_window.setFrame_display(NSRect::new(NSPoint::new(x, y), NSSize::new(width.max(1.0), height.max(1.0))), true);
    Ok(())
}

/// Convert a top-left-origin Y (CoreGraphics, tao) to AppKit's bottom-left origin.
fn top_left_to_cocoa_y(top_left_y: f64, height: f64, main_height: f64) -> f64 {
    main_height - (top_left_y + height)
}

/// AppKit window points. Tao's monitor frame is not always the same origin as NSScreen.
fn screen_frame(monitor: &Monitor) -> (f64, f64, f64, f64) {
    #[cfg(target_os = "macos")]
    {
        if let Some(frame) = ns_screen_frame(monitor) {
            return frame;
        }
    }
    logical_frame(monitor)
}

#[cfg(target_os = "macos")]
fn first_external_ns_frame() -> Option<(i32, i32, u32, u32)> {
    use objc2::MainThreadMarker;
    use objc2_app_kit::NSScreen;

    let marker = MainThreadMarker::new()?;
    let main = NSScreen::mainScreen(marker)?;
    let main_frame = main.frame();
    for screen in NSScreen::screens(marker) {
        let frame = screen.frame();
        let same_origin = (frame.origin.x - main_frame.origin.x).abs() < 1.0
            && (frame.origin.y - main_frame.origin.y).abs() < 1.0;
        if same_origin {
            continue;
        }
        return Some((
            frame.origin.x.round() as i32,
            frame.origin.y.round() as i32,
            frame.size.width.round() as u32,
            frame.size.height.round() as u32,
        ));
    }
    None
}

#[cfg(not(target_os = "macos"))]
#[allow(dead_code)]
fn first_external_ns_frame() -> Option<(i32, i32, u32, u32)> {
    None
}

#[cfg(target_os = "macos")]
fn ns_screen_frame(monitor: &Monitor) -> Option<(f64, f64, f64, f64)> {
    use objc2::MainThreadMarker;
    use objc2_app_kit::NSScreen;

    let marker = MainThreadMarker::new()?;
    let (x, y, width, _) = logical_frame(monitor);
    let screens = NSScreen::screens(marker);
    // The first screen holds the menu bar and defines the Cocoa origin.
    let main_height = screens.iter().next().map(|screen| screen.frame().size.height)?;
    // The display's own name is the surest match (tao's positions and sizes mix pixels and
    // points when a Retina screen sits beside a 1x one). Only a name shared by two displays
    // falls back to matching by place and size.
    let name = raw_monitor_name(monitor);
    let named = screens
        .iter()
        .filter(|screen| screen.localizedName().to_string() == name)
        .map(|screen| screen.frame())
        .collect::<Vec<_>>();
    if let [frame] = named.as_slice() {
        return Some((frame.origin.x, frame.origin.y, frame.size.width, frame.size.height));
    }
    let mut best: Option<(f64, (f64, f64, f64, f64))> = None;
    for screen in screens {
        let frame = screen.frame();
        let frame = (frame.origin.x, frame.origin.y, frame.size.width, frame.size.height);
        let Some(score) = screen_match_score((x, y, width), frame, main_height) else {
            continue;
        };
        if best.as_ref().is_none_or(|(best_score, _)| score < *best_score) {
            best = Some((score, frame));
        }
    }
    best.map(|(_, frame)| frame)
}

/// Ask AppKit to leave native fullscreen, once. Returns true while that transition is still running.
#[cfg(target_os = "macos")]
fn release_native_fullscreen(window: &WebviewWindow, output: &Output) -> bool {
    use objc2_app_kit::{NSWindow, NSWindowStyleMask};
    let Ok(pointer) = window.ns_window() else {
        return false;
    };
    let ns_window = unsafe { &*(pointer as *const NSWindow) };
    if !ns_window.styleMask().contains(NSWindowStyleMask::FullScreen) {
        *lock(&output.leaving_fullscreen) = false;
        return false;
    }
    if !*lock(&output.leaving_fullscreen) {
        ns_window.toggleFullScreen(None);
        *lock(&output.leaving_fullscreen) = true;
    }
    true
}

#[cfg(not(target_os = "macos"))]
fn release_native_fullscreen(_window: &WebviewWindow, _output: &Output) -> bool {
    false
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


struct Coverage {
    covers: bool,
    detail: String,
}

/// Compare the audience window's actual AppKit frame with the display it should cover.
#[cfg(target_os = "macos")]
fn coverage(window: &WebviewWindow, monitor: &Monitor) -> Option<Coverage> {
    let target = ns_screen_frame(monitor)?;
    let pointer = window.ns_window().ok()?;
    let ns_window = unsafe { &*(pointer as *const objc2_app_kit::NSWindow) };
    let frame = ns_window.frame();
    let actual = (frame.origin.x, frame.origin.y, frame.size.width, frame.size.height);
    // The screen AppKit says the window is on, by name, so the status never names the wrong one.
    let on = ns_window.screen().map(|screen| screen.localizedName().to_string());
    let wanted = raw_monitor_name(monitor);
    if let Some(on) = on.filter(|on| *on != wanted) {
        return Some(Coverage { covers: false, detail: format!("the window is on {on}, not {wanted}") });
    }
    Some(Coverage {
        covers: frames_close(actual, target),
        detail: format!(
            "window {:.0}x{:.0} at {:.0},{:.0}; screen {:.0}x{:.0} at {:.0},{:.0}",
            actual.2, actual.3, actual.0, actual.1, target.2, target.3, target.0, target.1
        ),
    })
}

#[cfg(not(target_os = "macos"))]
fn coverage(_window: &WebviewWindow, _monitor: &Monitor) -> Option<Coverage> {
    None
}

fn frame_matches(window: &WebviewWindow, monitor: &Monitor) -> bool {
    #[cfg(target_os = "macos")]
    {
        if let (Some(target), Ok(pointer)) = (ns_screen_frame(monitor), window.ns_window()) {
            let ns_window = unsafe { &*(pointer as *const objc2_app_kit::NSWindow) };
            let frame = ns_window.frame();
            let actual = (frame.origin.x, frame.origin.y, frame.size.width, frame.size.height);
            return frames_close(actual, target);
        }
    }
    let Ok(position) = window.outer_position() else {
        return false;
    };
    let Ok(size) = window.outer_size() else {
        return false;
    };
    let (x, y, width, height) = screen_frame(monitor);
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
    let target = key.and_then(|key| monitors.iter().find(|monitor| display_key_in(monitor, &monitors) == key));
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

/// The audience display: the assigned one; otherwise a display the operator window is not on,
/// external first (so dragging the desk onto the external screen sends the audience to the other).
fn choose_index(candidates: &[DisplayCandidate], assigned: Option<&str>, operator: Option<&str>) -> Option<usize> {
    if let Some(key) = assigned {
        return candidates.iter().position(|candidate| candidate.key == key);
    }
    let free = |candidate: &DisplayCandidate| Some(candidate.key.as_str()) != operator;
    candidates
        .iter()
        .position(|candidate| !candidate.primary && free(candidate))
        .or_else(|| if operator.is_some() { candidates.iter().position(free) } else { None })
}

/// Move the operator window to a display without focusing it (focus can pull the audience back).
fn move_operator(app: &AppHandle, monitor: &Monitor) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let position = monitor.position();
    let _ = window.unmaximize();
    let _ = window.set_position(PhysicalPosition::new(position.x, position.y));
    let _ = window.maximize();
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
    display_key(&raw_monitor_name(monitor), size.width, size.height, monitor.scale_factor())
}

/// A monitor's key among the ones connected: its name, size and scale, and where it sits only
/// when another connected monitor is the same model (two identical projectors), so every key is
/// unique and a single monitor keeps the key it always had.
fn display_key_in(monitor: &Monitor, all: &[Monitor]) -> String {
    let base = display_key_of(monitor);
    let twins = all.iter().filter(|other| display_key_of(other) == base).count();
    if twins <= 1 {
        return base;
    }
    let position = monitor.position();
    with_position(&base, position.x, position.y)
}

fn with_position(base: &str, x: i32, y: i32) -> String {
    format!("{base}@{x},{y}")
}

fn raw_monitor_name(monitor: &Monitor) -> String {
    monitor.name().cloned().unwrap_or_else(|| "Display".into())
}

fn monitor_name(monitor: &Monitor) -> String {
    friendly_name(monitor).unwrap_or_else(|| raw_monitor_name(monitor))
}

/// Tao's macOS name is "Monitor #model". NSScreen.localizedName is the name in System Settings.
#[cfg(target_os = "macos")]
fn friendly_name(monitor: &Monitor) -> Option<String> {
    use objc2::MainThreadMarker;
    use objc2_app_kit::NSScreen;

    let marker = MainThreadMarker::new()?;
    // Horizontal origin matches AppKit. Vertical origin does not: CoreGraphics is top-left.
    let (x, _, width, _) = logical_frame(monitor);
    let mut best: Option<(f64, String)> = None;
    for screen in NSScreen::screens(marker) {
        let frame = screen.frame();
        let dx = (frame.origin.x - x).abs();
        if dx > 8.0 || !width_matches(width, frame.size.width) {
            continue;
        }
        let name = screen.localizedName().to_string();
        if name.is_empty() {
            continue;
        }
        let score = dx + (frame.size.width - width).abs().min((frame.size.width - width * 2.0).abs());
        if best.as_ref().is_none_or(|(previous, _)| score < *previous) {
            best = Some((score, name));
        }
    }
    best.map(|(_, name)| name)
}

#[cfg(not(target_os = "macos"))]
fn friendly_name(_monitor: &Monitor) -> Option<String> {
    None
}

/// How well an NSScreen frame (Cocoa) matches a tao monitor (top-left points). Lower is better.
/// X alone is ambiguous for displays stacked above or below each other.
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
fn screen_match_score(monitor: (f64, f64, f64), screen: (f64, f64, f64, f64), main_height: f64) -> Option<f64> {
    let (x, y, width) = monitor;
    let (sx, sy, sw, sh) = screen;
    if !width_matches(width, sw) {
        return None;
    }
    let dx = (sx - x).abs();
    let dy = (top_left_to_cocoa_y(y, sh, main_height) - sy).abs();
    if dx > 48.0 {
        return None;
    }
    Some(dx + dy)
}

#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
fn frames_close(actual: (f64, f64, f64, f64), target: (f64, f64, f64, f64)) -> bool {
    (actual.0 - target.0).abs() <= 2.0
        && (actual.1 - target.1).abs() <= 2.0
        && (actual.2 - target.2).abs() <= 2.0
        && (actual.3 - target.3).abs() <= 2.0
}

#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
fn width_matches(reported: f64, actual: f64) -> bool {
    if actual <= 0.0 {
        return false;
    }
    let ratio = reported / actual;
    (reported - actual).abs() < 8.0 || (ratio - 0.5).abs() < 0.08 || (ratio - 2.0).abs() < 0.08
}

fn monitor_key(monitor: &Monitor) -> String {
    format!(
        "{}:{}:{}",
        monitor_name(monitor),
        monitor.position().x,
        monitor.position().y
    )
}

fn display_info(monitor: &Monitor, all: &[Monitor], primary_key: Option<&str>, audience: bool) -> DisplayInfo {
    let key = monitor_key(monitor);
    let (x, y, width, height) = logical_frame(monitor);
    DisplayInfo {
        key: display_key_in(monitor, all),
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

    #[cfg(target_os = "macos")]
    #[test]
    fn a_retina_width_still_matches_the_screen() {
        assert!(width_matches(720.0, 1440.0));
        assert!(width_matches(1920.0, 1920.0));
        assert!(!width_matches(1920.0, 1440.0));
    }

    #[test]
    fn display_key_is_stable() {
        assert_eq!(display_key("DELL U2415", 1920, 1200, 1.0), "DELL U2415|1920x1200|1.00");
        // Two identical projectors are told apart by where they sit.
        assert_eq!(with_position("Epson|1920x1080|1.00", 1920, 0), "Epson|1920x1080|1.00@1920,0");
        assert_eq!(display_key("Name|Odd", 100, 100, 2.0), "Name/Odd|100x100|2.00");
    }

    #[test]
    fn auto_uses_the_external_display() {
        let displays = vec![
            candidate("mac|2560x1600|2.00", true),
            candidate("dell|1920x1200|1.00", false),
        ];
        assert_eq!(choose_index(&displays, None, None), Some(1));
    }

    #[test]
    fn an_assigned_primary_display_is_honored() {
        let displays = vec![
            candidate("mac|2560x1600|2.00", true),
            candidate("dell|1920x1200|1.00", false),
        ];
        assert_eq!(choose_index(&displays, Some("mac|2560x1600|2.00"), None), Some(0));
    }

    #[test]
    fn auto_avoids_the_display_the_operator_is_on() {
        let displays = vec![candidate("mac|2560x1600|2.00", true), candidate("dell|1920x1080|1.00", false)];
        // The desk dragged onto the external display: the audience takes the laptop screen.
        assert_eq!(choose_index(&displays, None, Some("dell|1920x1080|1.00")), Some(0));
        // The desk on the laptop: the audience takes the external display, as before.
        assert_eq!(choose_index(&displays, None, Some("mac|2560x1600|2.00")), Some(1));
        // One display only: never on top of the desk.
        assert_eq!(choose_index(&displays[..1], None, Some("mac|2560x1600|2.00")), None);
    }

    #[test]
    fn an_assignment_wins_even_where_the_operator_is() {
        let displays = vec![candidate("mac|2560x1600|2.00", true), candidate("dell|1920x1080|1.00", false)];
        assert_eq!(choose_index(&displays, Some("dell|1920x1080|1.00"), Some("dell|1920x1080|1.00")), Some(1));
    }

    #[test]
    fn a_missing_assignment_does_not_move_to_another_display() {
        let displays = vec![
            candidate("mac|2560x1600|2.00", true),
            candidate("dell|1920x1200|1.00", false),
        ];
        assert_eq!(choose_index(&displays, Some("gone|1x1|1.00"), None), None);
        assert!(!fallback_allowed(Some("gone|1x1|1.00")));
    }

    // Built-in Retina 1512x982 pt at the origin; Dell 1920x1200 pt to the right, top-aligned.
    // NSScreen reports the Dell at y = 982 - 1200 = -218 (bottom-left origin).
    #[test]
    fn converts_top_left_y_to_cocoa_for_a_taller_dell() {
        assert_eq!(top_left_to_cocoa_y(0.0, 1200.0, 982.0), -218.0);
        assert_eq!(top_left_to_cocoa_y(0.0, 982.0, 982.0), 0.0);
        // Dell placed above the laptop: top-left y = -1200 -> Cocoa y = 982.
        assert_eq!(top_left_to_cocoa_y(-1200.0, 1200.0, 982.0), 982.0);
    }

    #[test]
    fn matches_the_dell_screen_not_the_laptop() {
        let laptop = (0.0, 0.0, 1512.0, 982.0);
        let dell_right = (1512.0, -218.0, 1920.0, 1200.0);
        let dell_left = (-1920.0, -218.0, 1920.0, 1200.0);
        let dell_above = (0.0, 982.0, 1920.0, 1200.0);
        let main = 982.0;
        assert_eq!(screen_match_score((1512.0, 0.0, 1920.0), dell_right, main), Some(0.0));
        assert_eq!(screen_match_score((1512.0, 0.0, 1920.0), laptop, main), None);
        assert_eq!(screen_match_score((-1920.0, 0.0, 1920.0), dell_left, main), Some(0.0));
        // Stacked above with the same x as the laptop: y decides.
        let above = screen_match_score((0.0, -1200.0, 1920.0), dell_above, main);
        assert_eq!(above, Some(0.0));
        assert!(screen_match_score((0.0, 0.0, 1512.0), laptop, main) == Some(0.0));
    }

    #[test]
    fn frame_check_tolerates_rounding_only() {
        assert!(frames_close((1512.0, -218.0, 1920.0, 1200.0), (1512.5, -217.0, 1920.0, 1199.0)));
        assert!(!frames_close((1512.0, 0.0, 1920.0, 1080.0), (1512.0, -218.0, 1920.0, 1200.0)));
    }

    #[test]
    fn a_laptop_alone_stays_closed_until_it_is_assigned() {
        let displays = vec![candidate("mac|2560x1600|2.00", true)];
        assert_eq!(choose_index(&displays, None, None), None);
        assert!(fallback_allowed(None));
        assert!(fallback_allowed(Some("External display|1920x1200|1.00")));
    }
}
