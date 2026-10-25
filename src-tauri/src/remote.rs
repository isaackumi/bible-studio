use std::collections::HashMap;
use std::io::{Read, Write};
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
/// Pictures only (a video needs streaming): larger files are not sent.
const MEDIA_BYTES: u64 = 40 * 1024 * 1024;

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
                serve(stream, &app, &lan);
                lan.connections.fetch_sub(1, Ordering::SeqCst);
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
    body: Vec<u8>,
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
    for line in lines {
        if let Some((name, value)) = line.split_once(':') {
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
    if req.method == "GET" {
        if let Some(token) = req.path.strip_prefix("/media/") {
            serve_media(stream, app, token);
            return;
        }
        if req.path.starts_with("/_app/") {
            serve_app_file(stream, app, req.path.trim_start_matches('/'));
            return;
        }
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

/// A picture on the screen, for the TV browser: only a file that is in Media, never any other path.
fn serve_media(stream: &mut TcpStream, app: &AppHandle, token: &str) {
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
    let file = std::path::Path::new(&path);
    let small = std::fs::metadata(file).map(|meta| meta.len() <= MEDIA_BYTES).unwrap_or(false);
    match (known && small).then(|| std::fs::read(file).ok()).flatten() {
        Some(bytes) => {
            let ext = file.extension().and_then(|ext| ext.to_str()).unwrap_or_default().to_ascii_lowercase();
            write_http(stream, 200, crate::cloud::content_type(&ext), &bytes);
        }
        None => write_http(stream, 404, "text/plain", b"Not found"),
    }
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

fn write_http(stream: &mut TcpStream, status: u16, content_type: &str, body: &[u8]) {
    let reason = match status {
        200 => "OK",
        204 => "No Content",
        400 => "Bad Request",
        404 => "Not Found",
        413 => "Payload Too Large",
        503 => "Service Unavailable",
        _ => "Error",
    };
    // Same-origin only: no CORS headers. No referrer, so the QR token never leaves the page.
    let head = format!(
        "HTTP/1.1 {status} {reason}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nReferrer-Policy: no-referrer\r\nConnection: close\r\n\r\n",
        body.len()
    );
    let _ = stream.write_all(head.as_bytes());
    let _ = stream.write_all(body);
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
}
