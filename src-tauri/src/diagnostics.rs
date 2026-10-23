// What a church can send when something goes wrong, and what reaches us by itself:
//
// - church-studio.log in the app's log folder: the core's own log lines (startup steps, screens,
//   windows), kept small (one old copy, 2 MB each). Before, these went to a terminal Windows never shows.
// - A watchdog. The window's main thread is asked to answer every second; when it has not answered
//   for HANG_AFTER, "Not responding" is written to crash.log with what the app was doing and the last
//   command from the desk. The next launch sends crash.log lines (telemetry.ts), so a freeze that
//   ends with Windows closing the app still reaches us.

use std::fs::{File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Manager};

/// Silence on the main thread this long is a hang (Windows says "Not responding" after 5 s).
const HANG_AFTER: Duration = Duration::from_secs(8);
const LOG_MAX: u64 = 2_000_000;
const EARLY_MAX: usize = 300;

fn started() -> Instant {
    static START: OnceLock<Instant> = OnceLock::new();
    *START.get_or_init(Instant::now)
}

fn since_start_ms() -> u64 {
    started().elapsed().as_millis() as u64
}

fn unix_secs() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|time| time.as_secs()).unwrap_or(0)
}

fn lock<T>(mutex: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(|poison| poison.into_inner())
}

// --- The log file -------------------------------------------------------------------------------

struct Sink {
    file: Option<File>,
    /// Lines logged before the log folder was known (the first moments of startup).
    early: Vec<String>,
}

struct Logger {
    sink: Mutex<Sink>,
}

static LOGGER: Logger = Logger { sink: Mutex::new(Sink { file: None, early: Vec::new() }) };

impl log::Log for Logger {
    fn enabled(&self, metadata: &log::Metadata) -> bool {
        // Ours at info; the libraries underneath only when something is wrong.
        metadata.level() <= if metadata.target().starts_with("church_studio") { log::Level::Info } else { log::Level::Warn }
    }

    fn log(&self, record: &log::Record) {
        if !self.enabled(record.metadata()) {
            return;
        }
        // Milliseconds since launch beside the time, so a slow step shows how slow.
        let line = format!("[{}] +{}ms {} {}: {}\n", unix_secs(), since_start_ms(), record.level(), record.target(), record.args());
        eprint!("{line}");
        let mut sink = lock(&self.sink);
        if let Some(file) = sink.file.as_mut() {
            let _ = file.write_all(line.as_bytes());
        } else if sink.early.len() < EARLY_MAX {
            sink.early.push(line);
        }
    }

    fn flush(&self) {
        if let Some(file) = lock(&self.sink).file.as_mut() {
            let _ = file.flush();
        }
    }
}

/// Take over logging (first thing at launch). Lines wait in memory until `open_log` has a folder.
pub fn install_logger() {
    let _ = started();
    if log::set_logger(&LOGGER).is_ok() {
        log::set_max_level(log::LevelFilter::Info);
    }
}

pub fn log_path(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_log_dir().ok().map(|dir| dir.join("church-studio.log"))
}

/// Start writing to church-studio.log (the last run's is kept as church-studio.old.log when large).
pub fn open_log(app: &AppHandle) {
    let Some(path) = log_path(app) else { return };
    if let Some(dir) = path.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    if std::fs::metadata(&path).map(|meta| meta.len() > LOG_MAX).unwrap_or(false) {
        let _ = std::fs::rename(&path, path.with_file_name("church-studio.old.log"));
    }
    let Ok(mut file) = OpenOptions::new().create(true).append(true).open(&path) else { return };
    let mut sink = lock(&LOGGER.sink);
    for line in sink.early.drain(..) {
        let _ = file.write_all(line.as_bytes());
    }
    sink.file = Some(file);
}

/// The last lines of the log, for a problem report.
pub fn log_tail(path: &Path, lines: usize) -> String {
    let text = std::fs::read_to_string(path).unwrap_or_default();
    let all: Vec<&str> = text.lines().collect();
    all[all.len().saturating_sub(lines)..].join("\n")
}

// --- What the app is doing ----------------------------------------------------------------------

static DOING: Mutex<(String, u64)> = Mutex::new((String::new(), 0));
static COMMAND: Mutex<(String, u64)> = Mutex::new((String::new(), 0));

/// What the core is in the middle of ("opening the library", "creating the audience window").
pub fn doing(what: &str) {
    let mut doing = lock(&DOING);
    if doing.0 != what {
        // Until the desk is up, each startup step and how long it took (for the Performance page).
        if !doing.0.is_empty() && READY_MS.load(Ordering::Relaxed) == 0 {
            lock(&STEPS).push((doing.0.clone(), since_start_ms().saturating_sub(doing.1)));
        }
        // Each step in the log, so a slow start says which step took the time.
        if what != "running" {
            log::info!("step: {what}");
        }
        *doing = (what.to_string(), since_start_ms());
    }
}

/// The last command the desk sent (most run on the main thread, so a stuck one is the likely cause).
pub fn command(name: &str) {
    *lock(&COMMAND) = (name.to_string(), since_start_ms());
}

fn ago(at: u64) -> String {
    format!("{:.1}s ago", since_start_ms().saturating_sub(at) as f64 / 1000.0)
}

/// One line for crash.log, in the "[unix seconds] message" form telemetry.ts reads.
pub fn hang_line(stalled: Duration, doing: &(String, u64), command: &(String, u64), uptime: Duration) -> String {
    let doing = if doing.0.is_empty() { "starting".to_string() } else { format!("{} (began {})", doing.0, ago(doing.1)) };
    let command = if command.0.is_empty() { "none yet".to_string() } else { format!("{} ({})", command.0, ago(command.1)) };
    format!(
        "[{}] HANG Not responding for {}s while {doing}; last command {command}; {}s after launch; {} {}\n",
        unix_secs(),
        stalled.as_secs(),
        uptime.as_secs(),
        std::env::consts::OS,
        env!("CARGO_PKG_VERSION"),
    )
}

// --- Startup and health -----------------------------------------------------------------------

static STEPS: Mutex<Vec<(String, u64)>> = Mutex::new(Vec::new());
/// When the desk said it was ready, in ms since launch (0: not yet).
static READY_MS: AtomicU64 = AtomicU64::new(0);
const STARTUPS_KEPT: usize = 10;

/// One launch: when, how long until the desk was usable, and the startup steps.
#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct Startup {
    pub at: u64,
    pub ms: u64,
    pub steps: Vec<(String, u64)>,
}

fn startups_path(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_log_dir().ok().map(|dir| dir.join("startups.json"))
}

pub fn read_startups(app: &AppHandle) -> Vec<Startup> {
    startups_path(app).and_then(|path| std::fs::read_to_string(path).ok()).and_then(|text| serde_json::from_str(&text).ok()).unwrap_or_default()
}

/// The desk is up: note how long the launch took, keeping the last few launches.
pub fn desk_ready(app: &AppHandle, desk_steps: Vec<(String, u64)>) {
    if READY_MS.compare_exchange(0, since_start_ms().max(1), Ordering::Relaxed, Ordering::Relaxed).is_err() {
        return;
    }
    let ms = READY_MS.load(Ordering::Relaxed);
    log::info!("desk ready after {ms}ms");
    let Some(path) = startups_path(app) else { return };
    let mut startups = read_startups(app);
    let mut steps = lock(&STEPS).clone();
    steps.extend(desk_steps.into_iter().take(40).map(|(name, ms)| (name.chars().take(60).collect(), ms)));
    startups.push(Startup { at: unix_secs(), ms, steps });
    let keep = startups.len().saturating_sub(STARTUPS_KEPT);
    let _ = std::fs::create_dir_all(path.parent().unwrap_or(Path::new(".")));
    let _ = std::fs::write(path, serde_json::to_string(&startups[keep..]).unwrap_or_default());
}

/// A freeze the watchdog noted: when, for how long, and what was happening (for support).
#[derive(serde::Serialize, Clone, PartialEq, Debug)]
pub struct Hang {
    pub at: u64,
    pub seconds: u64,
    pub during: String,
}

/// Freezes in crash.log since `since` (unix seconds).
pub fn hangs_since(crash_log: &str, since: u64) -> Vec<Hang> {
    crash_log
        .lines()
        .filter_map(|line| {
            let (stamp, rest) = line.strip_prefix('[')?.split_once("] HANG Not responding for ")?;
            let at: u64 = stamp.parse().ok()?;
            let (seconds, rest) = rest.split_once("s while ")?;
            let during = rest.split("; ").next().unwrap_or("").to_string();
            (at >= since).then(|| Hang { at, seconds: seconds.parse().unwrap_or(0), during })
        })
        .collect()
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Memory {
    pub total: u64,
    pub available: u64,
    /// This process and the ones it started (on a Mac the window's own processes are not among them).
    pub app: u64,
}

pub fn memory() -> Memory {
    use sysinfo::{ProcessRefreshKind, ProcessesToUpdate, System};
    let mut system = System::new();
    system.refresh_memory();
    system.refresh_processes_specifics(ProcessesToUpdate::All, true, ProcessRefreshKind::nothing().with_memory());
    let me = sysinfo::get_current_pid().ok();
    let app = system
        .processes()
        .values()
        .filter(|process| Some(process.pid()) == me || (me.is_some() && process.parent() == me))
        .map(|process| process.memory())
        .sum();
    Memory { total: system.total_memory(), available: system.available_memory(), app }
}

pub fn uptime_secs() -> u64 {
    started().elapsed().as_secs()
}

pub fn now_secs() -> u64 {
    unix_secs()
}

// --- The watchdog -------------------------------------------------------------------------------

/// The main thread's last answer, in ms since launch.
static ANSWERED: AtomicU64 = AtomicU64::new(0);

pub fn start_watchdog(app: AppHandle) {
    ANSWERED.store(since_start_ms(), Ordering::Relaxed);
    let crash_log = app.path().app_log_dir().ok().map(|dir| dir.join("crash.log"));
    std::thread::Builder::new()
        .name("watchdog".into())
        .spawn(move || {
            let mut reported = false;
            let mut last_tick = Instant::now();
            loop {
                std::thread::sleep(Duration::from_secs(1));
                // Asleep (a laptop lid closed): the gap is the computer's, not ours.
                if last_tick.elapsed() > Duration::from_secs(5) {
                    ANSWERED.store(since_start_ms(), Ordering::Relaxed);
                }
                last_tick = Instant::now();
                if app.run_on_main_thread(|| ANSWERED.store(since_start_ms(), Ordering::Relaxed)).is_err() {
                    break; // The app is closing.
                }
                let stalled = Duration::from_millis(since_start_ms().saturating_sub(ANSWERED.load(Ordering::Relaxed)));
                if stalled >= HANG_AFTER && !reported {
                    reported = true;
                    let line = hang_line(stalled, &lock(&DOING).clone(), &lock(&COMMAND).clone(), started().elapsed());
                    log::error!("{}", line.split_once("] ").map_or(line.as_str(), |(_, message)| message).trim_end());
                    if let Some(path) = &crash_log {
                        if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
                            let _ = file.write_all(line.as_bytes());
                        }
                    }
                    log::logger().flush();
                } else if reported && stalled < Duration::from_secs(2) {
                    reported = false;
                    log::warn!("Responding again");
                }
            }
        })
        .ok();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_hang_line_says_what_was_happening_in_the_form_crash_log_uses() {
        let line = hang_line(
            Duration::from_secs(9),
            &("creating the audience window".into(), 0),
            &("open_audience".into(), 0),
            Duration::from_secs(14),
        );
        assert!(line.starts_with('['));
        assert!(line.ends_with('\n'));
        let message = line.split_once("] ").unwrap().1;
        assert!(message.starts_with("HANG Not responding for 9s while creating the audience window"));
        assert!(message.contains("last command open_audience"));
        assert!(message.contains("14s after launch"));
    }

    #[test]
    fn before_anything_is_noted_it_says_so() {
        let line = hang_line(Duration::from_secs(8), &(String::new(), 0), &(String::new(), 0), Duration::from_secs(8));
        assert!(line.contains("while starting; last command none yet"));
    }

    #[test]
    fn the_log_tail_is_the_last_lines() {
        let dir = std::env::temp_dir().join(format!("cs-diag-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("church-studio.log");
        std::fs::write(&path, "one\ntwo\nthree\nfour\n").unwrap();
        assert_eq!(log_tail(&path, 2), "three\nfour");
        assert_eq!(log_tail(&dir.join("missing.log"), 5), "");
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn reads_freezes_back_from_crash_log() {
        let log = "[100] HANG Not responding for 9s while importing a video (began 2.0s ago); last command import_media (2.1s ago); 40s after launch; macos 0.4.1\n[50] HANG Not responding for 12s while starting; last command none yet; 8s after launch; windows 0.4.0\n[120] panic at somewhere\n";
        assert_eq!(hangs_since(log, 60), vec![Hang { at: 100, seconds: 9, during: "importing a video (began 2.0s ago)".into() }]);
        assert_eq!(hangs_since(log, 0).len(), 2);
    }

    #[test]
    fn reads_this_computers_memory() {
        let memory = memory();
        assert!(memory.total > 0 && memory.available <= memory.total);
        assert!(memory.app > 0);
    }
}
