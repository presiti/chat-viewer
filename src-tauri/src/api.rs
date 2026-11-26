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
/// "172.1"), `2026-11-25 회의` becomes 2026, `true story` becomes true, `[1] 안건` becomes the array [1]. Guessing which
/// texts are safe keeps missing cases, so every string is sent JSON-quoted, which is how the official client sends them.
/// Numbers, booleans, null, arrays and objects are JSON-encoded as before.
pub fn api_value(v: &Value) -> String {
    match v {
        Value::String(s) => serde_json::to_string(s).unwrap_or_else(|_| s.clone()),
        other => form_value(other),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn strings_are_always_json_quoted() {
        for s in ["172.10.22.179", "2026-11-25 회의", "true story", "null 체크", "\"인용\"", "-1.5도", "[1] 안건", "{a} 설명", "안녕하세요", ""] {
            assert_eq!(api_value(&json!(s)), serde_json::to_string(s).unwrap(), "{s}");
        }
    }

    #[test]
    fn non_strings_keep_their_json_form() {
        assert_eq!(api_value(&json!(42)), "42");
        assert_eq!(api_value(&json!(true)), "true");
        assert_eq!(api_value(&Value::Null), "null");
        assert_eq!(api_value(&json!([1, 2])), "[1,2]");
        assert_eq!(api_value(&json!({"a": "b"})), r#"{"a":"b"}"#);
    }
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
