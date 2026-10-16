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
}

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
        }
    }
}

fn lock<T>(mutex: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(|poison| poison.into_inner())
}

/// The address a phone on this network can reach. A UDP "connect" sends nothing; it only asks
/// the OS which interface routes there. Private targets keep this working on a LAN without internet.
pub fn lan_host() -> Option<String> {
    const TARGETS: [&str; 4] = ["1.1.1.1:80", "192.168.1.1:80", "10.0.0.1:80", "172.16.0.1:80"];
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
    let path = target.split('?').next().unwrap_or("/").to_string();
    Parsed::Complete(HttpRequest {
        method: method.to_string(),
        path,
        body: rest[..length].to_vec(),
    })
}

fn respond(stream: &mut TcpStream, app: &AppHandle, lan: &LanRemote, req: HttpRequest) {
    if req.method == "GET" && (req.path == "/" || req.path == "/remote.html" || req.path == "/index.html") {
        write_http(stream, 200, "text/html; charset=utf-8", PAD.as_bytes());
        return;
    }
    // Every remote message, including reading Program, is checked by the desk (token hash).
    if req.method == "POST" && req.path == "/v1/remote" {
        let Ok(body) = serde_json::from_slice::<Value>(&req.body) else {
            write_http(stream, 400, "text/plain", b"Bad request");
            return;
        };
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
        return;
    }
    write_http(stream, 404, "text/plain", b"Not found");
}

fn write_json(stream: &mut TcpStream, value: Value) {
    let body = serde_json::to_vec(&value).unwrap_or_else(|_| b"{}".to_vec());
    write_http(stream, 200, "application/json", &body);
}

fn write_http(stream: &mut TcpStream, status: u16, content_type: &str, body: &[u8]) {
    let reason = match status {
        200 => "OK",
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

    fn complete(raw: &[u8]) -> HttpRequest {
        match parse_http(raw) {
            Parsed::Complete(req) => req,
            Parsed::Partial => panic!("partial"),
            Parsed::Invalid => panic!("invalid"),
        }
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
