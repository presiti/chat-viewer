//! Minimal Engine.IO v3 / Socket.IO v2 client over WebSocket, matching the
//! protocol the Synology Chat server speaks (`/sc/socket.io/?EIO=3`).
//!
//! Server → client packets are forwarded to the webview as the Tauri event
//! `chat://socket` with payload `{ event: String, data: Value }`.
//! Connection state changes are sent as `chat://socket-status`.

use std::sync::Arc;
use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Emitter};
use tokio::sync::{mpsc, watch, Mutex};
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::Message;

use crate::session::Session;

#[derive(Clone, Serialize)]
pub struct SocketEvent {
    pub event: String,
    pub data: Value,
}

#[derive(Clone, Serialize)]
pub struct SocketStatus {
    pub status: &'static str, // connecting | connected | reconnecting | disconnected
    pub attempt: u32,
}

pub struct SocketHandle {
    outbound: mpsc::UnboundedSender<String>,
    stop: watch::Sender<bool>,
}

impl SocketHandle {
    /// Emit a socket.io event (`42["name",data]`).
    pub fn emit(&self, event: &str, data: Option<Value>) {
        let arr = match data {
            Some(d) => serde_json::json!([event, d]),
            None => serde_json::json!([event]),
        };
        let _ = self.outbound.send(format!("42{arr}"));
    }

    pub fn close(&self) {
        let _ = self.stop.send(true);
    }
}

pub type SharedConnId = Arc<Mutex<Option<String>>>;

pub fn connect(app: AppHandle, session: Session, conn_id: SharedConnId) -> SocketHandle {
    let (tx, rx) = mpsc::unbounded_channel::<String>();
    let (stop_tx, stop_rx) = watch::channel(false);
    let rx = Arc::new(Mutex::new(rx));
    tauri::async_runtime::spawn(run_loop(app, session, conn_id, rx, stop_rx));
    SocketHandle { outbound: tx, stop: stop_tx }
}

fn ws_url(session: &Session) -> String {
    let origin = session.host.replacen("https://", "wss://", 1).replacen("http://", "ws://", 1);
    let mut url = url::Url::parse(&format!("{origin}/sc/socket.io/")).expect("ws url");
    url.query_pairs_mut()
        .append_pair("EIO", "3")
        .append_pair("transport", "websocket")
        .append_pair("SynoToken", &session.synotoken)
        // Note: `version_ui` must match the server's Chat package version exactly or the
        // server answers with error 505 "version mismatch"; omitting it is accepted.
        .append_pair("client", "browser");
    url.to_string()
}

fn status(app: &AppHandle, s: &'static str, attempt: u32) {
    let _ = app.emit("chat://socket-status", SocketStatus { status: s, attempt });
}

async fn run_loop(
    app: AppHandle,
    session: Session,
    conn_id: SharedConnId,
    rx: Arc<Mutex<mpsc::UnboundedReceiver<String>>>,
    mut stop: watch::Receiver<bool>,
) {
    let mut attempt: u32 = 0;
    loop {
        if *stop.borrow() {
            break;
        }
        status(&app, if attempt == 0 { "connecting" } else { "reconnecting" }, attempt);
        let result = run_once(&app, &session, &conn_id, &rx, &mut stop).await;
        if *stop.borrow() {
            break;
        }
        match result {
            Ok(()) => log::info!("socket closed by server"),
            Err(e) => log::warn!("socket error: {e}"),
        }
        attempt += 1;
        let backoff = Duration::from_secs((5u64 * attempt as u64).min(60));
        tokio::select! {
            _ = tokio::time::sleep(backoff) => {},
            _ = stop.changed() => break,
        }
    }
    status(&app, "disconnected", attempt);
}

async fn run_once(
    app: &AppHandle,
    session: &Session,
    conn_id: &SharedConnId,
    rx: &Arc<Mutex<mpsc::UnboundedReceiver<String>>>,
    stop: &mut watch::Receiver<bool>,
) -> Result<(), String> {
    let mut request = ws_url(session).into_client_request().map_err(|e| e.to_string())?;
    request
        .headers_mut()
        .insert("Cookie", format!("id={}", session.sid).parse().map_err(|_| "cookie header")?);
    request
        .headers_mut()
        .insert("Origin", session.host.parse().map_err(|_| "origin header")?);

    let (ws, _) = tokio_tungstenite::connect_async(request).await.map_err(|e| e.to_string())?;
    let (mut sink, mut stream) = ws.split();

    let mut ping_interval = Duration::from_secs(25);
    let mut ping_timer = tokio::time::interval(ping_interval);
    ping_timer.tick().await; // first tick is immediate; skip it
    let mut rx = rx.lock().await;
    let mut connected = false;

    loop {
        tokio::select! {
            _ = stop.changed() => {
                let _ = sink.send(Message::Close(None)).await;
                return Ok(());
            }
            _ = ping_timer.tick() => {
                sink.send(Message::Text("2".into())).await.map_err(|e| e.to_string())?;
            }
            Some(out) = rx.recv() => {
                sink.send(Message::Text(out.into())).await.map_err(|e| e.to_string())?;
            }
            msg = stream.next() => {
                let msg = match msg {
                    Some(Ok(m)) => m,
                    Some(Err(e)) => return Err(e.to_string()),
                    None => return Ok(()),
                };
                let text = match msg {
                    Message::Text(t) => t.to_string(),
                    Message::Close(_) => return Ok(()),
                    Message::Ping(p) => { let _ = sink.send(Message::Pong(p)).await; continue; }
                    _ => continue,
                };
                let mut chars = text.chars();
                match chars.next() {
                    Some('0') => {
                        // engine.io OPEN: {"sid":..,"pingInterval":..,"pingTimeout":..}
                        if let Ok(v) = serde_json::from_str::<Value>(chars.as_str()) {
                            if let Some(ms) = v.get("pingInterval").and_then(Value::as_u64) {
                                ping_interval = Duration::from_millis(ms);
                                ping_timer = tokio::time::interval(ping_interval);
                                ping_timer.tick().await;
                            }
                        }
                    }
                    Some('1') => return Ok(()), // engine.io CLOSE
                    Some('3') => {}             // PONG
                    Some('4') => {
                        let rest = chars.as_str();
                        match rest.chars().next() {
                            Some('0') => {
                                connected = true;
                                log::info!("socket connected");
                                status(app, "connected", 0);
                            }
                            Some('1') => return Ok(()), // socket.io DISCONNECT
                            Some('2') => {
                                let payload = &rest[1..];
                                // Skip optional ack id digits before the JSON array.
                                let json_start = payload.find('[').unwrap_or(0);
                                if let Ok(Value::Array(arr)) = serde_json::from_str::<Value>(&payload[json_start..]) {
                                    let mut it = arr.into_iter();
                                    let name = it.next().and_then(|v| v.as_str().map(String::from)).unwrap_or_default();
                                    let data = it.next().unwrap_or(Value::Null);
                                    // Server event names carry a `client.` prefix (client.init, client.post.create, ...).
                                    let name = if name.starts_with("client.") { name["client.".len()..].to_string() } else { name };
                                    if name == "init" {
                                        log::info!("socket init received");
                                        if let Some(id) = data.get("id").and_then(Value::as_str) {
                                            *conn_id.lock().await = Some(id.to_string());
                                        }
                                    }
                                    let _ = app.emit("chat://socket", SocketEvent { event: name, data });
                                }
                            }
                            Some('4') => log::warn!("socket.io error packet: {rest}"),
                            _ => {}
                        }
                    }
                    _ => {}
                }
                if !connected {
                    // Socket.IO v2 auto-connects the default namespace; nothing to send.
                }
            }
        }
    }
}
