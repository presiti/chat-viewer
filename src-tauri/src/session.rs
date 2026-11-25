use std::fs;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use serde::{Deserialize, Serialize};

use crate::error::{AppError, Result};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Session {
    /// Origin, e.g. `https://nas.example.com:5001`
    pub host: String,
    pub sid: String,
    pub synotoken: String,
    #[serde(default)]
    pub user_id: i64,
    #[serde(default)]
    pub conn_id: Option<String>,
}

impl Session {
    pub fn entry_url(&self) -> String {
        format!("{}/webapi/entry.cgi", self.host)
    }
}

/// Directory that holds `session.json` and device tokens (the app data dir, set at startup).
static DATA_DIR: OnceLock<PathBuf> = OnceLock::new();

/// Storage backend.
/// - Default (all builds): plain files in the app data dir with owner-only permissions. This never shows an OS
///   prompt; the macOS keychain asks for access after every update of an ad-hoc signed app.
/// - Opt-in: create an empty `use_keychain` file in the app data dir to use the OS credential store
///   (macOS Keychain, Windows Credential Manager, Linux Secret Service) via the `keyring` crate.
const SERVICE: &str = "co.duo.chat-viewer";

fn use_os_store() -> bool {
    path("use_keychain").map(|p| p.exists()).unwrap_or(false)
}

fn store_get(name: &str) -> Option<String> {
    if use_os_store() {
        keyring::Entry::new(SERVICE, name).ok()?.get_password().ok()
    } else {
        fs::read_to_string(path(name).ok()?).ok()
    }
}

fn store_set(name: &str, value: &str) -> Result<()> {
    if use_os_store() {
        keyring::Entry::new(SERVICE, name)
            .and_then(|e| e.set_password(value))
            .map_err(|e| AppError::Other(format!("credential store: {e}")))
    } else {
        write_private(&path(name)?, value)
    }
}

fn store_delete(name: &str) {
    if use_os_store() {
        if let Ok(e) = keyring::Entry::new(SERVICE, name) {
            let _ = e.delete_credential();
        }
    } else if let Ok(p) = path(name) {
        let _ = fs::remove_file(p);
    }
}

pub fn init(dir: PathBuf) {
    let _ = fs::create_dir_all(&dir);
    let _ = DATA_DIR.set(dir);
}

fn path(name: &str) -> Result<PathBuf> {
    let dir = DATA_DIR.get().ok_or_else(|| AppError::Other("data dir not initialised".into()))?;
    Ok(dir.join(name))
}

fn write_private(p: &Path, contents: &str) -> Result<()> {
    fs::write(p, contents).map_err(|e| AppError::Other(format!("write {}: {e}", p.display())))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(p, fs::Permissions::from_mode(0o600));
    }
    Ok(())
}

fn device_file(host: &str) -> String {
    let safe: String = host.chars().map(|c| if c.is_ascii_alphanumeric() { c } else { '_' }).collect();
    format!("device_{safe}.txt")
}

pub fn save_session(s: &Session) -> Result<()> {
    store_set("session.json", &serde_json::to_string(s)?)
}

pub fn load_session() -> Option<Session> {
    serde_json::from_str(&store_get("session.json")?).ok()
}

pub fn clear_session() {
    store_delete("session.json");
}

pub fn save_device_id(host: &str, did: &str) -> Result<()> {
    store_set(&device_file(host), did)
}

pub fn load_device_id(host: &str) -> Option<String> {
    store_get(&device_file(host)).map(|s| s.trim().to_string()).filter(|s| !s.is_empty())
}
