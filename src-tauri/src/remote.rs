use std::collections::HashMap;
use std::io::{Read, Seek, SeekFrom, Write};
use std::net::{Ipv4Addr, TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::thread;
use std::time::Duration;

use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

pub const PORT: u16 = 17891;
/// The same phone page the browser build serves; one UI for every transport.
const PAD: &str = include_str!("../../static/remote.html");
/// The livestream lower-third overlay, for an OBS or vMix Browser Source.
const STREAM: &str = include_str!("../../static/stream.html");
/// The stage view for a phone or tablet on the platform (read-only stage link).
const STAGE: &str = include_str!("../../static/stage.html");
/// Live captions for congregants' phones (read-only captions link).
const CAPTIONS: &str = include_str!("../../static/captions.html");
/// Concurrent connections; a phone polls once a second, so this is generous.
const MAX_CONNECTIONS: usize = 32;
const MAX_REQUEST: usize = 64 * 1024;

pub struct LanRemote {
    pub listening: Mutex<bool>,
    pub url: Mutex<String>,
    pub error: Mutex<String>,
    started: Mutex<bool>,
    stopping: AtomicBool,
    connections: AtomicUsize,
    pending: Mutex<HashMap<String, mpsc::Sender<Value>>>,
    /// The audience screen for TV browsers on this Wi-Fi (/?lan=1): Program as the desk last sent it.
    screen: Mutex<LanScreen>,
    /// Browsers that asked for the screen lately, by address: how many TVs are watching.
    watchers: Mutex<HashMap<String, std::time::Instant>>,
}

#[derive(Default)]
struct LanScreen {
    revision: u64,
    frame: Option<String>,
}

/// A browser that has not asked for this long has stopped watching.
const WATCHING: Duration = Duration::from_secs(10);
/// A screen is a model (words, theme, layout), never pictures themselves: this is generous.
const SCREEN_BYTES: usize = 512 * 1024;
/// Pictures and videos go out from disk this much at a time, never whole, so any size streams.
const STREAM_CHUNK: usize = 64 * 1024;
/// A TV keeps a picture or video this long before asking again (then a 304 if it is unchanged), so
/// each slide does not fetch its background afresh. Short, because a file can be replaced in place.
const MEDIA_MAX_AGE: u32 = 600;
/// The app's own /_app/immutable/ files carry their hash in their name: they never change.
const IMMUTABLE_MAX_AGE: u32 = 365 * 24 * 60 * 60;
/// A TV that stops reading a video (paused, switched off) lets its connection go after this.
const WRITE_WAIT: Duration = Duration::from_secs(30);

impl Default for LanRemote {
    fn default() -> Self {
        Self {
            listening: Mutex::new(false),
            url: Mutex::new(String::new()),
            error: Mutex::new(String::new()),
            started: Mutex::new(false),
            stopping: AtomicBool::new(false),
            connections: AtomicUsize::new(0),
            pending: Mutex::new(HashMap::new()),
            screen: Mutex::new(LanScreen::default()),
            watchers: Mutex::new(HashMap::new()),
        }
    }
}

/// One of the MAX_CONNECTIONS, held while a connection is served.
struct Slot<'a>(&'a AtomicUsize);

impl Drop for Slot<'_> {
    fn drop(&mut self) {
        self.0.fetch_sub(1, Ordering::SeqCst);
    }
}

fn lock<T>(mutex: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(|poison| poison.into_inner())
}

/// The address a phone on this network can reach. Every interface's IPv4 address is ranked: a
/// private Wi-Fi or Ethernet address first, never a VPN tunnel (a work VPN, Tailscale's 100.64/10)
/// or loopback, because a phone on the church Wi-Fi cannot reach those. Asking the OS which
/// interface routes to the internet is only the fallback: with a VPN on, that is the tunnel.
pub fn lan_host() -> Option<String> {
    let mut found = interface_addresses();
    found.sort_by_key(|(name, ip)| host_rank(name, *ip));
    found
        .into_iter()
        .find(|(name, ip)| host_rank(name, *ip) < UNUSABLE)
        .map(|(_, ip)| ip.to_string())
        .or_else(routed_host)
}

const UNUSABLE: u32 = 100;

/// Lower is better; UNUSABLE never goes in the QR code.
fn host_rank(name: &str, ip: Ipv4Addr) -> u32 {
    let tunnel = ["utun", "ipsec", "ppp", "tun", "tap", "wg", "gif", "stf", "awdl", "llw", "anpi", "tailscale", "zt"]
        .iter()
        .any(|prefix| name.starts_with(prefix));
    let cgnat = ip.octets()[0] == 100 && (64..128).contains(&ip.octets()[1]);
    if !usable_lan_ip(std::net::IpAddr::V4(ip)) || tunnel || cgnat {
        return UNUSABLE;
    }
    let physical = ["en", "eth", "wlan", "wl"].iter().any(|prefix| name.starts_with(prefix));
    match (ip.is_private(), physical) {
        (true, true) => 0,
        (true, false) => 10,
        (false, true) => 20,
        (false, false) => 30,
    }
}

#[cfg(unix)]
fn interface_addresses() -> Vec<(String, Ipv4Addr)> {
    let mut found = Vec::new();
    let mut list: *mut libc::ifaddrs = std::ptr::null_mut();
    // SAFETY: getifaddrs fills a linked list that freeifaddrs releases; each entry is read while
    // the list is alive, and the name and address are copied out before it is freed.
    unsafe {
        if libc::getifaddrs(&mut list) != 0 {
            return found;
        }
        let mut entry = list;
        while !entry.is_null() {
            let item = &*entry;
            let up = item.ifa_flags & (libc::IFF_UP as u32) != 0;
            if up && !item.ifa_addr.is_null() && i32::from((*item.ifa_addr).sa_family) == libc::AF_INET {
                let addr = &*(item.ifa_addr as *const libc::sockaddr_in);
                let ip = Ipv4Addr::from(u32::from_be(addr.sin_addr.s_addr));
                let name = std::ffi::CStr::from_ptr(item.ifa_name).to_string_lossy().into_owned();
                found.push((name, ip));
            }
            entry = item.ifa_next;
        }
        libc::freeifaddrs(list);
    }
    found
}

#[cfg(not(unix))]
fn interface_addresses() -> Vec<(String, Ipv4Addr)> {
    Vec::new()
}

/// Which interface the OS would use to reach these targets (a UDP "connect" sends nothing).
fn routed_host() -> Option<String> {
    const TARGETS: [&str; 4] = ["192.168.1.1:80", "10.0.0.1:80", "172.16.0.1:80", "1.1.1.1:80"];
    TARGETS.iter().find_map(|target| {
        let socket = std::net::UdpSocket::bind("0.0.0.0:0").ok()?;
        socket.connect(target).ok()?;
        let ip = socket.local_addr().ok()?.ip();
        usable_lan_ip(ip).then(|| ip.to_string())
    })
}

fn usable_lan_ip(ip: std::net::IpAddr) -> bool {
    match ip {
        std::net::IpAddr::V4(v4) => !v4.is_loopback() && !v4.is_unspecified() && !v4.is_link_local(),
        std::net::IpAddr::V6(_) => false,
    }
}

pub fn start(app: AppHandle, lan: Arc<LanRemote>) {
    {
        let mut started = lock(&lan.started);
        if *started {
            return;
        }
        *started = true;
    }
    lan.stopping.store(false, Ordering::SeqCst);
    thread::spawn(move || {
        let listener = match TcpListener::bind((Ipv4Addr::UNSPECIFIED, PORT)) {
            Ok(listener) => listener,
            Err(error) => {
                log::error!("remote: bind {PORT}: {error}");
                *lock(&lan.error) = format!("The phone remote could not use port {PORT}: {error}. Another copy of Church Studio may be running.");
                *lock(&lan.started) = false;
                return;
            }
        };
        let Some(host) = lan_host() else {
            log::warn!("remote: no LAN address");
            *lock(&lan.error) = "This computer is not on a network a phone can reach. Join the same Wi-Fi as the phone.".into();
            *lock(&lan.started) = false;
            return;
        };
        *lock(&lan.url) = format!("http://{host}:{PORT}/");
        lock(&lan.error).clear();
        *lock(&lan.listening) = true;
        log::info!("remote: listening on {host}:{PORT}");
        for stream in listener.incoming() {
            if lan.stopping.load(Ordering::SeqCst) {
                break;
            }
            let Ok(stream) = stream else { continue };
            if lan.connections.fetch_add(1, Ordering::SeqCst) >= MAX_CONNECTIONS {
                lan.connections.fetch_sub(1, Ordering::SeqCst);
                drop(stream);
                continue;
            }
            let app = app.clone();
            let lan = lan.clone();
            thread::spawn(move || {
                // The slot is given back however serve ends, a TV hanging up mid-video included.
                let _slot = Slot(&lan.connections);
                serve(stream, &app, &lan);
            });
        }
        *lock(&lan.listening) = false;
        lock(&lan.url).clear();
        *lock(&lan.started) = false;
        log::info!("remote: stopped");
    });
}

/// Stop accepting phones. The accept loop wakes on a local connection and exits.
pub fn stop(lan: &LanRemote) {
    if !*lock(&lan.started) {
        return;
    }
    lan.stopping.store(true, Ordering::SeqCst);
    let _ = TcpStream::connect_timeout(&(Ipv4Addr::LOCALHOST, PORT).into(), Duration::from_millis(300));
    lock(&lan.pending).clear();
}

/// The desk's newest Program for TV browsers (None: not shown on Wi-Fi any more).
pub fn set_screen(lan: &LanRemote, frame: Option<String>) -> Result<(), String> {
    if frame.as_ref().is_some_and(|frame| frame.len() > SCREEN_BYTES) {
        return Err("That screen is too large to send.".into());
    }
    let mut screen = lock(&lan.screen);
    screen.revision += 1;
    screen.frame = frame;
    Ok(())
}

/// How many browsers are showing the screen now.
pub fn watching(lan: &LanRemote) -> usize {
    let mut watchers = lock(&lan.watchers);
    watchers.retain(|_, at| at.elapsed() < WATCHING);
    watchers.len()
}

/// What a TV browser gets for "anything newer than `after`?": nothing (204), or the screen.
fn screen_reply(screen: &LanScreen, after: u64) -> Option<Value> {
    (after != screen.revision).then(|| json!({ "on": screen.frame.is_some(), "revision": screen.revision, "frame": screen.frame, "name": "" }))
}

/// A picture's path from its /media/<token> (base64url of the path).
fn media_path(token: &str) -> Option<String> {
    use base64::Engine;
    let bytes = base64::engine::general_purpose::URL_SAFE_NO_PAD.decode(token).ok()?;
    String::from_utf8(bytes).ok().filter(|path| !path.is_empty())
}

pub fn reply(lan: &LanRemote, id: String, envelope: Value) {
    if let Some(tx) = lock(&lan.pending).remove(&id) {
        let _ = tx.send(envelope);
    }
}

fn serve(mut stream: TcpStream, app: &AppHandle, lan: &LanRemote) {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(4)));
    let _ = stream.set_write_timeout(Some(WRITE_WAIT));
    let mut buf = Vec::new();
    let mut chunk = [0_u8; 2048];
    loop {
        match stream.read(&mut chunk) {
            Ok(0) => break,
            Ok(n) => {
                buf.extend_from_slice(&chunk[..n]);
                match parse_http(&buf) {
                    Parsed::Complete(req) => {
                        respond(&mut stream, app, lan, req);
                        return;
                    }
                    Parsed::Invalid => {
                        write_http(&mut stream, 400, "text/plain", b"Bad request");
                        return;
                    }
                    Parsed::Partial => {}
                }
            }
            Err(_) => break,
        }
        if buf.len() > MAX_REQUEST {
            write_http(&mut stream, 413, "text/plain", b"Too large");
            break;
        }
    }
}

struct HttpRequest {
    method: String,
    path: String,
    query: String,
    /// Header names in lower case.
    headers: Vec<(String, String)>,
    body: Vec<u8>,
}

impl HttpRequest {
    fn header(&self, name: &str) -> Option<&str> {
        self.headers.iter().find(|(key, _)| key == name).map(|(_, value)| value.as_str())
    }
}

enum Parsed {
    Complete(HttpRequest),
    Partial,
    Invalid,
}

fn parse_http(buf: &[u8]) -> Parsed {
    let Some(split) = buf.windows(4).position(|window| window == b"\r\n\r\n") else {
        return Parsed::Partial;
    };
    let Ok(head) = std::str::from_utf8(&buf[..split]) else {
        return Parsed::Invalid;
    };
    let rest = &buf[split + 4..];
    let mut lines = head.split("\r\n");
    let mut parts = lines.next().unwrap_or_default().split_whitespace();
    let (Some(method), Some(target)) = (parts.next(), parts.next()) else {
        return Parsed::Invalid;
    };
    let mut length = 0usize;
    let mut headers = Vec::new();
    for line in lines {
        if let Some((name, value)) = line.split_once(':') {
            headers.push((name.trim().to_ascii_lowercase(), value.trim().to_string()));
            if name.eq_ignore_ascii_case("content-length") {
                match value.trim().parse::<usize>() {
                    Ok(parsed) if parsed <= MAX_REQUEST => length = parsed,
                    _ => return Parsed::Invalid,
                }
            }
        }
    }
    if rest.len() < length {
        return Parsed::Partial;
    }
    // Route on the path only; the QR pairing token travels in the query.
    let (path, query) = match target.split_once('?') {
        Some((path, query)) => (path.to_string(), query.to_string()),
        None => (target.to_string(), String::new()),
    };
    Parsed::Complete(HttpRequest {
        method: method.to_string(),
        path,
        query,
        headers,
        body: rest[..length].to_vec(),
    })
}

fn respond(stream: &mut TcpStream, app: &AppHandle, lan: &LanRemote, req: HttpRequest) {
    // A TV browser on this Wi-Fi as the audience screen: the app itself, drawing what the desk sends.
    if req.method == "GET" && req.path == "/" && query_value(&req.query, "lan").as_deref() == Some("1") {
        serve_app_file(stream, app, "index.html");
        return;
    }
    if req.method == "GET" && req.path == "/display/screen" {
        let who = stream.peer_addr().map(|addr| addr.ip().to_string()).unwrap_or_default();
        lock(&lan.watchers).insert(who, std::time::Instant::now());
        let after = query_value(&req.query, "after").and_then(|value| value.parse().ok()).unwrap_or(0);
        match screen_reply(&lock(&lan.screen), after) {
            Some(body) => write_json(stream, body),
            None => write_http(stream, 204, "text/plain", b""),
        }
        return;
    }
    if req.method == "GET" || req.method == "HEAD" {
        if let Some(token) = req.path.strip_prefix("/media/") {
            serve_media(stream, app, token, &req);
            return;
        }
        if let Some(name) = req.path.strip_prefix("/_app/immutable/") {
            serve_immutable(stream, app, name, &req);
            return;
        }
    }
    if req.method == "GET" && req.path.starts_with("/_app/") {
        serve_app_file(stream, app, req.path.trim_start_matches('/'));
        return;
    }
    if req.method == "GET" && (req.path == "/" || req.path == "/remote.html" || req.path == "/index.html") {
        write_http(stream, 200, "text/html; charset=utf-8", PAD.as_bytes());
        return;
    }
    if req.method == "GET" && req.path == "/stream" {
        write_http(stream, 200, "text/html; charset=utf-8", STREAM.as_bytes());
        return;
    }
    if req.method == "GET" && req.path == "/stage" {
        write_http(stream, 200, "text/html; charset=utf-8", STAGE.as_bytes());
        return;
    }
    if req.method == "GET" && req.path == "/captions" {
        write_http(stream, 200, "text/html; charset=utf-8", CAPTIONS.as_bytes());
        return;
    }
    // Controllers (Stream Deck via Companion, scripts): GET /v1/command/<id>?token=…
    // becomes the same command message a phone sends, checked by the desk the same way.
    if let Some(command) = req.path.strip_prefix("/v1/command/") {
        let token = query_value(&req.query, "token").unwrap_or_default();
        let body = json!({ "v": 2, "type": "command", "payload": { "id": command, "token": token } });
        forward(stream, app, lan, body);
        return;
    }
    // Every remote message, including reading Program, is checked by the desk (token hash).
    if req.method == "POST" && req.path == "/v1/remote" {
        let Ok(body) = serde_json::from_slice::<Value>(&req.body) else {
            write_http(stream, 400, "text/plain", b"Bad request");
            return;
        };
        forward(stream, app, lan, body);
        return;
    }
    write_http(stream, 404, "text/plain", b"Not found");
}

/// One of the app's own files (built into Church Studio), for the TV browser's page.
fn serve_app_file(stream: &mut TcpStream, app: &AppHandle, path: &str) {
    match app.asset_resolver().get(path.to_string()) {
        Some(asset) => write_http(stream, 200, &asset.mime_type, &asset.bytes),
        None => write_http(stream, 404, "text/plain", b"Not found"),
    }
}

/// One of the app's hashed files (scripts, styles, fonts): kept by the TV, since its name changes
/// whenever its contents do.
fn serve_immutable(stream: &mut TcpStream, app: &AppHandle, name: &str, req: &HttpRequest) {
    let Some(asset) = app.asset_resolver().get(format!("_app/immutable/{name}")) else {
        write_http(stream, 404, "text/plain", b"Not found");
        return;
    };
    let etag = bytes_etag(&asset.bytes);
    let cache = format!("public, max-age={IMMUTABLE_MAX_AGE}, immutable");
    let (head, part) = file_reply(req, &asset.mime_type, asset.bytes.len() as u64, &etag, &cache);
    if stream.write_all(head.as_bytes()).is_err() {
        return;
    }
    if let Some((start, length)) = part {
        // file_reply keeps the part inside the file; min() makes sure a slice never goes past it.
        let from = usize::try_from(start).unwrap_or(usize::MAX).min(asset.bytes.len());
        let to = usize::try_from(start.saturating_add(length)).unwrap_or(usize::MAX).min(asset.bytes.len());
        let _ = stream.write_all(&asset.bytes[from..to]);
    }
}

/// A picture, video or song on the screen, for the TV browser: only a file that is in Media, never
/// any other path. Sent in parts when the browser asks (Safari and Apple TV play video only that way).
fn serve_media(stream: &mut TcpStream, app: &AppHandle, token: &str, req: &HttpRequest) {
    use tauri::Manager;
    let Some(path) = media_path(token) else {
        write_http(stream, 404, "text/plain", b"Not found");
        return;
    };
    let known = {
        let db = app.state::<crate::db::Db>();
        let Ok(conn) = db.0.lock() else {
            write_http(stream, 503, "text/plain", b"Busy");
            return;
        };
        conn.query_row("SELECT 1 FROM media_assets WHERE path = ?1", [&path], |_| Ok(())).is_ok()
    };
    if !known {
        write_http(stream, 404, "text/plain", b"Not found");
        return;
    }
    send_media_file(stream, std::path::Path::new(&path), req);
}

/// A file from disk, whole or the part asked for, streamed. A browser that hangs up while it seeks
/// in a video only ends this reply.
fn send_media_file(stream: &mut impl Write, path: &std::path::Path, req: &HttpRequest) {
    let opened = std::fs::File::open(path).and_then(|file| Ok((file.metadata()?, file)));
    let Some((meta, mut file)) = opened.ok().filter(|(meta, _)| meta.is_file()) else {
        write_http(stream, 404, "text/plain", b"Not found");
        return;
    };
    let ext = path.extension().and_then(|ext| ext.to_str()).unwrap_or_default().to_ascii_lowercase();
    let etag = file_etag(&meta);
    let cache = format!("public, max-age={MEDIA_MAX_AGE}");
    let (head, part) = file_reply(req, crate::cloud::content_type(&ext), meta.len(), &etag, &cache);
    if stream.write_all(head.as_bytes()).is_err() {
        return;
    }
    if let Some((start, length)) = part {
        if let Err(error) = send_part(stream, &mut file, start, length) {
            log::debug!("remote: media stopped: {error}");
        }
    }
}

/// `length` bytes from `start`, a chunk at a time.
fn send_part(stream: &mut impl Write, file: &mut (impl Read + Seek), start: u64, length: u64) -> std::io::Result<()> {
    file.seek(SeekFrom::Start(start))?;
    let mut chunk = vec![0_u8; STREAM_CHUNK];
    let mut left = length;
    while left > 0 {
        let want = usize::try_from(left).unwrap_or(STREAM_CHUNK).min(STREAM_CHUNK);
        let read = file.read(&mut chunk[..want])?;
        if read == 0 {
            // The file got shorter while it was being sent.
            return Err(std::io::ErrorKind::UnexpectedEof.into());
        }
        stream.write_all(&chunk[..read])?;
        left -= read as u64;
    }
    stream.flush()
}

/// A file's version for the browser's cache: its size and when it last changed.
fn file_etag(meta: &std::fs::Metadata) -> String {
    let changed = meta.modified().ok().and_then(|at| at.duration_since(std::time::UNIX_EPOCH).ok()).map(|at| at.as_nanos()).unwrap_or(0);
    format!("\"{:x}-{changed:x}\"", meta.len())
}

/// The version of a file built into the app, from its contents.
fn bytes_etag(bytes: &[u8]) -> String {
    use std::hash::{Hash, Hasher};
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    bytes.hash(&mut hasher);
    format!("\"{:x}-{:x}\"", bytes.len(), hasher.finish())
}

/// Which bytes of a file a browser asked for in its Range header.
#[derive(Debug, PartialEq)]
enum Wanted {
    /// No range, or one this server does not read (several ranges, a typo): the whole file.
    Whole,
    /// First and last byte, both included, inside the file.
    Part(u64, u64),
    /// A range that starts past the end: 416.
    Unsatisfiable,
}

/// Reads "bytes=start-end", "bytes=start-" and "bytes=-last" (one range only).
fn wanted_range(header: Option<&str>, size: u64) -> Wanted {
    let Some(spec) = header.and_then(|value| value.trim().strip_prefix("bytes=")) else {
        return Wanted::Whole;
    };
    if spec.contains(',') {
        return Wanted::Whole;
    }
    let Some((from, to)) = spec.split_once('-') else {
        return Wanted::Whole;
    };
    let number = |text: &str| Some(text.trim()).filter(|text| !text.is_empty() && text.bytes().all(|b| b.is_ascii_digit())).and_then(|text| text.parse::<u64>().ok());
    let (from, to) = (from.trim(), to.trim());
    match (number(from), number(to)) {
        // The last N bytes.
        (None, Some(last)) if from.is_empty() => {
            if last == 0 || size == 0 {
                Wanted::Unsatisfiable
            } else {
                Wanted::Part(size - last.min(size), size - 1)
            }
        }
        (Some(start), end) if to.is_empty() || end.is_some() => {
            if end.is_some_and(|end| end < start) {
                Wanted::Whole
            } else if start >= size {
                Wanted::Unsatisfiable
            } else {
                Wanted::Part(start, end.unwrap_or(u64::MAX).min(size - 1))
            }
        }
        _ => Wanted::Whole,
    }
}

/// Does If-None-Match name this version ("*" names any)?
fn etag_matches(header: Option<&str>, etag: &str) -> bool {
    header.is_some_and(|value| value.split(',').map(|tag| tag.trim().trim_start_matches("W/")).any(|tag| tag == "*" || tag == etag))
}

/// The reply's head for a file of `size` bytes, and which bytes follow it as (first, length): none
/// for HEAD, 304 or 416.
fn file_reply(req: &HttpRequest, content_type: &str, size: u64, etag: &str, cache: &str) -> (String, Option<(u64, u64)>) {
    let mut lines = vec![("Cache-Control", cache.to_string()), ("ETag", etag.to_string()), ("Accept-Ranges", "bytes".to_string())];
    if etag_matches(req.header("if-none-match"), etag) {
        return (head(304, &lines), None);
    }
    // If-Range: the part only if the browser's copy is this version, else the whole file again.
    let range = match req.header("if-range") {
        Some(version) if version != etag => None,
        _ => req.header("range"),
    };
    let (status, first, length) = match wanted_range(range, size) {
        Wanted::Whole => (200, 0, size),
        Wanted::Part(first, last) => {
            lines.push(("Content-Range", format!("bytes {first}-{last}/{size}")));
            (206, first, last - first + 1)
        }
        Wanted::Unsatisfiable => {
            lines.extend([("Content-Range", format!("bytes */{size}")), ("Content-Type", "text/plain".to_string()), ("Content-Length", "0".to_string())]);
            return (head(416, &lines), None);
        }
    };
    lines.extend([("Content-Type", content_type.to_string()), ("Content-Length", length.to_string())]);
    let body = (req.method != "HEAD" && length > 0).then_some((first, length));
    (head(status, &lines), body)
}

/// One query value, percent-decoded ("token=ab%2Bc" → "ab+c").
fn query_value(query: &str, name: &str) -> Option<String> {
    query.split('&').find_map(|pair| {
        let (key, value) = pair.split_once('=')?;
        if key != name {
            return None;
        }
        let bytes = value.as_bytes();
        let mut out = Vec::with_capacity(bytes.len());
        let mut index = 0;
        while index < bytes.len() {
            match bytes[index] {
                b'%' if index + 2 < bytes.len() => {
                    let hex = std::str::from_utf8(&bytes[index + 1..index + 3]).ok()?;
                    out.push(u8::from_str_radix(hex, 16).ok()?);
                    index += 3;
                }
                b'+' => {
                    out.push(b' ');
                    index += 1;
                }
                byte => {
                    out.push(byte);
                    index += 1;
                }
            }
        }
        String::from_utf8(out).ok()
    })
}

/// Hand a remote message to the desk and wait briefly for its reply.
fn forward(stream: &mut TcpStream, app: &AppHandle, lan: &LanRemote, body: Value) {
    let id = Uuid::new_v4().to_string();
    let (tx, rx) = mpsc::channel();
    lock(&lan.pending).insert(id.clone(), tx);
    if app.emit("remote-in", json!({ "id": id, "envelope": body })).is_err() {
        lock(&lan.pending).remove(&id);
        write_http(stream, 503, "text/plain", b"Desk unavailable");
        return;
    }
    match rx.recv_timeout(Duration::from_secs(3)) {
        Ok(reply) => write_json(stream, reply),
        Err(_) => {
            lock(&lan.pending).remove(&id);
            write_http(stream, 503, "text/plain", b"Desk unavailable");
        }
    }
}

fn write_json(stream: &mut TcpStream, value: Value) {
    let body = serde_json::to_vec(&value).unwrap_or_else(|_| b"{}".to_vec());
    write_http(stream, 200, "application/json", &body);
}

fn write_http(stream: &mut impl Write, status: u16, content_type: &str, body: &[u8]) {
    // Dynamic answers (the screen, commands, state) are never kept by the browser.
    let lines = [("Content-Type", content_type.to_string()), ("Content-Length", body.len().to_string()), ("Cache-Control", "no-store".to_string())];
    let _ = stream.write_all(head(status, &lines).as_bytes());
    let _ = stream.write_all(body);
}

/// A reply's status line and headers, with the ones every reply carries.
fn head(status: u16, lines: &[(&str, String)]) -> String {
    let reason = match status {
        200 => "OK",
        204 => "No Content",
        206 => "Partial Content",
        304 => "Not Modified",
        400 => "Bad Request",
        404 => "Not Found",
        413 => "Payload Too Large",
        416 => "Range Not Satisfiable",
        503 => "Service Unavailable",
        _ => "Error",
    };
    let mut out = format!("HTTP/1.1 {status} {reason}\r\n");
    for (name, value) in lines {
        out.push_str(&format!("{name}: {value}\r\n"));
    }
    // Same-origin only: no CORS headers. No referrer, so the QR token never leaves the page.
    out.push_str("X-Content-Type-Options: nosniff\r\nReferrer-Policy: no-referrer\r\nConnection: close\r\n\r\n");
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_tv_browser_gets_the_newest_screen_once_and_then_nothing_until_it_changes() {
        let lan = LanRemote::default();
        assert_eq!(screen_reply(&lock(&lan.screen), 0), None);
        set_screen(&lan, Some("{\"model\":1}".into())).unwrap();
        let first = screen_reply(&lock(&lan.screen), 0).unwrap();
        assert_eq!(first["on"], true);
        assert_eq!(first["frame"], "{\"model\":1}");
        assert_eq!(screen_reply(&lock(&lan.screen), first["revision"].as_u64().unwrap()), None);
        set_screen(&lan, None).unwrap();
        assert_eq!(screen_reply(&lock(&lan.screen), first["revision"].as_u64().unwrap()).unwrap()["on"], false);
        assert!(set_screen(&lan, Some("x".repeat(SCREEN_BYTES + 1))).is_err());
    }

    #[test]
    fn reads_a_pictures_path_back_from_its_address() {
        // The desk's lanMediaToken("/Users/me/Média/a b.png"): base64url of the UTF-8 path.
        use base64::Engine;
        let token = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode("/Users/me/Média/a b.png");
        assert_eq!(media_path(&token).as_deref(), Some("/Users/me/Média/a b.png"));
        assert_eq!(media_path("!!"), None);
        assert_eq!(media_path(""), None);
    }

    fn complete(raw: &[u8]) -> HttpRequest {
        match parse_http(raw) {
            Parsed::Complete(req) => req,
            Parsed::Partial => panic!("partial"),
            Parsed::Invalid => panic!("invalid"),
        }
    }

    #[test]
    fn puts_the_wifi_address_in_the_qr_code_not_a_vpn() {
        let wifi = Ipv4Addr::new(192, 168, 0, 24);
        assert_eq!(host_rank("en0", wifi), 0);
        assert!(host_rank("bridge100", Ipv4Addr::new(192, 168, 64, 1)) > host_rank("en0", wifi));
        assert_eq!(host_rank("utun4", Ipv4Addr::new(10, 8, 0, 2)), UNUSABLE);
        assert_eq!(host_rank("en0", Ipv4Addr::new(100, 101, 7, 9)), UNUSABLE, "Tailscale's range");
        assert_eq!(host_rank("lo0", Ipv4Addr::LOCALHOST), UNUSABLE);
        assert_eq!(host_rank("en1", Ipv4Addr::new(169, 254, 3, 4)), UNUSABLE);
    }

    #[cfg(unix)]
    #[test]
    fn lists_this_computers_addresses() {
        let found = interface_addresses();
        assert!(found.iter().any(|(_, ip)| ip.is_loopback()), "{found:?}");
        if let Some(host) = lan_host() {
            assert!(host.parse::<Ipv4Addr>().is_ok_and(|ip| !ip.is_loopback()), "{host}");
        }
    }

    #[test]
    fn reads_a_controller_link() {
        let req = complete(b"GET /v1/command/next?token=ab%2Bc+d&x=1 HTTP/1.1\r\nHost: x\r\n\r\n");
        assert_eq!(req.path, "/v1/command/next");
        assert_eq!(query_value(&req.query, "token").as_deref(), Some("ab+c d"));
        assert_eq!(query_value(&req.query, "missing"), None);
    }

    #[test]
    fn parses_a_json_post() {
        let req = complete(b"POST /v1/remote HTTP/1.1\r\nContent-Length: 2\r\n\r\n{}");
        assert_eq!(req.method, "POST");
        assert_eq!(req.path, "/v1/remote");
        assert_eq!(req.body, b"{}");
    }

    #[test]
    fn routes_the_qr_link_on_its_path() {
        let req = complete(b"GET /?pair=abc123 HTTP/1.1\r\nHost: 192.168.1.20:17891\r\n\r\n");
        assert_eq!(req.method, "GET");
        assert_eq!(req.path, "/");
        assert!(req.body.is_empty());
    }

    #[test]
    fn waits_for_a_whole_body_and_rejects_bad_lengths() {
        assert!(matches!(parse_http(b"POST /v1/remote HTTP/1.1\r\nContent-Length: 10\r\n\r\n{}"), Parsed::Partial));
        assert!(matches!(parse_http(b"POST /v1/remote HTTP/1.1\r\nContent-Length: nope\r\n\r\n{}"), Parsed::Invalid));
        assert!(matches!(parse_http(b"POST /v1/remote HTTP/1.1\r\nContent-Length: 99999999\r\n\r\n"), Parsed::Invalid));
        assert!(matches!(parse_http(b"GET / HTTP/1.1\r\nHost: x"), Parsed::Partial));
    }

    #[test]
    fn never_offers_loopback_to_a_phone() {
        assert!(!usable_lan_ip("127.0.0.1".parse().expect("ip")));
        assert!(!usable_lan_ip("169.254.10.2".parse().expect("ip")));
        assert!(usable_lan_ip("192.168.1.20".parse().expect("ip")));
    }

    #[test]
    fn reads_the_part_of_a_video_a_browser_asks_for() {
        assert_eq!(wanted_range(None, 1000), Wanted::Whole);
        assert_eq!(wanted_range(Some("bytes=0-499"), 1000), Wanted::Part(0, 499));
        assert_eq!(wanted_range(Some("bytes=0-1"), 1000), Wanted::Part(0, 1), "Safari's first probe");
        assert_eq!(wanted_range(Some("bytes=500-"), 1000), Wanted::Part(500, 999), "open-ended");
        assert_eq!(wanted_range(Some("bytes=-100"), 1000), Wanted::Part(900, 999), "the last 100 bytes");
        assert_eq!(wanted_range(Some("bytes=-5000"), 1000), Wanted::Part(0, 999), "more than there is");
        assert_eq!(wanted_range(Some("bytes=900-5000"), 1000), Wanted::Part(900, 999), "an end past the file stops at it");
        assert_eq!(wanted_range(Some("bytes=1000-"), 1000), Wanted::Unsatisfiable, "starts at the end");
        assert_eq!(wanted_range(Some("bytes=2000-3000"), 1000), Wanted::Unsatisfiable);
        assert_eq!(wanted_range(Some("bytes=-0"), 1000), Wanted::Unsatisfiable);
        assert_eq!(wanted_range(Some("bytes=0-"), 0), Wanted::Unsatisfiable, "an empty file has no bytes");
        for ignored in ["bytes=5-1", "bytes=a-b", "bytes=-", "bytes=1-2,4-5", "items=0-1", "bytes=+1-2", "bytes 0-1"] {
            assert_eq!(wanted_range(Some(ignored), 1000), Wanted::Whole, "{ignored}");
        }
    }

    fn request(raw: &str) -> HttpRequest {
        complete(raw.as_bytes())
    }

    #[test]
    fn answers_a_range_with_its_part_and_says_so() {
        let ask = request("GET /media/x HTTP/1.1\r\nRange: bytes=10-19\r\n\r\n");
        let (head, part) = file_reply(&ask, "video/mp4", 100, "\"v1\"", "public, max-age=600");
        assert!(head.starts_with("HTTP/1.1 206 Partial Content\r\n"), "{head}");
        assert!(head.contains("\r\nContent-Range: bytes 10-19/100\r\n"), "{head}");
        assert!(head.contains("\r\nContent-Length: 10\r\n"), "{head}");
        assert!(head.contains("\r\nAccept-Ranges: bytes\r\n"), "{head}");
        assert!(head.contains("\r\nContent-Type: video/mp4\r\n"), "{head}");
        assert!(head.contains("\r\nCache-Control: public, max-age=600\r\n"), "{head}");
        assert!(head.contains("\r\nETag: \"v1\"\r\n"), "{head}");
        assert!(!head.contains("no-store"), "{head}");
        assert_eq!(part, Some((10, 10)));

        let (head, part) = file_reply(&request("GET /media/x HTTP/1.1\r\nRange: bytes=100-\r\n\r\n"), "video/mp4", 100, "\"v1\"", "c");
        assert!(head.starts_with("HTTP/1.1 416 Range Not Satisfiable\r\n"), "{head}");
        assert!(head.contains("\r\nContent-Range: bytes */100\r\n"), "{head}");
        assert!(head.contains("\r\nContent-Length: 0\r\n"), "{head}");
        assert_eq!(part, None);

        let (head, part) = file_reply(&request("GET /media/x HTTP/1.1\r\n\r\n"), "image/png", 100, "\"v1\"", "c");
        assert!(head.starts_with("HTTP/1.1 200 OK\r\n") && head.contains("\r\nContent-Length: 100\r\n"), "{head}");
        assert_eq!(part, Some((0, 100)));
    }

    #[test]
    fn a_tv_that_has_the_picture_keeps_it_and_head_sends_no_body() {
        let (head, part) = file_reply(&request("GET /media/x HTTP/1.1\r\nIf-None-Match: \"v1\"\r\n\r\n"), "image/png", 100, "\"v1\"", "c");
        assert!(head.starts_with("HTTP/1.1 304 Not Modified\r\n") && head.contains("\r\nETag: \"v1\"\r\n"), "{head}");
        assert_eq!(part, None);
        let (head, _) = file_reply(&request("GET /media/x HTTP/1.1\r\nIf-None-Match: W/\"old\", \"v1\"\r\n\r\n"), "image/png", 100, "\"v1\"", "c");
        assert!(head.starts_with("HTTP/1.1 304"), "{head}");
        let (head, _) = file_reply(&request("GET /media/x HTTP/1.1\r\nIf-None-Match: \"old\"\r\n\r\n"), "image/png", 100, "\"v1\"", "c");
        assert!(head.starts_with("HTTP/1.1 200"), "a changed picture is sent again: {head}");

        let (head, part) = file_reply(&request("HEAD /media/x HTTP/1.1\r\n\r\n"), "video/mp4", 100, "\"v1\"", "c");
        assert!(head.starts_with("HTTP/1.1 200") && head.contains("\r\nContent-Length: 100\r\n"), "{head}");
        assert_eq!(part, None);

        // A part of an older copy would not fit with what the browser has: the whole file again.
        let stale = request("GET /media/x HTTP/1.1\r\nRange: bytes=10-19\r\nIf-Range: \"old\"\r\n\r\n");
        assert_eq!(file_reply(&stale, "video/mp4", 100, "\"v1\"", "c").1, Some((0, 100)));
    }

    #[test]
    fn dynamic_answers_are_never_kept() {
        let mut out = Vec::new();
        write_http(&mut out, 200, "application/json", b"{}");
        let text = String::from_utf8(out).unwrap();
        assert!(text.contains("\r\nCache-Control: no-store\r\n") && text.ends_with("\r\n\r\n{}"), "{text}");
    }

    /// A file of `size` bytes whose every byte says where it is.
    fn sample_file(name: &str, size: usize) -> std::path::PathBuf {
        let path = std::env::temp_dir().join(format!("cs-remote-{}-{name}.mp4", std::process::id()));
        std::fs::write(&path, (0..size).map(|at| (at % 251) as u8).collect::<Vec<_>>()).unwrap();
        path
    }

    /// A one-request server on a free port that sends `path` as /media would.
    fn serve_once(path: std::path::PathBuf) -> (u16, thread::JoinHandle<()>) {
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
        let port = listener.local_addr().unwrap().port();
        let server = thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut buf = Vec::new();
            let mut chunk = [0_u8; 2048];
            let req = loop {
                let n = stream.read(&mut chunk).unwrap();
                buf.extend_from_slice(&chunk[..n]);
                if let Parsed::Complete(req) = parse_http(&buf) {
                    break req;
                }
            };
            let _ = stream.set_write_timeout(Some(WRITE_WAIT));
            send_media_file(&mut stream, &path, &req);
        });
        (port, server)
    }

    #[test]
    fn streams_part_of_a_file_to_a_browser_over_the_network() {
        let path = sample_file("part", 300_000);
        let (port, server) = serve_once(path.clone());
        let mut client = TcpStream::connect((Ipv4Addr::LOCALHOST, port)).unwrap();
        client.write_all(b"GET /media/x HTTP/1.1\r\nHost: tv\r\nRange: bytes=100000-\r\n\r\n").unwrap();
        let mut reply = Vec::new();
        client.read_to_end(&mut reply).unwrap();
        server.join().unwrap();
        let split = reply.windows(4).position(|window| window == b"\r\n\r\n").unwrap();
        let head = std::str::from_utf8(&reply[..split]).unwrap();
        assert!(head.starts_with("HTTP/1.1 206 Partial Content"), "{head}");
        assert!(head.contains("Content-Range: bytes 100000-299999/300000"), "{head}");
        assert!(head.contains("Content-Type: video/mp4"), "{head}");
        let body = &reply[split + 4..];
        assert_eq!(body.len(), 200_000);
        assert!(body.iter().enumerate().all(|(at, byte)| *byte == ((at + 100_000) % 251) as u8));
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn a_browser_that_hangs_up_mid_video_only_ends_its_reply() {
        let path = sample_file("hangup", 16 * 1024 * 1024);
        let (port, server) = serve_once(path.clone());
        {
            let mut client = TcpStream::connect((Ipv4Addr::LOCALHOST, port)).unwrap();
            client.write_all(b"GET /media/x HTTP/1.1\r\n\r\n").unwrap();
            let mut first = [0_u8; 4096];
            client.read_exact(&mut first).unwrap();
        }
        // The client is gone (as when a TV seeks): the server stops writing and returns, no panic.
        server.join().expect("serving ended cleanly");
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn hands_back_a_connection_slot_however_serving_ends() {
        let count = AtomicUsize::new(1);
        let caught = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let _slot = Slot(&count);
            panic!("a reply went wrong");
        }));
        assert!(caught.is_err());
        assert_eq!(count.load(Ordering::SeqCst), 0);
    }

    #[test]
    fn names_the_kind_of_each_picture_video_and_song() {
        for (ext, kind) in [("mp4", "video/mp4"), ("m4v", "video/mp4"), ("mov", "video/quicktime"), ("webm", "video/webm"), ("mp3", "audio/mpeg"), ("m4a", "audio/mp4"), ("wav", "audio/wav"), ("jpg", "image/jpeg"), ("jpeg", "image/jpeg"), ("png", "image/png"), ("webp", "image/webp"), ("gif", "image/gif"), ("svg", "image/svg+xml")] {
            assert_eq!(crate::cloud::content_type(ext), kind, "{ext}");
        }
    }
}
