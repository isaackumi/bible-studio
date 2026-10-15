use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::{mpsc, Arc, Mutex};
use std::thread;
use std::time::Duration;

use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager};
use uuid::Uuid;

use crate::displays::Output;

pub const PORT: u16 = 17891;
const PAD: &str = include_str!("../resources/remote.html");

pub struct LanRemote {
    pub listening: Mutex<bool>,
    pub url: Mutex<String>,
    started: Mutex<bool>,
    pending: Mutex<HashMap<String, mpsc::Sender<Value>>>,
}

impl Default for LanRemote {
    fn default() -> Self {
        Self {
            listening: Mutex::new(false),
            url: Mutex::new(String::new()),
            started: Mutex::new(false),
            pending: Mutex::new(HashMap::new()),
        }
    }
}

pub fn lan_host() -> Option<String> {
    let socket = std::net::UdpSocket::bind("0.0.0.0:0").ok()?;
    socket.connect("1.1.1.1:80").ok()?;
    Some(socket.local_addr().ok()?.ip().to_string())
}

pub fn start(app: AppHandle, lan: Arc<LanRemote>) {
    {
        let mut started = lan.started.lock().unwrap_or_else(|poison| poison.into_inner());
        if *started {
            return;
        }
        *started = true;
    }
    thread::spawn(move || {
        let Ok(listener) = TcpListener::bind(("0.0.0.0", PORT)) else {
            if let Ok(mut started) = lan.started.lock() {
                *started = false;
            }
            return;
        };
        let host = lan_host().unwrap_or_else(|| "127.0.0.1".into());
        if let Ok(mut url) = lan.url.lock() {
            *url = format!("http://{host}:{PORT}/");
        }
        if let Ok(mut listening) = lan.listening.lock() {
            *listening = true;
        }
        for stream in listener.incoming() {
            if let Ok(stream) = stream {
                let app = app.clone();
                let lan = lan.clone();
                thread::spawn(move || serve(stream, &app, &lan));
            }
        }
    });
}

pub fn reply(lan: &LanRemote, id: String, envelope: Value) {
    if let Some(tx) = lan.pending.lock().unwrap_or_else(|poison| poison.into_inner()).remove(&id) {
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
                if let Some(req) = parse_http(&buf) {
                    respond(&mut stream, app, lan, req);
                    return;
                }
            }
            Err(_) => break,
        }
        if buf.len() > 64 * 1024 {
            break;
        }
    }
}

struct HttpRequest {
    method: String,
    path: String,
    body: Vec<u8>,
}

fn parse_http(buf: &[u8]) -> Option<HttpRequest> {
    let text = std::str::from_utf8(buf).ok()?;
    let (head, rest) = text.split_once("\r\n\r\n")?;
    let mut lines = head.split("\r\n");
    let start = lines.next()?;
    let mut parts = start.split_whitespace();
    let method = parts.next()?.to_string();
    let path = parts.next()?.to_string();
    let mut length = 0usize;
    for line in lines {
        if let Some((name, value)) = line.split_once(':') {
            if name.eq_ignore_ascii_case("content-length") {
                length = value.trim().parse().ok()?;
            }
        }
    }
    let body = rest.as_bytes();
    if body.len() < length {
        return None;
    }
    Some(HttpRequest {
        method,
        path,
        body: body[..length].to_vec(),
    })
}

fn respond(stream: &mut TcpStream, app: &AppHandle, lan: &LanRemote, req: HttpRequest) {
    if req.method == "OPTIONS" {
        write_http(stream, 204, "text/plain", b"");
        return;
    }
    if req.method == "GET" && (req.path == "/" || req.path.starts_with("/index")) {
        write_http(stream, 200, "text/html; charset=utf-8", PAD.as_bytes());
        return;
    }
    if req.method == "GET" && req.path.starts_with("/v1/program") {
        let program = app
            .try_state::<Output>()
            .map(|output| output.program.lock().unwrap_or_else(|poison| poison.into_inner()).clone())
            .unwrap_or_else(|| json!({}));
        write_json(stream, program);
        return;
    }
    if req.method == "POST" && req.path.starts_with("/v1/remote") {
        let Ok(body) = serde_json::from_slice::<Value>(&req.body) else {
            write_json(stream, json!({ "v": 1, "type": "denied", "payload": { "reason": "That message was not a remote envelope." } }));
            return;
        };
        let id = Uuid::new_v4().to_string();
        let (tx, rx) = mpsc::channel();
        lan.pending.lock().unwrap_or_else(|poison| poison.into_inner()).insert(id.clone(), tx);
        if app.emit("remote-in", json!({ "id": id, "envelope": body })).is_err() {
            write_json(stream, json!({ "v": 1, "type": "denied", "payload": { "reason": "The desk did not answer." } }));
            return;
        }
        let reply = rx.recv_timeout(Duration::from_secs(3)).unwrap_or_else(|_| {
            json!({ "v": 1, "type": "denied", "payload": { "reason": "The desk did not answer." } })
        });
        write_json(stream, reply);
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
        204 => "No Content",
        _ => "Error",
    };
    let head = format!(
        "HTTP/1.1 {status} {reason}\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Headers: content-type\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        body.len()
    );
    let _ = stream.write_all(head.as_bytes());
    let _ = stream.write_all(body);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_a_json_post() {
        let raw = b"POST /v1/remote HTTP/1.1\r\nContent-Length: 2\r\n\r\n{}";
        let req = parse_http(raw).expect("request");
        assert_eq!(req.method, "POST");
        assert_eq!(req.path, "/v1/remote");
        assert_eq!(req.body, b"{}");
    }

    #[test]
    fn parses_the_pad_get() {
        let raw = b"GET / HTTP/1.1\r\nHost: 192.168.1.20:17891\r\n\r\n";
        let req = parse_http(raw).expect("request");
        assert_eq!(req.method, "GET");
        assert_eq!(req.path, "/");
        assert!(req.body.is_empty());
    }
}
