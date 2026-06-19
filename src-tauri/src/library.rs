use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use anyhow::Result;
use rusqlite::Connection;
use serde::Serialize;

/// Local index that persists favorites / tags / collections / ratings and scans the
/// download directory for media. Keyed by absolute file path.
pub struct Library {
    conn: Mutex<Connection>,
}

#[derive(Serialize, Clone)]
pub struct MediaEntry {
    pub id: String,
    pub path: String,
    pub creator: String,
    pub kind: String, // photo | video | audio | other
    pub is_paid: bool,
    pub bytes: u64,
    pub modified: i64,
    pub favorite: bool,
    pub tags: Vec<String>,
    pub rating: i32,
}

#[derive(Serialize, Clone)]
pub struct Collection {
    pub id: i64,
    pub name: String,
    pub count: i64,
}

#[derive(Serialize, Clone)]
pub struct DownloadLogEntry {
    pub id: i64,
    pub filename: String,
    pub creator: String,
    pub status: String,
    pub bytes: u64,
    pub error: Option<String>,
    pub timestamp: i64,
}

#[derive(Serialize, Clone)]
pub struct LastSyncInfo {
    pub creator: String,
    pub last_post_id: i64,
    pub last_sync: i64,
}

pub fn db_path() -> PathBuf {
    let dir = dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("VANTA");
    std::fs::create_dir_all(&dir).ok();
    dir.join("library.db")
}

fn classify_kind(ext: &str) -> &'static str {
    match ext.to_lowercase().as_str() {
        "jpg" | "jpeg" | "png" | "webp" | "gif" | "bmp" | "heic" => "photo",
        "mp4" | "mov" | "avi" | "mkv" | "webm" | "m4v" => "video",
        "mp3" | "m4a" | "wav" | "aac" | "ogg" | "flac" => "audio",
        _ => "other",
    }
}

fn classify(path: &Path, root: &Path) -> Option<MediaEntry> {
    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
    let kind = classify_kind(ext);
    if kind == "other" {
        return None;
    }
    let rel = path.strip_prefix(root).ok()?;
    let comps: Vec<String> = rel
        .components()
        .map(|c| c.as_os_str().to_string_lossy().to_string())
        .collect();
    let creator = comps.first().cloned().unwrap_or_else(|| "unknown".into());
    let is_paid = comps.iter().any(|c| c.eq_ignore_ascii_case("Paid"));
    let meta = std::fs::metadata(path).ok();
    let bytes = meta.as_ref().map(|m| m.len()).unwrap_or(0);
    let modified = meta
        .and_then(|m| m.modified().ok())
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    let p = path.to_string_lossy().to_string();
    Some(MediaEntry {
        id: p.clone(),
        path: p,
        creator,
        kind: kind.to_string(),
        is_paid,
        bytes,
        modified,
        favorite: false,
        tags: vec![],
        rating: 0,
    })
}

impl Library {
    pub fn open() -> Result<Self> {
        let conn = Connection::open(db_path())?;
        conn.execute_batch(
            "PRAGMA journal_mode=WAL;
             CREATE TABLE IF NOT EXISTS favorites(path TEXT PRIMARY KEY);
             CREATE TABLE IF NOT EXISTS tags(path TEXT, tag TEXT, UNIQUE(path, tag));
             CREATE TABLE IF NOT EXISTS collections(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE);
             CREATE TABLE IF NOT EXISTS collection_items(cid INTEGER, path TEXT, UNIQUE(cid, path));
             CREATE TABLE IF NOT EXISTS ratings(path TEXT PRIMARY KEY, rating INTEGER);
             CREATE TABLE IF NOT EXISTS download_log(
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                filename TEXT, creator TEXT, status TEXT,
                bytes INTEGER, error TEXT, timestamp INTEGER
             );
             CREATE TABLE IF NOT EXISTS last_seen_posts(
                creator TEXT PRIMARY KEY,
                last_post_id INTEGER,
                last_sync INTEGER
             );
             CREATE INDEX IF NOT EXISTS idx_tags_tag ON tags(tag);
             CREATE INDEX IF NOT EXISTS idx_dl_creator ON download_log(creator);
             CREATE INDEX IF NOT EXISTS idx_dl_ts ON download_log(timestamp);",
        )?;
        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    pub fn scan(&self, root: &str) -> Result<Vec<MediaEntry>> {
        let root_path = PathBuf::from(root);
        let mut out: Vec<MediaEntry> = Vec::new();
        if !root_path.exists() {
            return Ok(out);
        }

        let mut stack = vec![root_path.clone()];
        while let Some(dir) = stack.pop() {
            if let Ok(rd) = std::fs::read_dir(&dir) {
                for e in rd.flatten() {
                    let p = e.path();
                    if p.is_dir() {
                        stack.push(p);
                    } else if let Some(entry) = classify(&p, &root_path) {
                        out.push(entry);
                    }
                }
            }
        }

        let conn = self.conn.lock().unwrap();
        let favs: HashSet<String> = {
            let mut stmt = conn.prepare("SELECT path FROM favorites")?;
            let rows = stmt.query_map([], |r| r.get::<_, String>(0))?;
            rows.flatten().collect()
        };
        let mut tag_map: HashMap<String, Vec<String>> = HashMap::new();
        {
            let mut stmt = conn.prepare("SELECT path, tag FROM tags")?;
            let rows = stmt.query_map([], |r| {
                Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
            })?;
            for row in rows.flatten() {
                tag_map.entry(row.0).or_default().push(row.1);
            }
        }
        let ratings: HashMap<String, i32> = {
            let mut stmt = conn.prepare("SELECT path, rating FROM ratings")?;
            let rows = stmt.query_map([], |r| {
                Ok((r.get::<_, String>(0)?, r.get::<_, i32>(1)?))
            })?;
            rows.flatten().collect()
        };

        for m in out.iter_mut() {
            m.favorite = favs.contains(&m.path);
            if let Some(t) = tag_map.get(&m.path) {
                m.tags = t.clone();
            }
            if let Some(&r) = ratings.get(&m.path) {
                m.rating = r;
            }
        }

        out.sort_by(|a, b| b.modified.cmp(&a.modified));
        Ok(out)
    }

    pub fn toggle_favorite(&self, path: &str) -> Result<bool> {
        let conn = self.conn.lock().unwrap();
        let exists: bool = conn
            .query_row("SELECT 1 FROM favorites WHERE path=?1", [path], |_| Ok(()))
            .is_ok();
        if exists {
            conn.execute("DELETE FROM favorites WHERE path=?1", [path])?;
            Ok(false)
        } else {
            conn.execute("INSERT OR IGNORE INTO favorites(path) VALUES(?1)", [path])?;
            Ok(true)
        }
    }

    pub fn add_tag(&self, path: &str, tag: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT OR IGNORE INTO tags(path, tag) VALUES(?1, ?2)",
            [path, tag],
        )?;
        Ok(())
    }

    pub fn remove_tag(&self, path: &str, tag: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM tags WHERE path=?1 AND tag=?2", [path, tag])?;
        Ok(())
    }

    pub fn all_tags(&self) -> Result<Vec<(String, i64)>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT tag, COUNT(*) as cnt FROM tags GROUP BY tag ORDER BY cnt DESC LIMIT 50")?;
        let rows = stmt.query_map([], |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?))
        })?;
        Ok(rows.flatten().collect())
    }

    pub fn set_rating(&self, path: &str, rating: i32) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        if rating <= 0 {
            conn.execute("DELETE FROM ratings WHERE path=?1", [path])?;
        } else {
            conn.execute(
                "INSERT OR REPLACE INTO ratings(path, rating) VALUES(?1, ?2)",
                rusqlite::params![path, rating],
            )?;
        }
        Ok(())
    }

    pub fn forget(&self, path: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM favorites WHERE path=?1", [path])?;
        conn.execute("DELETE FROM tags WHERE path=?1", [path])?;
        conn.execute("DELETE FROM collection_items WHERE path=?1", [path])?;
        conn.execute("DELETE FROM ratings WHERE path=?1", [path])?;
        Ok(())
    }

    pub fn collections(&self) -> Result<Vec<Collection>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT c.id, c.name, COUNT(ci.path)
             FROM collections c LEFT JOIN collection_items ci ON ci.cid = c.id
             GROUP BY c.id ORDER BY c.name",
        )?;
        let rows = stmt.query_map([], |r| {
            Ok(Collection {
                id: r.get(0)?,
                name: r.get(1)?,
                count: r.get(2)?,
            })
        })?;
        Ok(rows.flatten().collect())
    }

    pub fn create_collection(&self, name: &str) -> Result<i64> {
        let conn = self.conn.lock().unwrap();
        conn.execute("INSERT OR IGNORE INTO collections(name) VALUES(?1)", [name])?;
        let id: i64 = conn.query_row("SELECT id FROM collections WHERE name=?1", [name], |r| {
            r.get(0)
        })?;
        Ok(id)
    }

    pub fn delete_collection(&self, cid: i64) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM collection_items WHERE cid=?1", [cid])?;
        conn.execute("DELETE FROM collections WHERE id=?1", [cid])?;
        Ok(())
    }

    pub fn add_to_collection(&self, cid: i64, path: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT OR IGNORE INTO collection_items(cid, path) VALUES(?1, ?2)",
            rusqlite::params![cid, path],
        )?;
        Ok(())
    }

    pub fn remove_from_collection(&self, cid: i64, path: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "DELETE FROM collection_items WHERE cid=?1 AND path=?2",
            rusqlite::params![cid, path],
        )?;
        Ok(())
    }

    pub fn collection_items(&self, cid: i64) -> Result<Vec<String>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT path FROM collection_items WHERE cid=?1")?;
        let rows = stmt.query_map([cid], |r| r.get::<_, String>(0))?;
        Ok(rows.flatten().collect())
    }

    // ─── Download log ───

    pub fn download_log(&self, limit: usize) -> Result<Vec<DownloadLogEntry>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, filename, creator, status, bytes, error, timestamp FROM download_log ORDER BY timestamp DESC LIMIT ?1",
        )?;
        let rows = stmt.query_map([limit as i64], |r| {
            Ok(DownloadLogEntry {
                id: r.get(0)?,
                filename: r.get(1)?,
                creator: r.get(2)?,
                status: r.get(3)?,
                bytes: r.get::<_, i64>(4)? as u64,
                error: r.get(5)?,
                timestamp: r.get(6)?,
            })
        })?;
        Ok(rows.flatten().collect())
    }

    pub fn clear_download_log(&self) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM download_log", [])?;
        Ok(())
    }

    // ─── Last seen posts (incremental sync) ───

    pub fn set_last_seen(&self, creator: &str, last_post_id: i64) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let ts = chrono::Utc::now().timestamp();
        conn.execute(
            "INSERT OR REPLACE INTO last_seen_posts(creator, last_post_id, last_sync) VALUES(?1, ?2, ?3)",
            rusqlite::params![creator, last_post_id, ts],
        )?;
        Ok(())
    }

    pub fn get_last_seen(&self, creator: &str) -> Option<(i64, i64)> {
        let conn = self.conn.lock().unwrap();
        conn.query_row(
            "SELECT last_post_id, last_sync FROM last_seen_posts WHERE creator=?1",
            [creator],
            |r| Ok((r.get(0)?, r.get(1)?)),
        ).ok()
    }

    pub fn all_last_seen(&self) -> Result<Vec<LastSyncInfo>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT creator, last_post_id, last_sync FROM last_seen_posts")?;
        let rows = stmt.query_map([], |r| {
            Ok(LastSyncInfo {
                creator: r.get(0)?,
                last_post_id: r.get(1)?,
                last_sync: r.get(2)?,
            })
        })?;
        Ok(rows.flatten().collect())
    }
}
