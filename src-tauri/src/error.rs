use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("not logged in")]
    NotLoggedIn,
    #[error("otp required")]
    OtpRequired,
    #[error("login failed (code {0})")]
    LoginFailed(i64),
    #[error("api error {api}.{method} code {code}")]
    Api { api: String, method: String, code: i64 },
    #[error("http error: {0}")]
    Http(String),
    #[error("{0}")]
    Other(String),
}

impl From<reqwest::Error> for AppError {
    fn from(e: reqwest::Error) -> Self {
        // Drop the URL (it carries _sid / SynoToken) and spell out the cause chain: reqwest's own Display is
        // only "error sending request for url (…)" while the useful part (dns error, connection reset,
        // timed out, certificate …) is in `source()`.
        let kind = if e.is_timeout() { "timed out" } else if e.is_connect() { "connect failed" } else if e.is_request() { "request failed" } else if e.is_body() || e.is_decode() { "bad response" } else { "request error" };
        let e = e.without_url();
        let mut causes = Vec::new();
        let mut src = std::error::Error::source(&e);
        while let Some(s) = src {
            let text = s.to_string();
            if !causes.contains(&text) { causes.push(text); }
            src = s.source();
        }
        let detail = if causes.is_empty() { e.to_string() } else { causes.join(": ") };
        AppError::Http(format!("{kind}: {detail}"))
    }
}

impl From<serde_json::Error> for AppError {
    fn from(e: serde_json::Error) -> Self {
        AppError::Other(e.to_string())
    }
}

/// Serialized shape sent to the frontend so it can branch on `kind`/`code`.
#[derive(Serialize)]
struct ErrorPayload {
    kind: &'static str,
    code: Option<i64>,
    message: String,
}

impl Serialize for AppError {
    fn serialize<S: serde::Serializer>(&self, s: S) -> std::result::Result<S::Ok, S::Error> {
        let (kind, code) = match self {
            AppError::NotLoggedIn => ("not_logged_in", None),
            AppError::OtpRequired => ("otp_required", None),
            AppError::LoginFailed(c) => ("login_failed", Some(*c)),
            AppError::Api { code, .. } => ("api", Some(*code)),
            AppError::Http(_) => ("http", None),
            AppError::Other(_) => ("other", None),
        };
        ErrorPayload { kind, code, message: self.to_string() }.serialize(s)
    }
}

pub type Result<T> = std::result::Result<T, AppError>;
