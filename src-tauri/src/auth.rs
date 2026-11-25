use serde::Serialize;
use serde_json::{Map, Value};

use crate::api;
use crate::error::{AppError, Result};
use crate::session::{self, Session};

#[derive(Serialize, Clone)]
pub struct LoginInfo {
    pub host: String,
    pub user_id: i64,
    pub is_admin: bool,
    pub current_time: i64,
}

fn device_name() -> String {
    std::env::var("HOSTNAME")
        .ok()
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "chat-viewer".to_string())
}

/// DSM login (SYNO.API.Auth v6) followed by Chat login (SYNO.Chat.User v2).
pub async fn login(
    http: &reqwest::Client,
    host: &str,
    account: &str,
    password: &str,
    otp: Option<&str>,
    remember_device: bool,
) -> Result<(Session, LoginInfo)> {
    let host = host.trim_end_matches('/').to_string();
    let dev_name = device_name();
    let device_id = session::load_device_id(&host);

    let mut params: Vec<(&str, &str)> = vec![
        ("account", account),
        ("passwd", password),
        ("format", "sid"),
        ("session", "chat"),
        ("enable_syno_token", "yes"),
    ];
    if let Some(code) = otp.filter(|c| !c.is_empty()) {
        params.push(("otp_code", code));
        if remember_device {
            params.push(("enable_device_token", "yes"));
        }
    }
    if let Some(did) = device_id.as_deref() {
        params.push(("device_id", did));
    }
    if remember_device || device_id.is_some() {
        params.push(("device_name", &dev_name));
    }

    let data = match api::call_public(http, &host, "SYNO.API.Auth", "login", 6, &params).await {
        Ok(d) => d,
        // 403: OTP required, 404: OTP wrong, 406: OTP enforced
        Err(AppError::Api { code, .. }) if code == 403 || code == 404 || code == 406 => {
            return Err(AppError::OtpRequired)
        }
        Err(AppError::Api { code, .. }) => return Err(AppError::LoginFailed(code)),
        Err(e) => return Err(e),
    };

    let sid = data.get("sid").and_then(Value::as_str).unwrap_or_default().to_string();
    let synotoken = data.get("synotoken").and_then(Value::as_str).unwrap_or_default().to_string();
    if sid.is_empty() {
        return Err(AppError::Other("login response missing sid".into()));
    }
    if let Some(did) = data.get("did").and_then(Value::as_str) {
        let _ = session::save_device_id(&host, did);
    }

    let mut sess = Session { host: host.clone(), sid, synotoken, user_id: 0, conn_id: None };
    let info = chat_login(http, &mut sess).await?;
    session::save_session(&sess)?;
    Ok((sess, info))
}

/// SYNO.Chat.User login v2: validates the DSM session for Chat and returns our user id.
pub async fn chat_login(http: &reqwest::Client, sess: &mut Session) -> Result<LoginInfo> {
    let data = api::call(http, sess, "SYNO.Chat.User", "login", 2, &Map::new()).await?;
    let user_id = data.pointer("/user/user_id").and_then(Value::as_i64).unwrap_or(0);
    sess.user_id = user_id;
    Ok(LoginInfo {
        host: sess.host.clone(),
        user_id,
        is_admin: data.pointer("/user/is_admin").and_then(Value::as_bool).unwrap_or(false),
        current_time: data.get("current_time").and_then(Value::as_i64).unwrap_or(0),
    })
}

pub async fn logout(http: &reqwest::Client, sess: &Session) {
    let _ = api::call(http, sess, "SYNO.API.Auth", "logout", 6, &Map::new()).await;
    session::clear_session();
}
