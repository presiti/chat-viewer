//! File upload (multipart `SYNO.Chat.Post create`) and download (`SYNO.Chat.Post.File get`)
//! with progress events for the webview.

use std::path::Path;

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use tauri::{AppHandle, Emitter};

use crate::api;
use crate::error::{AppError, Result};
use crate::session::Session;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadRequest {
    pub channel_id: i64,
    pub path: Option<String>,
    pub bytes: Option<Vec<u8>>,
    pub file_name: String,
    pub message: Option<String>,
    pub thread_id: Option<i64>,
    pub upload_id: String,
}

#[derive(Clone, Serialize)]
pub struct Progress<'a> {
    pub id: &'a str,
    pub sent: u64,
    pub total: u64,
}

const CHUNK: usize = 256 * 1024;

pub async fn upload(app: &AppHandle, http: &reqwest::Client, session: &Session, req: UploadRequest) -> Result<Value> {
    let data: Vec<u8> = match (&req.path, req.bytes) {
        (Some(p), _) => tokio::fs::read(p).await.map_err(|e| AppError::Other(format!("read {p}: {e}")))?,
        (None, Some(b)) => b,
        _ => return Err(AppError::Other("upload needs a path or bytes".into())),
    };
    let total = data.len() as u64;
    let mime = mime_guess::from_path(&req.file_name).first_or_octet_stream().to_string();

    // Stream the body in chunks so we can report progress as reqwest pulls them.
    let app2 = app.clone();
    let id = req.upload_id.clone();
    let mut sent: u64 = 0;
    let chunks: Vec<Vec<u8>> = data.chunks(CHUNK).map(|c| c.to_vec()).collect();
    let stream = futures_util::stream::iter(chunks).map(move |c| {
        sent += c.len() as u64;
        let _ = app2.emit("chat://upload-progress", Progress { id: &id, sent, total });
        Ok::<_, std::io::Error>(c)
    });
    let part = reqwest::multipart::Part::stream_with_length(reqwest::Body::wrap_stream(stream), total)
        .file_name(req.file_name.clone())
        .mime_str(&mime)
        .map_err(|e| AppError::Other(e.to_string()))?;

    let mut form = reqwest::multipart::Form::new()
        .text("api", "SYNO.Chat.Post")
        .text("method", "create")
        .text("version", "5")
        .text("channel_id", req.channel_id.to_string())
        .text("type", "file")
        .text("message", req.message.unwrap_or_default());
    // No `is_thread` at all: on the multipart path the server reads it as a string, and even "false" made it
    // create a "게시물 생성" system post. Comments carry thread_id only, like the official client.
    if let Some(t) = req.thread_id {
        form = form.text("thread_id", t.to_string());
    }
    if let Some(c) = &session.conn_id {
        form = form.text("conn_id", c.clone());
    }
    form = form.part("file", part);

    let resp = http
        .post(session.entry_url())
        .query(&[("_sid", &session.sid), ("SynoToken", &session.synotoken)])
        .multipart(form)
        .send()
        .await?;
    let status = resp.status();
    let body: Value = resp.json().await.map_err(|e| AppError::Http(format!("{status}: {e}")))?;
    if body.get("success").and_then(Value::as_bool).unwrap_or(false) {
        Ok(body.get("data").cloned().unwrap_or(Value::Null))
    } else {
        let code = body.pointer("/error/code").and_then(Value::as_i64).unwrap_or(-1);
        Err(AppError::Api { api: "SYNO.Chat.Post".into(), method: "create".into(), code })
    }
}

/// `SYNO.Chat.User set v3` with an `avatar` file part (the official client's profile picture upload).
pub async fn upload_avatar(http: &reqwest::Client, session: &Session, file_name: String, bytes: Vec<u8>) -> Result<Value> {
    let mime = mime_guess::from_path(&file_name).first_or_octet_stream().to_string();
    let part = reqwest::multipart::Part::bytes(bytes)
        .file_name(file_name)
        .mime_str(&mime)
        .map_err(|e| AppError::Other(e.to_string()))?;
    let form = reqwest::multipart::Form::new()
        .text("api", "SYNO.Chat.User")
        .text("method", "set")
        .text("version", "3")
        .part("avatar", part);
    let resp = http
        .post(session.entry_url())
        .query(&[("_sid", &session.sid), ("SynoToken", &session.synotoken)])
        .multipart(form)
        .send()
        .await?;
    let status = resp.status();
    let body: Value = resp.json().await.map_err(|e| AppError::Http(format!("{status}: {e}")))?;
    if body.get("success").and_then(Value::as_bool).unwrap_or(false) {
        Ok(body.get("data").cloned().unwrap_or(Value::Null))
    } else {
        let code = body.pointer("/error/code").and_then(Value::as_i64).unwrap_or(-1);
        Err(AppError::Api { api: "SYNO.Chat.User".into(), method: "set".into(), code })
    }
}

pub async fn download(app: &AppHandle, http: &reqwest::Client, session: &Session, post_id: i64, save_path: &str) -> Result<String> {
    let mut params = Map::new();
    params.insert("post_id".into(), Value::from(post_id));
    let url = api::media_url(session, "SYNO.Chat.Post.File", "get", 2, &params);
    let resp = http.get(url).send().await?;
    if !resp.status().is_success() {
        return Err(AppError::Http(format!("download failed: {}", resp.status())));
    }
    let total = resp.content_length().unwrap_or(0);
    if let Some(parent) = Path::new(save_path).parent() {
        let _ = tokio::fs::create_dir_all(parent).await;
    }
    let mut file = tokio::fs::File::create(save_path).await.map_err(|e| AppError::Other(format!("create {save_path}: {e}")))?;
    let mut stream = resp.bytes_stream();
    let mut done: u64 = 0;
    let id = format!("dl:{post_id}");
    use tokio::io::AsyncWriteExt;
    while let Some(chunk) = stream.next().await {
        let chunk = chunk?;
        file.write_all(&chunk).await.map_err(|e| AppError::Other(e.to_string()))?;
        done += chunk.len() as u64;
        let _ = app.emit("chat://download-progress", Progress { id: &id, sent: done, total });
    }
    file.flush().await.map_err(|e| AppError::Other(e.to_string()))?;
    Ok(save_path.to_string())
}
