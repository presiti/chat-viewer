use std::time::Duration;

use serde_json::{Map, Value};

use crate::error::{AppError, Result};
use crate::session::Session;

pub fn build_http_client() -> reqwest::Client {
    let insecure = std::env::var("CHAT_VIEWER_INSECURE").map(|v| v == "1").unwrap_or(false);
    reqwest::Client::builder()
        .danger_accept_invalid_certs(insecure)
        .timeout(Duration::from_secs(60))
        .user_agent("chat-viewer/0.1")
        .build()
        .expect("http client")
}

/// Convert a JSON value to the string form DSM expects in form bodies.
/// Objects/arrays are JSON-encoded, strings are passed as-is, null becomes "null".
pub fn form_value(v: &Value) -> String {
    match v {
        Value::String(s) => s.clone(),
        Value::Null => "null".to_string(),
        other => other.to_string(),
    }
}

/// Form value for a Chat API call. DSM reads every parameter as JSON first and falls back to the raw text only when that
/// fails, and its parser takes a valid *prefix*: the raw text `172.10.22.179` becomes the number 172.10 (stored as
/// "172.1"), `2026-11-25 회의` becomes 2026, `true story` becomes true. Text that begins like a JSON number, boolean,
/// null or string is therefore sent JSON-quoted, which is how the official client sends every string. Arrays/objects
/// that the callers already serialized (they start with `[` or `{`) and everything else stay as they are.
pub fn api_value(v: &Value) -> String {
    if let Value::String(s) = v {
        let t = s.trim_start();
        let starts_like_json = t.starts_with('"')
            || t.starts_with(|c: char| c.is_ascii_digit())
            || (t.starts_with('-') && t[1..].starts_with(|c: char| c.is_ascii_digit() || c == '.'))
            || ["true", "false", "null"].iter().any(|w| t.starts_with(w));
        if starts_like_json {
            return serde_json::to_string(s).unwrap_or_else(|_| s.clone());
        }
    }
    form_value(v)
}

/// Authenticated URL for resources the webview loads directly (avatars, thumbnails).
pub fn media_url(session: &Session, api: &str, method: &str, version: u32, params: &Map<String, Value>) -> String {
    let mut url = url::Url::parse(&session.entry_url()).expect("entry url");
    {
        let mut q = url.query_pairs_mut();
        q.append_pair("api", api)
            .append_pair("method", method)
            .append_pair("version", &version.to_string())
            .append_pair("_sid", &session.sid)
            .append_pair("SynoToken", &session.synotoken);
        for (k, v) in params {
            q.append_pair(k, &form_value(v));
        }
    }
    url.to_string()
}

/// Low-level call: POST form to entry.cgi with session query params. Returns the `data` field.
pub async fn call(
    http: &reqwest::Client,
    session: &Session,
    api: &str,
    method: &str,
    version: u32,
    params: &Map<String, Value>,
) -> Result<Value> {
    let mut form: Vec<(String, String)> = vec![
        ("api".into(), api.into()),
        ("method".into(), method.into()),
        ("version".into(), version.to_string()),
    ];
    for (k, v) in params {
        form.push((k.clone(), api_value(v)));
    }
    let resp = http
        .post(session.entry_url())
        .query(&[("_sid", &session.sid), ("SynoToken", &session.synotoken)])
        .form(&form)
        .send()
        .await?;
    let status = resp.status();
    let is_text = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .map(|ct| ct.starts_with("text/plain"))
        .unwrap_or(false);
    let raw = resp.bytes().await.map_err(|e| AppError::Http(format!("{status}: {e}")))?;
    // A few endpoints (Post.Snippet get) answer with the raw text instead of a JSON envelope.
    if is_text {
        if let Ok(body) = serde_json::from_slice::<Value>(&raw) {
            if body.get("success").is_some() { return unwrap_response(body, api, method); }
        }
        return Ok(Value::String(String::from_utf8_lossy(&raw).into_owned()));
    }
    let body: Value = serde_json::from_slice(&raw).map_err(|e| AppError::Http(format!("{status}: {e}")))?;
    unwrap_response(body, api, method)
}

/// Unauthenticated call (used for API info and login).
pub async fn call_public(
    http: &reqwest::Client,
    host: &str,
    api: &str,
    method: &str,
    version: u32,
    params: &[(&str, &str)],
) -> Result<Value> {
    let mut form: Vec<(String, String)> = vec![
        ("api".into(), api.into()),
        ("method".into(), method.into()),
        ("version".into(), version.to_string()),
    ];
    for (k, v) in params {
        form.push(((*k).into(), (*v).into()));
    }
    let resp = http.post(format!("{host}/webapi/entry.cgi")).form(&form).send().await?;
    let status = resp.status();
    let body: Value = resp.json().await.map_err(|e| AppError::Http(format!("{status}: {e}")))?;
    unwrap_response(body, api, method)
}

fn unwrap_response(body: Value, api: &str, method: &str) -> Result<Value> {
    if body.get("success").and_then(Value::as_bool).unwrap_or(false) {
        Ok(body.get("data").cloned().unwrap_or(Value::Null))
    } else {
        let code = body
            .pointer("/error/code")
            .and_then(Value::as_i64)
            .unwrap_or(-1);
        Err(AppError::Api { api: api.into(), method: method.into(), code })
    }
}
