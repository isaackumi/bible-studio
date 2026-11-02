//! Nearby: computers on the same network and the same licence lend each other Media files, so a
//! video comes from the laptop next door in seconds instead of up to the cloud and down again, and
//! still comes when the internet is out. Each computer announces itself over Bonjour (mDNS) with a
//! tag made from the licence key, so only computers on the same licence find each other, and every
//! request is signed with a key made from that licence key, so nobody else on the Wi-Fi can ask.
//!
//!   GET /v1/media/<id>   the file, with x-cs-name (base64), x-cs-kind, x-cs-ext, x-cs-created
//!   (each request carries x-cs-time and x-cs-sign: HMAC-SHA256 of "GET <path> <time>")
//!   POST /v1/offer       songs, services and the like one computer offers the others, as JSON
//!   (signed over "POST <path> <time> <sha256 of the body>", so a body cannot be swapped)
//!
//! An offer is kept on disk until someone at the desk accepts or declines it, so it waits through
//! an empty desk and a restart. Nothing in it reaches the library before that.
//!
//! Nothing starts until the desk says this computer is on a paid licence (nearby_start).

use base64::Engine;
use mdns_sd::{ServiceDaemon, ServiceEvent, ServiceInfo};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{Ipv4Addr, TcpListener, TcpStream};
use std::path::PathBuf;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::Manager;

const SERVICE: &str = "_churchstudio._tcp.local.";
const PORT: u16 = 17892;
/// A signed request is good this long either side of now. Generous: a church PC's clock can be
/// hours out, and replaying a request only fetches again a file whose bytes already went past.
const SKEW_SECS: u64 = 24 * 60 * 60;
/// A computer that did not answer (asleep, gone home) is not asked again for this long.
const REST: Duration = Duration::from_secs(60);
/// Files sent at once; a church has a handful of computers.
const MAX_SENDING: usize = 6;
/// The words of a whole library fit in far less; pictures and videos are fetched apart.
const MAX_OFFER: usize = 32 * 1024 * 1024;
/// Offers kept waiting at once: a mistake on another computer cannot fill this one's disk.
const MAX_WAITING: usize = 50;
/// How long an answered offer is remembered, so a replayed request cannot ask again.
const ANSWERED_SECS: u64 = 3 * SKEW_SECS;

#[derive(Clone, Serialize, PartialEq, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Peer {
    pub device: String,
    pub name: String,
    /// Every address it announced, the likeliest first (reach_order).
    pub hosts: Vec<String>,
    pub port: u16,
}

#[derive(Default)]
struct Inner {
    secret: Option<[u8; 32]>,
    tag: String,
    device: String,
    name: String,
    port: u16,
    daemon: Option<ServiceDaemon>,
    registered: Option<String>,
    /// By mDNS full name, so a computer that leaves is dropped by the name it left under.
    peers: HashMap<String, Peer>,
    /// By device: computers that did not answer, and until when they are left alone.
    resting: HashMap<String, std::time::Instant>,
}

#[derive(Default)]
pub struct Nearby {
    inner: Mutex<Inner>,
    sending: AtomicUsize,
}

fn lock<T>(mutex: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(|poison| poison.into_inner())
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

/// The key every request is signed with: only computers holding the licence key can make it.
fn secret_for(key: &str) -> [u8; 32] {
    Sha256::digest(format!("church-studio nearby secret\n{}", key.trim()).as_bytes()).into()
}

/// What a computer announces so others on its licence know it: says nothing about the key itself.
fn tag_for(key: &str) -> String {
    hex(&Sha256::digest(format!("church-studio nearby tag\n{}", key.trim()).as_bytes()))[..16].to_string()
}

fn sign(secret: &[u8; 32], path: &str, time: u64) -> String {
    let key = ring::hmac::Key::new(ring::hmac::HMAC_SHA256, secret);
    hex(ring::hmac::sign(&key, format!("GET {path} {time}").as_bytes()).as_ref())
}

fn offer_text(path: &str, time: u64, body: &[u8]) -> String {
    format!("POST {path} {time} {}", hex(&Sha256::digest(body)))
}

fn sign_offer(secret: &[u8; 32], path: &str, time: u64, body: &[u8]) -> String {
    let key = ring::hmac::Key::new(ring::hmac::HMAC_SHA256, secret);
    hex(ring::hmac::sign(&key, offer_text(path, time, body).as_bytes()).as_ref())
}

fn verify(secret: &[u8; 32], path: &str, time: &str, signature: &str, now: u64) -> bool {
    let Ok(parsed) = time.parse::<u64>() else { return false };
    verify_text(secret, &format!("GET {path} {time}"), parsed, signature, now)
}

fn verify_offer(secret: &[u8; 32], path: &str, time: &str, signature: &str, body: &[u8], now: u64) -> bool {
    let Ok(parsed) = time.parse::<u64>() else { return false };
    verify_text(secret, &offer_text(path, parsed, body), parsed, signature, now)
}

fn verify_text(secret: &[u8; 32], text: &str, time: u64, signature: &str, now: u64) -> bool {
    if time.abs_diff(now) > SKEW_SECS || signature.len() != 64 {
        return false;
    }
    let Some(bytes) = (0..32).map(|at| u8::from_str_radix(&signature[at * 2..at * 2 + 2], 16).ok()).collect::<Option<Vec<u8>>>() else {
        return false;
    };
    let key = ring::hmac::Key::new(ring::hmac::HMAC_SHA256, secret);
    ring::hmac::verify(&key, text.as_bytes(), &bytes).is_ok()
}

fn now_secs() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|time| time.as_secs()).unwrap_or(0)
}

/// Every address a computer announced, the likeliest first: the church network, then a cable
/// straight between two computers (each gives itself a 169.254 address), then anything else (a VPN).
fn reach_order(found: impl IntoIterator<Item = Ipv4Addr>) -> Vec<String> {
    let mut ips: Vec<Ipv4Addr> = found.into_iter().filter(|ip| !ip.is_loopback() && !ip.is_unspecified()).collect();
    ips.sort_by_key(|ip| (if ip.is_private() { 0 } else if ip.is_link_local() { 1 } else { 2 }, *ip));
    ips.dedup();
    ips.into_iter().map(|ip| ip.to_string()).collect()
}

/// A Media id as the library makes them (a UUID): nothing else is ever looked up or served.
fn media_id(text: &str) -> Option<&str> {
    (text.len() == 36 && text.chars().all(|c| c.is_ascii_hexdigit() || c == '-')).then_some(text)
}

// --- Serving ------------------------------------------------------------------------------------

/// A file this computer can lend: its name, where it is, its kind and when it was added.
type Lend = (String, PathBuf, String, String);

fn serve_forever(nearby: Arc<Nearby>, listener: TcpListener, lookup: impl Fn(&str) -> Option<Lend> + Send + Sync + Clone + 'static, offered: impl Fn(&[u8]) -> bool + Send + Sync + Clone + 'static) {
    for stream in listener.incoming().flatten() {
        if nearby.sending.load(Ordering::Relaxed) >= MAX_SENDING {
            let mut stream = stream;
            let _ = stream.write_all(b"HTTP/1.1 503 Busy\r\ncontent-length: 0\r\nconnection: close\r\n\r\n");
            continue;
        }
        nearby.sending.fetch_add(1, Ordering::Relaxed);
        let (nearby, lookup, offered) = (Arc::clone(&nearby), lookup.clone(), offered.clone());
        std::thread::spawn(move || {
            let _ = answer(&nearby, stream, &lookup, &offered);
            nearby.sending.fetch_sub(1, Ordering::Relaxed);
        });
    }
}

/// The library's own Media files, by id.
fn library_lookup(app: tauri::AppHandle) -> impl Fn(&str) -> Option<Lend> + Send + Sync + Clone + 'static {
    move |id: &str| {
        let db = app.state::<crate::db::Db>();
        let conn = db.0.lock().ok()?;
        conn.query_row("SELECT name, path, kind, created_at FROM media_assets WHERE id = ?1", [id], |row| Ok((row.get::<_, String>(0)?, PathBuf::from(row.get::<_, String>(1)?), row.get::<_, String>(2)?, row.get::<_, String>(3)?)))
            .ok()
    }
}

/// The request line, the headers this server reads (anything longer than a few KB is refused), and
/// what of the body was read along with them.
fn read_request(stream: &TcpStream) -> Option<(String, String, HashMap<String, String>, Vec<u8>)> {
    let mut reader = BufReader::new(stream.take(16 * 1024));
    let mut line = String::new();
    reader.read_line(&mut line).ok()?;
    let mut parts = line.split_whitespace();
    let (method, path) = (parts.next()?.to_string(), parts.next()?.to_string());
    let mut headers = HashMap::new();
    loop {
        let mut header = String::new();
        if reader.read_line(&mut header).ok()? == 0 || header.trim().is_empty() {
            break;
        }
        if let Some((name, value)) = header.split_once(':') {
            headers.insert(name.trim().to_ascii_lowercase(), value.trim().to_string());
        }
    }
    let rest = reader.buffer().to_vec();
    Some((method, path, headers, rest))
}

/// An offer's body: all of it, or None when it is too long or was cut short.
fn read_body(stream: &TcpStream, headers: &HashMap<String, String>, mut body: Vec<u8>) -> Option<Vec<u8>> {
    let length = headers.get("content-length")?.parse::<usize>().ok()?;
    if length > MAX_OFFER || body.len() > length {
        return None;
    }
    stream.take((length - body.len()) as u64).read_to_end(&mut body).ok()?;
    (body.len() == length).then_some(body)
}

fn answer(nearby: &Nearby, mut stream: TcpStream, lookup: &impl Fn(&str) -> Option<Lend>, offered: &impl Fn(&[u8]) -> bool) -> std::io::Result<()> {
    stream.set_read_timeout(Some(Duration::from_secs(10)))?;
    stream.set_write_timeout(Some(Duration::from_secs(60)))?;
    let status = |stream: &mut TcpStream, code: &str| stream.write_all(format!("HTTP/1.1 {code}\r\ncontent-length: 0\r\nconnection: close\r\n\r\n").as_bytes());
    let Some((method, path, headers, rest)) = read_request(&stream) else { return status(&mut stream, "400 Bad Request") };
    let secret = lock(&nearby.inner).secret;
    if method == "POST" && path == "/v1/offer" {
        let Some(secret) = secret else { return status(&mut stream, "403 Forbidden") };
        let Some(body) = read_body(&stream, &headers, rest) else { return status(&mut stream, "413 Too Large") };
        let (time, signature) = (headers.get("x-cs-time").map_or("", String::as_str), headers.get("x-cs-sign").map_or("", String::as_str));
        if !verify_offer(&secret, &path, time, signature, &body, now_secs()) {
            return status(&mut stream, "403 Forbidden");
        }
        return status(&mut stream, if offered(&body) { "200 OK" } else { "409 Not Kept" });
    }
    let signed = secret.is_some_and(|secret| verify(&secret, &path, headers.get("x-cs-time").map_or("", String::as_str), headers.get("x-cs-sign").map_or("", String::as_str), now_secs()));
    if method != "GET" || !signed {
        return status(&mut stream, "403 Forbidden");
    }
    let Some(id) = path.strip_prefix("/v1/media/").and_then(media_id) else { return status(&mut stream, "404 Not Found") };
    let Some((name, file_path, kind, created)) = lookup(id) else { return status(&mut stream, "404 Not Found") };
    let Ok(mut file) = std::fs::File::open(&file_path) else { return status(&mut stream, "404 Not Found") };
    let bytes = file.metadata()?.len();
    let ext = file_path.extension().and_then(|ext| ext.to_str()).unwrap_or_default().to_ascii_lowercase();
    let name64 = base64::engine::general_purpose::STANDARD.encode(name.as_bytes());
    stream.write_all(
        format!("HTTP/1.1 200 OK\r\ncontent-type: application/octet-stream\r\ncontent-length: {bytes}\r\nx-cs-name: {name64}\r\nx-cs-kind: {kind}\r\nx-cs-ext: {ext}\r\nx-cs-created: {created}\r\nconnection: close\r\n\r\n").as_bytes(),
    )?;
    std::io::copy(&mut file, &mut stream)?;
    stream.flush()
}

// --- Finding each other -------------------------------------------------------------------------

fn listen(nearby: &Arc<Nearby>, daemon: &ServiceDaemon) -> Result<(), String> {
    let events = daemon.browse(SERVICE).map_err(|error| error.to_string())?;
    let nearby = Arc::clone(nearby);
    std::thread::Builder::new()
        .name("nearby".into())
        .spawn(move || {
            while let Ok(event) = events.recv() {
                let mut inner = lock(&nearby.inner);
                match event {
                    ServiceEvent::ServiceResolved(found) => {
                        let device = found.get_property_val_str("d").unwrap_or_default().to_string();
                        let same_licence = found.get_property_val_str("t") == Some(inner.tag.as_str());
                        let hosts = reach_order(found.get_addresses_v4());
                        if same_licence && !hosts.is_empty() && !device.is_empty() && device != inner.device {
                            let name = found.get_property_val_str("n").unwrap_or("Computer").to_string();
                            log::info!("NEARBY found {name} at {}:{}", hosts.join(","), found.port);
                            inner.resting.remove(&device);
                            inner.peers.insert(found.fullname.clone(), Peer { device, name, hosts, port: found.port });
                        }
                    }
                    ServiceEvent::ServiceRemoved(_, fullname) => {
                        if let Some(peer) = inner.peers.remove(&fullname) {
                            log::info!("NEARBY left {}", peer.name);
                        }
                    }
                    _ => {}
                }
            }
        })
        .map(|_| ())
        .map_err(|error| error.to_string())
}

fn announce(inner: &mut Inner) -> Result<(), String> {
    let daemon = inner.daemon.as_ref().ok_or("Nearby is not running.")?;
    if let Some(old) = inner.registered.take() {
        let _ = daemon.unregister(&old);
    }
    let short: String = inner.device.chars().filter(char::is_ascii_alphanumeric).take(12).collect();
    let instance = format!("church-studio-{short}");
    let properties = [("t", inner.tag.as_str()), ("d", inner.device.as_str()), ("n", inner.name.as_str()), ("v", "1")];
    let info = ServiceInfo::new(SERVICE, &instance, &format!("{instance}.local."), "", inner.port, &properties[..]).map_err(|error| error.to_string())?.enable_addr_auto();
    inner.registered = Some(info.get_fullname().to_string());
    daemon.register(info).map_err(|error| error.to_string())
}

/// Start (or refresh) Nearby for this licence: the file server, the announcement and the search.
#[tauri::command(async)]
pub fn nearby_start(app: tauri::AppHandle, nearby: tauri::State<'_, Arc<Nearby>>, key: String, device: String, name: String) -> Result<u16, String> {
    let nearby = Arc::clone(&nearby);
    let mut inner = lock(&nearby.inner);
    let (tag, name) = (tag_for(&key), name.chars().take(60).collect::<String>());
    if inner.daemon.is_some() && inner.tag == tag && inner.name == name && inner.device == device {
        return Ok(inner.port);
    }
    if inner.port == 0 {
        // The usual port when it is free (one firewall rule fits every computer), else any port.
        let listener = TcpListener::bind((Ipv4Addr::UNSPECIFIED, PORT)).or_else(|_| TcpListener::bind((Ipv4Addr::UNSPECIFIED, 0))).map_err(|error| error.to_string())?;
        inner.port = listener.local_addr().map_err(|error| error.to_string())?.port();
        let (lookup, offered, serving) = (library_lookup(app.clone()), offer_keeper(app.clone()), Arc::clone(&nearby));
        std::thread::Builder::new().name("nearby-files".into()).spawn(move || serve_forever(serving, listener, lookup, offered)).map_err(|error| error.to_string())?;
    }
    if inner.tag != tag {
        inner.peers.clear();
    }
    inner.secret = Some(secret_for(&key));
    inner.tag = tag;
    inner.device = device;
    inner.name = name;
    if inner.daemon.is_none() {
        let daemon = ServiceDaemon::new().map_err(|error| error.to_string())?;
        listen(&nearby, &daemon)?;
        inner.daemon = Some(daemon);
    }
    announce(&mut inner)?;
    log::info!("NEARBY on port {}", inner.port);
    Ok(inner.port)
}

/// This computer left its licence (or went back to Free): no longer announced, and nothing served.
#[tauri::command(async)]
pub fn nearby_stop(nearby: tauri::State<'_, Arc<Nearby>>) {
    let mut inner = lock(&nearby.inner);
    inner.secret = None;
    inner.peers.clear();
    inner.resting.clear();
    if let Some(daemon) = inner.daemon.take() {
        if let Some(old) = inner.registered.take() {
            let _ = daemon.unregister(&old);
        }
        let _ = daemon.shutdown();
    }
}

/// The computers on this licence found on this network.
#[tauri::command]
pub fn nearby_peers(nearby: tauri::State<'_, Arc<Nearby>>) -> Vec<Peer> {
    let mut peers: Vec<Peer> = lock(&nearby.inner).peers.values().cloned().collect();
    peers.sort_by(|a, b| a.name.cmp(&b.name));
    peers.dedup_by(|a, b| a.device == b.device);
    peers
}

// --- Offers: one computer pushes, the others accept -----------------------------------------------

/// The offer's id, from its JSON: a UUID, so it is safe as a file name.
fn offer_id(body: &[u8]) -> Option<String> {
    let value: serde_json::Value = serde_json::from_slice(body).ok()?;
    media_id(value.get("id")?.as_str()?).map(str::to_string)
}

/// Keep an offer for the desk, unless it was answered already or too many are waiting.
fn keep_offer(dir: &std::path::Path, body: &[u8], now: SystemTime) -> Option<String> {
    let id = offer_id(body)?;
    std::fs::create_dir_all(dir).ok()?;
    let (mut waiting, mut answered) = (0, false);
    for entry in std::fs::read_dir(dir).ok()?.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if name.ends_with(".json") {
            waiting += 1;
        } else if name == format!("{id}.done") {
            answered = true;
        } else if name.ends_with(".done") {
            let old = entry.metadata().and_then(|meta| meta.modified()).ok().and_then(|at| now.duration_since(at).ok());
            if old.is_some_and(|age| age.as_secs() > ANSWERED_SECS) {
                let _ = std::fs::remove_file(entry.path());
            }
        }
    }
    let file = dir.join(format!("{id}.json"));
    if answered || (waiting >= MAX_WAITING && !file.exists()) {
        return None;
    }
    let part = dir.join(format!("{id}.part"));
    std::fs::write(&part, body).ok()?;
    std::fs::rename(&part, &file).ok()?;
    Some(id)
}

fn offers_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(crate::library::data_dir(app)?.join("nearby-offers"))
}

/// An offer that came in: kept on disk, and the desk told.
fn offer_keeper(app: tauri::AppHandle) -> impl Fn(&[u8]) -> bool + Send + Sync + Clone + 'static {
    move |body: &[u8]| {
        use tauri::Emitter;
        let Some(id) = offers_dir(&app).ok().and_then(|dir| keep_offer(&dir, body, SystemTime::now())) else { return false };
        log::info!("NEARBY offer {id} came in");
        let _ = app.emit("nearby-offer", ());
        true
    }
}

/// Offer one computer `body`, at each of its addresses in turn: true when it kept it.
fn send_offer(peer: &Peer, secret: &[u8; 32], body: &[u8]) -> bool {
    let path = "/v1/offer";
    peer.hosts.iter().any(|host| {
        let time = now_secs();
        agent()
            .post(&format!("http://{host}:{}{path}", peer.port))
            .header("x-cs-time", &time.to_string())
            .header("x-cs-sign", &sign_offer(secret, path, time, body))
            .send(body)
            .is_ok_and(|response| response.status().as_u16() == 200)
    })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OfferSent {
    device: String,
    name: String,
    sent: bool,
}

/// Offer `body` to every computer on this licence on this network, and say who has it.
#[tauri::command(async)]
pub fn nearby_offer_send(nearby: tauri::State<'_, Arc<Nearby>>, body: String) -> Result<Vec<OfferSent>, String> {
    if body.len() > MAX_OFFER {
        return Err("That is too much to send at once. Choose fewer items.".into());
    }
    let (secret, mut peers) = {
        let inner = lock(&nearby.inner);
        (inner.secret, inner.peers.values().cloned().collect::<Vec<_>>())
    };
    let secret = secret.ok_or("Sending to computers nearby needs a licence key on this computer.")?;
    peers.sort_by(|a, b| a.device.cmp(&b.device));
    peers.dedup_by(|a, b| a.device == b.device);
    let sending: Vec<_> = peers
        .into_iter()
        .map(|peer| {
            let body = body.clone();
            std::thread::spawn(move || OfferSent { sent: send_offer(&peer, &secret, body.as_bytes()), device: peer.device, name: peer.name })
        })
        .collect();
    Ok(sending.into_iter().filter_map(|thread| thread.join().ok()).collect())
}

/// The offers waiting for an answer, as they came.
#[tauri::command(async)]
pub fn nearby_offers(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    let Ok(entries) = std::fs::read_dir(offers_dir(&app)?) else { return Ok(Vec::new()) };
    Ok(entries
        .flatten()
        .filter(|entry| entry.path().extension().is_some_and(|ext| ext == "json"))
        .filter_map(|entry| std::fs::read_to_string(entry.path()).ok())
        .collect())
}

/// Accepted or declined: gone, and remembered for a while so it cannot be asked again.
#[tauri::command(async)]
pub fn nearby_offer_done(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let id = media_id(&id).ok_or("That offer has no proper id.")?;
    let dir = offers_dir(&app)?;
    std::fs::write(dir.join(format!("{id}.done")), b"").map_err(|error| error.to_string())?;
    let _ = std::fs::remove_file(dir.join(format!("{id}.json")));
    Ok(())
}

// --- Fetching -----------------------------------------------------------------------------------

fn agent() -> ureq::Agent {
    ureq::Agent::config_builder()
        .http_status_as_error(false)
        .timeout_connect(Some(Duration::from_secs(3)))
        .timeout_recv_response(Some(Duration::from_secs(15)))
        .timeout_recv_body(Some(Duration::from_secs(20 * 60)))
        .build()
        .into()
}

/// A file copied from a peer into `dir`, ready to record: its name, kind, when it was added, and path.
struct Fetched {
    name: String,
    kind: String,
    created: String,
    dest: PathBuf,
}

/// What asking one computer for a file came to.
enum Reach {
    Got(Fetched),
    /// It answered without the file (or the copy was cut short): the next one, or the cloud.
    Missing,
    /// None of its addresses answered: asleep, or gone home.
    Unreachable,
}

/// Ask one computer for a file, at each of its addresses in turn, and copy it into `dir`.
fn fetch_from(peer: &Peer, secret: &[u8; 32], id: &str, dir: &std::path::Path) -> Reach {
    let path = format!("/v1/media/{id}");
    let mut answered = None;
    for host in &peer.hosts {
        let time = now_secs();
        if let Ok(response) = agent().get(&format!("http://{host}:{}{path}", peer.port)).header("x-cs-time", &time.to_string()).header("x-cs-sign", &sign(secret, &path, time)).call() {
            answered = Some(response);
            break;
        }
    }
    let Some(mut response) = answered else { return Reach::Unreachable };
    if response.status().as_u16() != 200 {
        return Reach::Missing;
    }
    let header = |name: &str| response.headers().get(name).and_then(|value| value.to_str().ok()).unwrap_or_default().to_string();
    let (kind, ext, created, length) = (header("x-cs-kind"), header("x-cs-ext").to_ascii_lowercase(), header("x-cs-created"), header("content-length").parse::<u64>().ok());
    let name = base64::engine::general_purpose::STANDARD.decode(header("x-cs-name")).ok().and_then(|bytes| String::from_utf8(bytes).ok()).unwrap_or_else(|| format!("{id}.{ext}"));
    if crate::db::media_kind(&ext) != Some(kind.as_str()) {
        return Reach::Missing;
    }
    let dest = dir.join(format!("{id}.{ext}"));
    let part = dir.join(format!("{id}.{ext}.nearby"));
    let copied = (|| -> std::io::Result<u64> {
        let mut out = std::fs::File::create(&part)?;
        std::io::copy(&mut response.body_mut().with_config().limit(u64::MAX).reader(), &mut out)
    })();
    // Cut short (the laptop closed its lid) or the disk full: not kept.
    if !matches!((copied, length), (Ok(got), Some(want)) if got == want) || crate::storage::rename_patiently(&part, &dest).is_err() {
        let _ = std::fs::remove_file(&part);
        return Reach::Missing;
    }
    Reach::Got(Fetched { name, kind, created, dest })
}

/// Copy a Media file from a computer nearby: the computer's name, or None when none of them has it.
#[tauri::command(async)]
pub fn nearby_fetch(app: tauri::AppHandle, db: tauri::State<'_, crate::db::Db>, nearby: tauri::State<'_, Arc<Nearby>>, id: String) -> Result<Option<String>, String> {
    let id = media_id(&id).ok_or("That file has no proper id.")?.to_string();
    let (secret, peers) = {
        let mut inner = lock(&nearby.inner);
        let now = std::time::Instant::now();
        inner.resting.retain(|_, until| *until > now);
        let resting = inner.resting.clone();
        (inner.secret, inner.peers.values().filter(|peer| !resting.contains_key(&peer.device)).cloned().collect::<Vec<_>>())
    };
    let Some(secret) = secret else { return Ok(None) };
    let dir = crate::library::data_dir(&app)?.join("media");
    std::fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    for peer in peers {
        let got = match fetch_from(&peer, &secret, &id, &dir) {
            Reach::Got(got) => got,
            Reach::Missing => continue,
            Reach::Unreachable => {
                // Asked again in a minute, so a sleeping laptop does not slow every file down.
                lock(&nearby.inner).resting.insert(peer.device.clone(), std::time::Instant::now() + REST);
                continue;
            }
        };
        let conn = db.0.lock().map_err(|_| "The library is busy. Try again.".to_string())?;
        let created = if got.created.is_empty() { crate::db::chrono_now() } else { got.created };
        crate::db::record_media_at(&conn, &id, &got.name, &got.dest, &got.kind, &created)?;
        log::info!("NEARBY got {id} from {}", peer.name);
        return Ok(Some(peer.name));
    }
    Ok(None)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn signs_requests_only_the_same_licence_can_make_and_only_for_a_few_minutes() {
        let secret = secret_for("CS1-KEY");
        let signature = sign(&secret, "/v1/media/x", 1_000);
        assert!(verify(&secret, "/v1/media/x", "1000", &signature, 1_100));
        assert!(!verify(&secret, "/v1/media/y", "1000", &signature, 1_100), "another file");
        assert!(!verify(&secret_for("CS1-OTHER"), "/v1/media/x", "1000", &signature, 1_100), "another licence");
        assert!(!verify(&secret, "/v1/media/x", "1000", &signature, 1_000 + SKEW_SECS + 1), "too old");
        assert!(!verify(&secret, "/v1/media/x", "1000", "zz", 1_000));
        assert_eq!(secret_for(" CS1-KEY\n"), secret, "the key as pasted");
    }

    #[test]
    fn the_announced_tag_matches_on_one_licence_and_gives_nothing_away() {
        assert_eq!(tag_for("CS1-KEY"), tag_for("CS1-KEY"));
        assert_ne!(tag_for("CS1-KEY"), tag_for("CS1-OTHER"));
        assert_eq!(tag_for("CS1-KEY").len(), 16);
        assert_ne!(tag_for("CS1-KEY"), hex(&secret_for("CS1-KEY"))[..16]);
    }

    fn scratch() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("cs-nearby-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    /// A computer lending one file on a free port, as another computer on the licence sees it.
    fn lender(key: &str, id: &'static str, file: PathBuf) -> Peer {
        let nearby = Arc::new(Nearby::default());
        lock(&nearby.inner).secret = Some(secret_for(key));
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
        let port = listener.local_addr().unwrap().port();
        std::thread::spawn(move || serve_forever(nearby, listener, move |asked: &str| (asked == id).then(|| ("Welcome slide.mp4".to_string(), file.clone(), "video".to_string(), "2026-10-25T08:00:00Z".to_string())), |_: &[u8]| false));
        Peer { device: "office".into(), name: "Office PC".into(), hosts: vec!["127.0.0.1".into()], port }
    }

    #[test]
    fn copies_a_file_from_a_computer_on_the_same_licence_and_no_one_else() {
        const ID: &str = "1b6c2f1e-3a4d-4e5f-8a9b-1c2d3e4f5a6b";
        let (theirs, mine) = (scratch(), scratch());
        let video = theirs.join("video.mp4");
        std::fs::write(&video, vec![7u8; 300_000]).unwrap();
        let peer = lender("CS1-KEY", ID, video);

        let Reach::Got(got) = fetch_from(&peer, &secret_for("CS1-KEY"), ID, &mine) else { panic!("the file comes over") };
        assert_eq!((got.name.as_str(), got.kind.as_str(), got.created.as_str()), ("Welcome slide.mp4", "video", "2026-10-25T08:00:00Z"));
        assert_eq!(got.dest, mine.join(format!("{ID}.mp4")));
        assert_eq!(std::fs::read(&got.dest).unwrap().len(), 300_000);
        assert!(!mine.join(format!("{ID}.mp4.nearby")).exists());

        // Another licence is refused; a file the computer does not have is simply not there.
        let elsewhere = scratch();
        assert!(matches!(fetch_from(&peer, &secret_for("CS1-OTHER"), ID, &elsewhere), Reach::Missing));
        assert!(matches!(fetch_from(&peer, &secret_for("CS1-KEY"), "2b6c2f1e-3a4d-4e5f-8a9b-1c2d3e4f5a6b", &elsewhere), Reach::Missing));
        assert_eq!(std::fs::read_dir(&elsewhere).unwrap().count(), 0);
        for dir in [theirs, mine, elsewhere] {
            let _ = std::fs::remove_dir_all(dir);
        }
    }

    #[test]
    fn tries_the_church_network_first_then_a_cable_straight_between_two_computers() {
        let found = ["100.101.5.9", "169.254.20.7", "127.0.0.1", "192.168.1.20"].map(|ip| ip.parse::<Ipv4Addr>().unwrap());
        assert_eq!(reach_order(found), vec!["192.168.1.20", "169.254.20.7", "100.101.5.9"]);
    }

    #[test]
    fn a_computer_that_went_away_is_unreachable_not_missing_the_file() {
        let closed = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap().local_addr().unwrap().port();
        let peer = Peer { device: "gone".into(), name: "Gone".into(), hosts: vec!["127.0.0.1".into()], port: closed };
        let dir = scratch();
        assert!(matches!(fetch_from(&peer, &secret_for("CS1-KEY"), "1b6c2f1e-3a4d-4e5f-8a9b-1c2d3e4f5a6b", &dir), Reach::Unreachable));
        let _ = std::fs::remove_dir_all(dir);
    }

    fn keeper(key: &str, kept: Arc<Mutex<Vec<Vec<u8>>>>) -> Peer {
        let nearby = Arc::new(Nearby::default());
        lock(&nearby.inner).secret = Some(secret_for(key));
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
        let port = listener.local_addr().unwrap().port();
        std::thread::spawn(move || {
            serve_forever(nearby, listener, |_: &str| None, move |body: &[u8]| {
                lock(&kept).push(body.to_vec());
                true
            })
        });
        Peer { device: "laptop".into(), name: "Laptop".into(), hosts: vec!["127.0.0.1".into()], port }
    }

    #[test]
    fn an_offer_reaches_a_computer_on_the_same_licence_whole_and_no_one_else() {
        let kept: Arc<Mutex<Vec<Vec<u8>>>> = Arc::default();
        let peer = keeper("CS1-OURS", kept.clone());
        // Longer than the read that takes in the headers, so its start comes along with them.
        let body = vec![b'x'; 200_000];
        assert!(send_offer(&peer, &secret_for("CS1-OURS"), &body));
        assert_eq!(lock(&kept).as_slice(), &[body.clone()]);
        assert!(!send_offer(&peer, &secret_for("CS1-OTHER"), &body), "another licence");
        assert_eq!(lock(&kept).len(), 1);
    }

    #[test]
    fn a_signature_covers_the_offer_itself() {
        let secret = secret_for("CS1-OURS");
        let signature = sign_offer(&secret, "/v1/offer", 1_000, b"songs");
        assert!(verify_offer(&secret, "/v1/offer", "1000", &signature, b"songs", 1_100));
        assert!(!verify_offer(&secret, "/v1/offer", "1000", &signature, b"other songs", 1_100), "swapped body");
        assert!(!verify(&secret, "/v1/offer", "1000", &signature, 1_100), "not a GET");
        assert!(!verify_offer(&secret, "/v1/offer", "1000", &signature, b"songs", 1_000 + SKEW_SECS + 1), "too old");
    }

    #[test]
    fn an_answered_offer_is_not_kept_again_and_the_wait_is_capped() {
        let dir = scratch();
        let id = "0b6c2f1e-3a4d-4e5f-8a9b-1c2d3e4f5a6b";
        let body = format!(r#"{{"id":"{id}"}}"#).into_bytes();
        let now = SystemTime::now();
        assert_eq!(keep_offer(&dir, &body, now).as_deref(), Some(id));
        assert!(dir.join(format!("{id}.json")).exists());
        std::fs::remove_file(dir.join(format!("{id}.json"))).unwrap();
        std::fs::write(dir.join(format!("{id}.done")), b"").unwrap();
        assert_eq!(keep_offer(&dir, &body, now), None, "answered");
        assert_eq!(keep_offer(&dir, br#"{"id":"../../evil"}"#, now), None, "not an id");
        for n in 0..MAX_WAITING {
            std::fs::write(dir.join(format!("{n}.json")), b"{}").unwrap();
        }
        assert_eq!(keep_offer(&dir, br#"{"id":"1b6c2f1e-3a4d-4e5f-8a9b-1c2d3e4f5a6b"}"#, now), None, "too many waiting");
    }

    #[test]
    fn serves_only_media_ids() {
        assert!(media_id("1b6c2f1e-3a4d-4e5f-8a9b-1c2d3e4f5a6b").is_some());
        assert!(media_id("../../etc/passwd").is_none());
        assert!(media_id("1b6c2f1e-3a4d-4e5f-8a9b-1c2d3e4f5a6b/..").is_none());
    }
}
