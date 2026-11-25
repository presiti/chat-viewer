//! Local full-text index of chat posts (SQLite FTS5, trigram tokenizer) so searches can match
//! substrings — the server's search only matches whole tokens, which fails on Korean particles.

use std::path::PathBuf;
use std::sync::Mutex;

use rusqlite::{params, params_from_iter, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::error::{AppError, Result};

pub struct Index {
    conn: Mutex<Option<Connection>>,
    dir: PathBuf,
}

#[derive(Serialize)]
pub struct Status {
    pub posts: i64,
    pub channels_done: i64,
    pub channels_total: i64,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct ChannelState {
    pub channel_id: i64,
    pub oldest_post_id: Option<i64>,
    pub newest_post_id: Option<i64>,
    pub complete: bool,
}

#[derive(Deserialize)]
pub struct SearchQuery {
    pub query: String,
    #[serde(default)]
    pub channel_ids: Vec<i64>,
    pub from: Option<i64>,
    pub after: Option<i64>,
    pub before: Option<i64>,
    #[serde(default)]
    pub files_only: bool,
    /// "all" (default) | "message" (message text, vote choices, link titles) | "file" (file names only)
    #[serde(default)]
    pub scope: String,
    /// File kinds (see KIND_EXTS; "other" = extension not in any kind). Implies files_only.
    #[serde(default)]
    pub kinds: Vec<String>,
    /// Explicit extensions (lowercase, no dot). Implies files_only.
    #[serde(default)]
    pub exts: Vec<String>,
    #[serde(default)]
    pub offset: i64,
    #[serde(default = "default_limit")]
    pub limit: i64,
}
fn default_limit() -> i64 { 25 }

#[derive(Serialize)]
pub struct SearchResult {
    pub total: i64,
    pub items: Vec<Value>,
}

fn db_err(e: rusqlite::Error) -> AppError {
    AppError::Other(format!("index db: {e}"))
}

/// File kinds by extension. Kept in sync with `src/lib/fileKinds.ts`.
pub const KIND_EXTS: &[(&str, &[&str])] = &[
    ("image", &["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "heic", "heif", "tif", "tiff", "avif"]),
    ("video", &["mp4", "mov", "avi", "mkv", "webm", "m4v", "wmv", "mpg", "mpeg"]),
    ("audio", &["mp3", "wav", "m4a", "aac", "flac", "ogg", "opus", "wma"]),
    ("pdf", &["pdf"]),
    ("doc", &["doc", "docx", "hwp", "hwpx", "txt", "rtf", "md", "odt", "pages"]),
    ("sheet", &["xls", "xlsx", "xlsm", "csv", "tsv", "ods", "numbers"]),
    ("slide", &["ppt", "pptx", "key", "odp"]),
    ("archive", &["zip", "rar", "7z", "tar", "gz", "tgz", "bz2", "xz", "dmg", "iso"]),
    ("code", &["js", "ts", "tsx", "jsx", "py", "rs", "java", "kt", "c", "cpp", "h", "hpp", "cs", "go", "json", "yaml", "yml", "xml", "html", "css", "scss", "sh", "sql", "swift", "rb", "php", "ipynb", "toml", "ini", "log"]),
];

fn known_exts() -> Vec<&'static str> {
    KIND_EXTS.iter().flat_map(|(_, e)| e.iter().copied()).collect()
}

/// Lowercase extension of a file post ("" for non-files).
fn ext_of(p: &Value) -> String {
    let name = p.pointer("/file_props/name").and_then(Value::as_str).unwrap_or("");
    let from_name = name.rsplit_once('.').map(|(_, e)| e).filter(|e| !e.is_empty() && e.len() <= 10 && !e.contains(' '));
    let e = from_name.or_else(|| p.pointer("/file_props/type").and_then(Value::as_str)).unwrap_or("");
    e.trim_start_matches('.').to_ascii_lowercase()
}

/// Searchable text that is not in `message`: vote choices, link previews, snippet preview, hashtags.
fn extra_of(p: &Value) -> String {
    let mut parts: Vec<String> = Vec::new();
    if let Some(choices) = p.pointer("/props/vote/choices").and_then(Value::as_array) {
        for c in choices {
            if let Some(t) = c.get("text").and_then(Value::as_str) { if !t.is_empty() { parts.push(t.to_string()); } }
        }
    }
    if let Some(urls) = p.get("url_props").and_then(Value::as_array) {
        for u in urls {
            for k in ["title", "description", "url"] {
                if let Some(t) = u.get(k).and_then(Value::as_str) { if !t.is_empty() { parts.push(t.to_string()); } }
            }
        }
    }
    if let Some(t) = p.pointer("/file_props/snippet_preview").and_then(Value::as_str) { if !t.is_empty() { parts.push(t.to_string()); } }
    if let Some(tags) = p.get("hashtags").and_then(Value::as_array) {
        for t in tags {
            let name = t.as_str().map(str::to_string).or_else(|| t.get("name").and_then(Value::as_str).map(str::to_string));
            if let Some(n) = name { parts.push(format!("#{n}")); }
        }
    }
    parts.join("\n")
}

impl Index {
    pub fn new(dir: PathBuf) -> Self {
        Self { conn: Mutex::new(None), dir }
    }

    /// Opens (or creates) the per-host database on first use.
    fn with<T>(&self, host: &str, f: impl FnOnce(&Connection) -> Result<T>) -> Result<T> {
        let mut guard = self.conn.lock().map_err(|_| AppError::Other("index lock".into()))?;
        if guard.is_none() {
            let safe: String = host.chars().map(|c| if c.is_ascii_alphanumeric() { c } else { '_' }).collect();
            let _ = std::fs::create_dir_all(&self.dir);
            let path = self.dir.join(format!("index_{safe}.sqlite"));
            let conn = Connection::open(path).map_err(db_err)?;
            conn.execute_batch(
                "PRAGMA journal_mode=WAL;
                 PRAGMA synchronous=NORMAL;
                 CREATE TABLE IF NOT EXISTS posts (
                   post_id INTEGER PRIMARY KEY,
                   channel_id INTEGER NOT NULL,
                   creator_id INTEGER NOT NULL,
                   create_at INTEGER NOT NULL,
                   type TEXT NOT NULL,
                   message TEXT NOT NULL,
                   file_name TEXT NOT NULL DEFAULT '',
                   extra TEXT NOT NULL DEFAULT '',
                   ext TEXT NOT NULL DEFAULT '',
                   json TEXT NOT NULL
                 );
                 CREATE INDEX IF NOT EXISTS posts_channel_time ON posts(channel_id, create_at);
                 CREATE INDEX IF NOT EXISTS posts_time ON posts(create_at);
                 CREATE TABLE IF NOT EXISTS channel_state (
                   channel_id INTEGER PRIMARY KEY,
                   oldest_post_id INTEGER,
                   newest_post_id INTEGER,
                   complete INTEGER NOT NULL DEFAULT 0
                 );",
            )
            .map_err(db_err)?;
            // Schema v2 adds extra/ext columns and a 3-column FTS table. Older databases are migrated in place;
            // the FTS table is rebuilt from the content table *without* triggers (the delete-trigger on rows
            // the new FTS table never saw would corrupt it).
            let version: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0)).map_err(db_err)?;
            if version < 2 {
                log::info!("index: migrating to v2 (extra/ext columns)");
                let has_extra: bool = conn
                    .prepare("PRAGMA table_info(posts)")
                    .map_err(db_err)?
                    .query_map([], |r| r.get::<_, String>(1))
                    .map_err(db_err)?
                    .filter_map(|r| r.ok())
                    .any(|c| c == "extra");
                if !has_extra {
                    conn.execute_batch(
                        "ALTER TABLE posts ADD COLUMN extra TEXT NOT NULL DEFAULT '';
                         ALTER TABLE posts ADD COLUMN ext TEXT NOT NULL DEFAULT '';",
                    )
                    .map_err(db_err)?;
                }
                conn.execute_batch(
                    "DROP TRIGGER IF EXISTS posts_ai; DROP TRIGGER IF EXISTS posts_ad; DROP TRIGGER IF EXISTS posts_au;
                     DROP TABLE IF EXISTS posts_fts;
                     CREATE VIRTUAL TABLE posts_fts USING fts5(
                       message, file_name, extra, content='posts', content_rowid='post_id', tokenize='trigram'
                     );",
                )
                .map_err(db_err)?;
                let migrate = || -> Result<()> {
                    let tx = conn.unchecked_transaction().map_err(db_err)?;
                    {
                        let mut sel = tx.prepare("SELECT post_id, json FROM posts").map_err(db_err)?;
                        let rows: Vec<(i64, String)> = sel
                            .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
                            .map_err(db_err)?
                            .filter_map(|r| r.ok())
                            .collect();
                        let mut upd = tx.prepare("UPDATE posts SET extra = ?1, ext = ?2 WHERE post_id = ?3").map_err(db_err)?;
                        for (id, json) in rows {
                            if let Ok(v) = serde_json::from_str::<Value>(&json) {
                                upd.execute(params![extra_of(&v), ext_of(&v), id]).map_err(db_err)?;
                            }
                        }
                    }
                    tx.commit().map_err(db_err)?;
                    conn.execute_batch("INSERT INTO posts_fts(posts_fts) VALUES ('rebuild'); PRAGMA user_version = 2;").map_err(db_err)?;
                    Ok(())
                };
                migrate().map_err(|e| { log::error!("index: migration failed: {e}"); e })?;
                log::info!("index: migration done");
            }
            conn.execute_batch(
                "CREATE VIRTUAL TABLE IF NOT EXISTS posts_fts USING fts5(
                   message, file_name, extra, content='posts', content_rowid='post_id', tokenize='trigram'
                 );
                 CREATE TRIGGER IF NOT EXISTS posts_ai AFTER INSERT ON posts BEGIN
                   INSERT INTO posts_fts(rowid, message, file_name, extra) VALUES (new.post_id, new.message, new.file_name, new.extra);
                 END;
                 CREATE TRIGGER IF NOT EXISTS posts_ad AFTER DELETE ON posts BEGIN
                   INSERT INTO posts_fts(posts_fts, rowid, message, file_name, extra) VALUES ('delete', old.post_id, old.message, old.file_name, old.extra);
                 END;
                 CREATE TRIGGER IF NOT EXISTS posts_au AFTER UPDATE ON posts BEGIN
                   INSERT INTO posts_fts(posts_fts, rowid, message, file_name, extra) VALUES ('delete', old.post_id, old.message, old.file_name, old.extra);
                   INSERT INTO posts_fts(rowid, message, file_name, extra) VALUES (new.post_id, new.message, new.file_name, new.extra);
                 END;",
            )
            .map_err(db_err)?;
            *guard = Some(conn);
        }
        f(guard.as_ref().expect("conn"))
    }

    pub fn upsert(&self, host: &str, posts: &[Value]) -> Result<usize> {
        self.with(host, |conn| {
            let tx = conn.unchecked_transaction().map_err(db_err)?;
            let mut n = 0;
            {
                let mut stmt = tx
                    .prepare_cached(
                        "INSERT INTO posts (post_id, channel_id, creator_id, create_at, type, message, file_name, extra, ext, json)
                         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
                         ON CONFLICT(post_id) DO UPDATE SET message=excluded.message, file_name=excluded.file_name,
                           extra=excluded.extra, ext=excluded.ext, type=excluded.type, create_at=excluded.create_at, json=excluded.json",
                    )
                    .map_err(db_err)?;
                for p in posts {
                    let id = p.get("post_id").and_then(Value::as_i64);
                    let ch = p.get("channel_id").and_then(Value::as_i64);
                    let (Some(id), Some(ch)) = (id, ch) else { continue };
                    if id <= 0 { continue } // optimistic placeholders
                    let file_name = p.pointer("/file_props/name").and_then(Value::as_str).unwrap_or("");
                    stmt.execute(params![
                        id,
                        ch,
                        p.get("creator_id").and_then(Value::as_i64).unwrap_or(0),
                        p.get("create_at").and_then(Value::as_i64).unwrap_or(0),
                        p.get("type").and_then(Value::as_str).unwrap_or("normal"),
                        p.get("message").and_then(Value::as_str).unwrap_or(""),
                        file_name,
                        extra_of(p),
                        ext_of(p),
                        p.to_string(),
                    ])
                    .map_err(db_err)?;
                    n += 1;
                }
            }
            tx.commit().map_err(db_err)?;
            Ok(n)
        })
    }

    pub fn delete(&self, host: &str, post_id: i64) -> Result<()> {
        self.with(host, |conn| {
            conn.execute("DELETE FROM posts WHERE post_id = ?1", params![post_id]).map_err(db_err)?;
            Ok(())
        })
    }

    pub fn status(&self, host: &str, channels_total: i64) -> Result<Status> {
        self.with(host, |conn| {
            let posts: i64 = conn.query_row("SELECT COUNT(*) FROM posts", [], |r| r.get(0)).map_err(db_err)?;
            let channels_done: i64 = conn.query_row("SELECT COUNT(*) FROM channel_state WHERE complete = 1", [], |r| r.get(0)).map_err(db_err)?;
            Ok(Status { posts, channels_done, channels_total })
        })
    }

    pub fn channel_state(&self, host: &str, channel_id: i64) -> Result<ChannelState> {
        self.with(host, |conn| {
            let row = conn
                .query_row(
                    "SELECT oldest_post_id, newest_post_id, complete FROM channel_state WHERE channel_id = ?1",
                    params![channel_id],
                    |r| Ok(ChannelState { channel_id, oldest_post_id: r.get(0)?, newest_post_id: r.get(1)?, complete: r.get::<_, i64>(2)? != 0 }),
                )
                .optional()
                .map_err(db_err)?;
            Ok(row.unwrap_or(ChannelState { channel_id, oldest_post_id: None, newest_post_id: None, complete: false }))
        })
    }

    pub fn set_channel_state(&self, host: &str, s: &ChannelState) -> Result<()> {
        self.with(host, |conn| {
            conn.execute(
                "INSERT INTO channel_state (channel_id, oldest_post_id, newest_post_id, complete) VALUES (?1, ?2, ?3, ?4)
                 ON CONFLICT(channel_id) DO UPDATE SET oldest_post_id=excluded.oldest_post_id, newest_post_id=excluded.newest_post_id, complete=excluded.complete",
                params![s.channel_id, s.oldest_post_id, s.newest_post_id, s.complete as i64],
            )
            .map_err(db_err)?;
            Ok(())
        })
    }

    pub fn search(&self, host: &str, q: &SearchQuery) -> Result<SearchResult> {
        self.with(host, |conn| {
            let terms: Vec<String> = q.query.split_whitespace().map(|t| t.to_string()).filter(|t| !t.is_empty()).collect();
            let mut wheres: Vec<String> = Vec::new();
            let mut args: Vec<rusqlite::types::Value> = Vec::new();

            // Trigram FTS needs >= 3 chars per term; shorter terms fall back to LIKE.
            let fts_terms: Vec<&String> = terms.iter().filter(|t| t.chars().count() >= 3).collect();
            let like_terms: Vec<&String> = terms.iter().filter(|t| t.chars().count() < 3).collect();
            // Column sets per scope: FTS column filter and the LIKE fallback columns.
            let (fts_cols, like_cols): (&str, &[&str]) = match q.scope.as_str() {
                "message" => ("{message extra} : ", &["p.message", "p.extra"]),
                "file" => ("file_name : ", &["p.file_name"]),
                _ => ("", &["p.message", "p.file_name", "p.extra"]),
            };
            let mut join = String::new();
            if !fts_terms.is_empty() {
                join = "JOIN posts_fts f ON f.rowid = p.post_id".into();
                let m = fts_terms.iter().map(|t| format!("{fts_cols}\"{}\"", t.replace('"', "\"\""))).collect::<Vec<_>>().join(" AND ");
                wheres.push("posts_fts MATCH ?".into());
                args.push(m.into());
            }
            for t in like_terms {
                wheres.push(format!("({})", like_cols.iter().map(|c| format!("{c} LIKE ? ESCAPE '\\'")).collect::<Vec<_>>().join(" OR ")));
                let pat = format!("%{}%", t.replace('\\', "\\\\").replace('%', "\\%").replace('_', "\\_"));
                for _ in like_cols { args.push(pat.clone().into()); }
            }
            if !q.channel_ids.is_empty() {
                wheres.push(format!("p.channel_id IN ({})", vec!["?"; q.channel_ids.len()].join(",")));
                for c in &q.channel_ids { args.push((*c).into()); }
            }
            if let Some(f) = q.from { wheres.push("p.creator_id = ?".into()); args.push(f.into()); }
            if let Some(a) = q.after { wheres.push("p.create_at >= ?".into()); args.push(a.into()); }
            if let Some(b) = q.before { wheres.push("p.create_at <= ?".into()); args.push(b.into()); }
            if q.files_only || !q.kinds.is_empty() || !q.exts.is_empty() { wheres.push("p.type = 'file'".into()); }
            if !q.kinds.is_empty() || !q.exts.is_empty() {
                let mut exts: Vec<String> = q.exts.iter().map(|e| e.trim().trim_start_matches('.').to_ascii_lowercase()).filter(|e| !e.is_empty()).collect();
                let mut other = false;
                for k in &q.kinds {
                    if k == "other" { other = true; continue; }
                    if let Some((_, list)) = KIND_EXTS.iter().find(|(name, _)| name == k) { exts.extend(list.iter().map(|e| e.to_string())); }
                }
                let mut ors: Vec<String> = Vec::new();
                if !exts.is_empty() {
                    ors.push(format!("p.ext IN ({})", vec!["?"; exts.len()].join(",")));
                    for e in exts { args.push(e.into()); }
                }
                if other {
                    let known = known_exts();
                    ors.push(format!("p.ext NOT IN ({})", vec!["?"; known.len()].join(",")));
                    for e in known { args.push(e.to_string().into()); }
                }
                wheres.push(format!("({})", ors.join(" OR ")));
            }
            let where_sql = if wheres.is_empty() { String::new() } else { format!("WHERE {}", wheres.join(" AND ")) };

            let total: i64 = conn
                .query_row(&format!("SELECT COUNT(*) FROM posts p {join} {where_sql}"), params_from_iter(args.iter()), |r| r.get(0))
                .map_err(db_err)?;
            let mut stmt = conn
                .prepare(&format!("SELECT p.json FROM posts p {join} {where_sql} ORDER BY p.create_at DESC LIMIT ? OFFSET ?"))
                .map_err(db_err)?;
            let mut all = args.clone();
            all.push(q.limit.into());
            all.push(q.offset.into());
            let rows = stmt
                .query_map(params_from_iter(all.iter()), |r| r.get::<_, String>(0))
                .map_err(db_err)?
                .filter_map(|r| r.ok())
                .filter_map(|s| serde_json::from_str::<Value>(&s).ok())
                .collect();
            Ok(SearchResult { total, items: rows })
        })
    }
}
