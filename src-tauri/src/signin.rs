//! Signing in through the browser and coming back to this computer: a one-shot listener on
//! 127.0.0.1 that the sign-in page sends the browser back to with a one-time code. The code goes to
//! the desk as a `signin-callback` event, which trades it (with its PKCE verifier) for a token. Only
//! this computer can receive it, so a sign-in link sent by someone else gets them nothing.

use std::io::{Read, Write};
use std::net::TcpListener;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::Emitter;

/// How long the browser has to come back (the server's sign-in lasts as long).
const WAIT: Duration = Duration::from_secs(10 * 60);

/// The newest listener; starting another sign-in retires the one before.
static CURRENT: AtomicU64 = AtomicU64::new(0);

#[derive(Clone, Serialize)]
struct Callback {
    id: String,
    code: String,
}

const PAGE: &str = "<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width'><title>Church Studio</title>\
<body style='margin:0;display:grid;place-items:center;min-height:100vh;background:#050505;color:#f5f5f5;font:16px/1.5 -apple-system,BlinkMacSystemFont,\"Segoe UI\",sans-serif'>\
<div style='text-align:center;padding:24px'><div style='font-size:40px;color:#3ccf7a'>&#10003;</div><h1 style='font-size:22px;margin:8px 0'>You're signed in</h1>\
<p style='color:#a0a0ab;margin:0'>Go back to Church Studio. You can close this tab.</p></div></body>";

/// Listen on a free port and return it; the browser's return comes as one `signin-callback` event.
pub fn listen(app: tauri::AppHandle) -> Result<u16, String> {
    listen_then(move |found| {
        let _ = app.emit("signin-callback", found);
    })
}

fn listen_then(done: impl FnOnce(Callback) + Send + 'static) -> Result<u16, String> {
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|error| format!("Could not get ready to sign in. {error}"))?;
    let port = listener.local_addr().map_err(|error| error.to_string())?.port();
    listener.set_nonblocking(true).map_err(|error| error.to_string())?;
    let run = CURRENT.fetch_add(1, Ordering::SeqCst) + 1;
    std::thread::spawn(move || {
        let until = Instant::now() + WAIT;
        while Instant::now() < until && CURRENT.load(Ordering::SeqCst) == run {
            let Ok((mut stream, _)) = listener.accept() else {
                std::thread::sleep(Duration::from_millis(150));
                continue;
            };
            let _ = stream.set_nonblocking(false);
            let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
            let mut buffer = [0u8; 4096];
            let read = stream.read(&mut buffer).unwrap_or(0);
            let request = String::from_utf8_lossy(&buffer[..read]);
            match callback(&request) {
                Some(found) => {
                    let _ = stream.write_all(format!("HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nCache-Control: no-store\r\nConnection: close\r\nContent-Length: {}\r\n\r\n{PAGE}", PAGE.len()).as_bytes());
                    done(found);
                    return;
                }
                // The browser's other asks (a favicon) are not the sign-in: keep waiting.
                None => {
                    let _ = stream.write_all(b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
                }
            }
        }
    });
    Ok(port)
}

/// `GET /signin?id=…&code=…`: the sign-in id and one-time code, or None for anything else.
fn callback(request: &str) -> Option<Callback> {
    let target = request.lines().next()?.strip_prefix("GET ")?.split(' ').next()?;
    let query = target.strip_prefix("/signin?")?;
    let mut id = None;
    let mut code = None;
    for pair in query.split('&') {
        let (name, value) = pair.split_once('=')?;
        let clean = value.chars().all(|c| c.is_ascii_alphanumeric()) && value.len() <= 80;
        if !clean {
            return None;
        }
        match name {
            "id" => id = Some(value.to_string()),
            "code" => code = Some(value.to_string()),
            _ => {}
        }
    }
    Some(Callback { id: id?, code: code? })
}

#[cfg(test)]
mod tests {
    use super::callback;

    #[test]
    fn reads_only_the_sign_in_return() {
        let found = callback("GET /signin?id=0a1b2c&code=deadbeef HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n").unwrap();
        assert_eq!((found.id.as_str(), found.code.as_str()), ("0a1b2c", "deadbeef"));
        assert!(callback("GET /favicon.ico HTTP/1.1\r\n").is_none());
        assert!(callback("GET /signin?id=1 HTTP/1.1\r\n").is_none());
        assert!(callback("GET /signin?id=1&code=<script> HTTP/1.1\r\n").is_none());
        assert!(callback("POST /signin?id=1&code=2 HTTP/1.1\r\n").is_none());
    }

    #[test]
    fn hands_the_code_to_the_desk() {
        use std::io::{Read, Write};
        let (tx, rx) = std::sync::mpsc::channel();
        let port = super::listen_then(move |found| tx.send(found).unwrap()).unwrap();
        let mut stream = std::net::TcpStream::connect(("127.0.0.1", port)).unwrap();
        stream.write_all(b"GET /signin?id=abc&code=123 HTTP/1.1\r\nHost: x\r\n\r\n").unwrap();
        let mut answer = String::new();
        stream.read_to_string(&mut answer).unwrap();
        assert!(answer.starts_with("HTTP/1.1 200"));
        assert!(answer.contains("You're signed in"));
        let found = rx.recv_timeout(std::time::Duration::from_secs(2)).unwrap();
        assert_eq!((found.id.as_str(), found.code.as_str()), ("abc", "123"));
    }
}
