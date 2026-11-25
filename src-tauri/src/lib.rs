mod api;
mod auth;
mod error;
mod index;
mod session;
mod socket;
mod upload;

use std::sync::Arc;

use serde_json::{Map, Value};
use tauri::{AppHandle, Manager, State};
use tokio::sync::Mutex;

use error::{AppError, Result};
use session::Session;

pub struct AppState {
    index: index::Index,
    http: reqwest::Client,
    session: Mutex<Option<Session>>,
    socket: Mutex<Option<socket::SocketHandle>>,
    conn_id: socket::SharedConnId,
}

impl AppState {
    async fn session(&self) -> Result<Session> {
        let guard = self.session.lock().await;
        let mut s = guard.clone().ok_or(AppError::NotLoggedIn)?;
        s.conn_id = self.conn_id.lock().await.clone();
        Ok(s)
    }
}

fn to_map(params: Option<Value>) -> Map<String, Value> {
    match params {
        Some(Value::Object(m)) => m,
        _ => Map::new(),
    }
}

#[tauri::command]
async fn login(
    state: State<'_, AppState>,
    host: String,
    account: String,
    password: String,
    otp: Option<String>,
    remember_device: Option<bool>,
) -> Result<auth::LoginInfo> {
    let (sess, info) = auth::login(
        &state.http,
        &host,
        &account,
        &password,
        otp.as_deref(),
        remember_device.unwrap_or(true),
    )
    .await?;
    *state.session.lock().await = Some(sess);
    Ok(info)
}

/// Try to resume a session saved in the keychain. Returns null when there is none or it expired.
#[tauri::command]
async fn restore_session(state: State<'_, AppState>) -> Result<Option<auth::LoginInfo>> {
    let Some(mut sess) = session::load_session() else { return Ok(None) };
    match auth::chat_login(&state.http, &mut sess).await {
        Ok(info) => {
            *state.session.lock().await = Some(sess);
            Ok(Some(info))
        }
        Err(e) => {
            log::info!("saved session rejected: {e}");
            session::clear_session();
            Ok(None)
        }
    }
}

#[tauri::command]
async fn logout(state: State<'_, AppState>) -> Result<()> {
    socket_disconnect(state.clone()).await?;
    if let Some(sess) = state.session.lock().await.take() {
        auth::logout(&state.http, &sess).await;
    }
    Ok(())
}

/// Generic Synology WebAPI call. `params` values that are objects/arrays are JSON-encoded.
#[tauri::command]
async fn api_call(
    state: State<'_, AppState>,
    api: String,
    method: String,
    version: u32,
    params: Option<Value>,
) -> Result<Value> {
    let sess = state.session().await?;
    let mut map = to_map(params);
    // Calls that need the live socket connection id get it injected automatically.
    if map.get("conn_id").map(|v| v.is_null()).unwrap_or(false) {
        match &sess.conn_id {
            Some(id) => { map.insert("conn_id".into(), Value::String(id.clone())); }
            None => { map.remove("conn_id"); }
        }
    }
    api::call(&state.http, &sess, &api, &method, version, &map).await
}

/// Several API calls in one HTTP round-trip (SYNO.Entry.Request).
#[tauri::command]
async fn api_compound(state: State<'_, AppState>, requests: Vec<Value>, parallel: Option<bool>) -> Result<Value> {
    let sess = state.session().await?;
    // Inject the live connection id into nested requests that ask for it with `conn_id: null`.
    let requests: Vec<Value> = requests
        .into_iter()
        .map(|mut r| {
            if let Value::Object(ref mut m) = r {
                if m.get("conn_id").map(|v| v.is_null()).unwrap_or(false) {
                    match &sess.conn_id {
                        Some(id) => { m.insert("conn_id".into(), Value::String(id.clone())); }
                        None => { m.remove("conn_id"); }
                    }
                }
            }
            r
        })
        .collect();
    let mut map = Map::new();
    map.insert("compound".into(), Value::Array(requests));
    map.insert("mode".into(), Value::String(if parallel.unwrap_or(true) { "parallel".into() } else { "sequential".into() }));
    map.insert("stop_when_error".into(), Value::Bool(false));
    api::call(&state.http, &sess, "SYNO.Entry.Request", "request", 1, &map).await
}

/// Authenticated URL for `<img src>` (avatars, thumbnails).
#[tauri::command]
async fn media_url(
    state: State<'_, AppState>,
    api: String,
    method: String,
    version: u32,
    params: Option<Value>,
) -> Result<String> {
    let sess = state.session().await?;
    Ok(api::media_url(&sess, &api, &method, version, &to_map(params)))
}

#[tauri::command]
async fn upload_post(app: AppHandle, state: State<'_, AppState>, req: upload::UploadRequest) -> Result<Value> {
    let sess = state.session().await?;
    upload::upload(&app, &state.http, &sess, req).await
}

#[tauri::command]
async fn upload_avatar(state: State<'_, AppState>, file_name: String, bytes: Vec<u8>) -> Result<Value> {
    let sess = state.session().await?;
    upload::upload_avatar(&state.http, &sess, file_name, bytes).await
}

#[tauri::command]
async fn download_file(app: AppHandle, state: State<'_, AppState>, post_id: i64, save_path: String) -> Result<String> {
    let sess = state.session().await?;
    upload::download(&app, &state.http, &sess, post_id, &save_path).await
}

#[tauri::command]
async fn index_upsert(state: State<'_, AppState>, posts: Vec<Value>) -> Result<usize> {
    let sess = state.session().await?;
    state.index.upsert(&sess.host, &posts)
}

#[tauri::command]
async fn index_delete(state: State<'_, AppState>, post_id: i64) -> Result<()> {
    let sess = state.session().await?;
    state.index.delete(&sess.host, post_id)
}

#[tauri::command]
async fn index_search(state: State<'_, AppState>, query: index::SearchQuery) -> Result<index::SearchResult> {
    let sess = state.session().await?;
    state.index.search(&sess.host, &query)
}

#[tauri::command]
async fn index_status(state: State<'_, AppState>, channels_total: i64) -> Result<index::Status> {
    let sess = state.session().await?;
    state.index.status(&sess.host, channels_total)
}

#[tauri::command]
async fn index_channel_state(state: State<'_, AppState>, channel_id: i64) -> Result<index::ChannelState> {
    let sess = state.session().await?;
    state.index.channel_state(&sess.host, channel_id)
}

#[tauri::command]
async fn index_set_channel_state(state: State<'_, AppState>, channel_state: index::ChannelState) -> Result<()> {
    let sess = state.session().await?;
    state.index.set_channel_state(&sess.host, &channel_state)
}

#[tauri::command]
async fn socket_connect(app: AppHandle, state: State<'_, AppState>) -> Result<()> {
    let sess = state.session().await?;
    let mut guard = state.socket.lock().await;
    if let Some(old) = guard.take() {
        old.close();
    }
    *guard = Some(socket::connect(app, sess, state.conn_id.clone()));
    Ok(())
}

#[tauri::command]
async fn socket_disconnect(state: State<'_, AppState>) -> Result<()> {
    if let Some(h) = state.socket.lock().await.take() {
        h.close();
    }
    *state.conn_id.lock().await = None;
    Ok(())
}

#[tauri::command]
async fn socket_emit(state: State<'_, AppState>, event: String, data: Option<Value>) -> Result<()> {
    match state.socket.lock().await.as_ref() {
        Some(h) => { h.emit(&event, data); Ok(()) }
        None => Err(AppError::Other("socket not connected".into())),
    }
}

/// Shows a system notification.
///
/// macOS dev builds are a bare binary, so `NSUserNotificationCenter` (which the notification plugin
/// uses) drops everything on recent macOS; `osascript display notification` still works there.
/// Bundled builds and other platforms go through the plugin. `sound` is a system sound name,
/// "default" for the alert sound, or empty/None for silent.
#[tauri::command]
async fn notify_native(app: AppHandle, title: String, body: String, sound: Option<String>) -> Result<()> {
    let sound = sound.filter(|s| !s.is_empty());
    #[cfg(target_os = "macos")]
    if tauri::is_dev() {
        let esc = |t: &str| t.replace('\\', "\\\\").replace('"', "\\\"");
        let mut script = format!("display notification \"{}\" with title \"{}\"", esc(&body), esc(&title));
        if let Some(sn) = sound.as_deref() {
            // AppleScript has no "default" keyword; Ping is the closest stock sound.
            let name = if sn == "default" { "Ping" } else { sn };
            script.push_str(&format!(" sound name \"{}\"", esc(name)));
        }
        let out = tokio::process::Command::new("osascript").arg("-e").arg(script).output().await.map_err(|e| AppError::Other(e.to_string()))?;
        if !out.status.success() {
            return Err(AppError::Other(String::from_utf8_lossy(&out.stderr).trim().to_string()));
        }
        return Ok(());
    }
    use tauri_plugin_notification::NotificationExt;
    let mut n = app.notification().builder().title(title).body(body);
    if let Some(sn) = sound {
        n = n.sound(if sn == "default" { "NSUserNotificationDefaultSoundName".to_string() } else { sn });
    }
    n.show().map_err(|e| AppError::Other(e.to_string()))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(log::LevelFilter::Info)
                .build(),
        )
        .setup(|app| {
            let data_dir = app.path().app_data_dir().expect("app data dir");
            session::init(data_dir.clone());
            app.manage(AppState {
                index: index::Index::new(data_dir),
                http: api::build_http_client(),
                session: Mutex::new(None),
                socket: Mutex::new(None),
                conn_id: Arc::new(Mutex::new(None)),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            notify_native,
            login,
            restore_session,
            logout,
            api_call,
            api_compound,
            media_url,
            upload_post,
            upload_avatar,
            download_file,
            index_upsert,
            index_delete,
            index_search,
            index_status,
            index_channel_state,
            index_set_channel_state,
            socket_connect,
            socket_disconnect,
            socket_emit
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
