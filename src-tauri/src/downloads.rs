use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use rusqlite::Connection;
use serde::Serialize;
use tauri::{AppHandle, Emitter};

use crate::downloader::DownloadItem;

#[derive(Serialize, Clone, Copy, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum JobStatus {
    Queued,
    Active,
    Done,
    Skipped,
    Error,
    Canceled,
    Paused,
}

#[derive(Serialize, Clone)]
pub struct Job {
    pub id: u64,
    pub filename: String,
    pub creator: String,
    pub kind: String,
    pub url: String,
    pub dest: String,
    pub total: u64,
    pub done: u64,
    pub status: JobStatus,
    pub error: Option<String>,
    pub speed: f64,
    pub retry_count: u32,
    pub next_retry_at: Option<i64>, // unix millis; None = available now
}

#[derive(Serialize, Clone)]
struct ProgressPayload {
    id: u64,
    done: u64,
    total: u64,
    speed: f64,
}

#[derive(Clone)]
pub struct Manager {
    app: AppHandle,
    client: reqwest::Client,
    jobs: Arc<Mutex<Vec<Job>>>,
    cancels: Arc<Mutex<HashMap<u64, Arc<AtomicBool>>>>,
    paused: Arc<AtomicBool>,
    active: Arc<AtomicUsize>,
    max: Arc<AtomicUsize>,
    ua: Arc<Mutex<String>>,
    worker: Arc<AtomicBool>,
    seq: Arc<AtomicU64>,
    bandwidth_limit: Arc<AtomicU64>,
    db: Arc<Mutex<Option<Connection>>>,
}

impl Manager {
    pub fn new(app: AppHandle) -> Self {
        let db = Connection::open(crate::library::db_path()).ok();
        if let Some(ref conn) = db {
            let _ = conn.execute_batch("PRAGMA journal_mode=WAL;");
        }
        Self {
            app,
            client: reqwest::Client::builder()
                .use_native_tls()
                .build()
                .expect("download client"),
            jobs: Arc::new(Mutex::new(Vec::new())),
            cancels: Arc::new(Mutex::new(HashMap::new())),
            paused: Arc::new(AtomicBool::new(false)),
            active: Arc::new(AtomicUsize::new(0)),
            max: Arc::new(AtomicUsize::new(3)),
            ua: Arc::new(Mutex::new(String::new())),
            worker: Arc::new(AtomicBool::new(false)),
            seq: Arc::new(AtomicU64::new(1)),
            bandwidth_limit: Arc::new(AtomicU64::new(0)),
            db: Arc::new(Mutex::new(db)),
        }
    }

    pub fn set_bandwidth_limit(&self, limit: u64) {
        self.bandwidth_limit.store(limit, Ordering::Relaxed);
    }

    pub fn snapshot(&self) -> Vec<Job> {
        self.jobs.lock().unwrap().clone()
    }

    fn emit_state(&self) {
        let _ = self.app.emit("downloads://state", self.snapshot());
    }

    fn log(&self, filename: &str, creator: &str, status: &str, bytes: u64, error: Option<&str>) {
        if let Ok(conn) = self.db.lock() {
            if let Some(ref c) = *conn {
                let ts = chrono::Utc::now().timestamp();
                let _ = c.execute(
                    "INSERT INTO download_log(filename, creator, status, bytes, error, timestamp) VALUES(?1, ?2, ?3, ?4, ?5, ?6)",
                    rusqlite::params![filename, creator, status, bytes as i64, error, ts],
                );
            }
        }
    }

    pub fn enqueue(&self, items: Vec<DownloadItem>, creator: String, ua: String, max: usize) {
        *self.ua.lock().unwrap() = ua;
        self.max.store(max.max(1), Ordering::Relaxed);
        self.paused.store(false, Ordering::Relaxed);
        {
            let mut jobs = self.jobs.lock().unwrap();
            for it in items {
                let id = self.seq.fetch_add(1, Ordering::Relaxed);
                jobs.push(Job {
                    id,
                    filename: it.filename.clone(),
                    creator: creator.clone(),
                    kind: it.media_type.clone(),
                    url: it.url.clone(),
                    dest: it.dest.to_string_lossy().to_string(),
                    total: it.size_hint.unwrap_or(0),
                    done: 0,
                    status: JobStatus::Queued,
                    error: None,
                    speed: 0.0,
                    retry_count: 0,
                    next_retry_at: None,
                });
            }
        }
        self.emit_state();
        self.ensure_worker();
    }

    pub fn pause(&self) {
        self.paused.store(true, Ordering::Relaxed);
        self.emit_state();
    }

    pub fn resume(&self) {
        self.paused.store(false, Ordering::Relaxed);
        self.emit_state();
        self.ensure_worker();
    }

    pub fn pause_job(&self, id: u64) {
        let mut jobs = self.jobs.lock().unwrap();
        if let Some(j) = jobs.iter_mut().find(|j| j.id == id) {
            if j.status == JobStatus::Queued || j.status == JobStatus::Active {
                if j.status == JobStatus::Active {
                    if let Some(f) = self.cancels.lock().unwrap().get(&id) {
                        f.store(true, Ordering::Relaxed);
                    }
                    j.status = JobStatus::Paused;
                } else {
                    j.status = JobStatus::Paused;
                }
            }
        }
        drop(jobs);
        self.emit_state();
    }

    pub fn resume_job(&self, id: u64) {
        {
            let mut jobs = self.jobs.lock().unwrap();
            if let Some(j) = jobs.iter_mut().find(|j| j.id == id) {
                if j.status == JobStatus::Paused {
                    j.status = JobStatus::Queued;
                    j.done = 0;
                    j.next_retry_at = None;
                }
            }
        }
        self.cancels.lock().unwrap().remove(&id);
        self.emit_state();
        self.ensure_worker();
    }

    pub fn cancel_job(&self, id: u64) {
        if let Some(flag) = self.cancels.lock().unwrap().get(&id) {
            flag.store(true, Ordering::Relaxed);
        }
        let mut jobs = self.jobs.lock().unwrap();
        if let Some(j) = jobs.iter_mut().find(|j| j.id == id) {
            if j.status == JobStatus::Queued || j.status == JobStatus::Paused {
                j.status = JobStatus::Canceled;
            }
        }
        drop(jobs);
        self.emit_state();
    }

    pub fn retry_job(&self, id: u64) {
        {
            let mut jobs = self.jobs.lock().unwrap();
            if let Some(j) = jobs.iter_mut().find(|j| j.id == id) {
                if matches!(j.status, JobStatus::Error | JobStatus::Canceled) {
                    j.status = JobStatus::Queued;
                    j.done = 0;
                    j.error = None;
                    j.retry_count = j.retry_count.saturating_add(1);
                    // Exponential backoff: 2^retry seconds, capped at 32s
                    let backoff = 2u64.pow(j.retry_count.min(5));
                    j.next_retry_at =
                        Some(chrono::Utc::now().timestamp_millis() + (backoff * 1000) as i64);
                }
            }
        }
        self.cancels.lock().unwrap().remove(&id);
        self.emit_state();
        self.ensure_worker();
    }

    pub fn cancel_all(&self) {
        {
            let mut jobs = self.jobs.lock().unwrap();
            let mut cancels = self.cancels.lock().unwrap();
            for j in jobs.iter_mut() {
                if j.status == JobStatus::Queued || j.status == JobStatus::Paused {
                    j.status = JobStatus::Canceled;
                } else if j.status == JobStatus::Active {
                    if let Some(f) = cancels.get(&j.id) {
                        f.store(true, Ordering::Relaxed);
                    }
                }
            }
            cancels.clear();
        }
        self.emit_state();
    }

    pub fn clear_finished(&self) {
        let mut jobs = self.jobs.lock().unwrap();
        jobs.retain(|j| matches!(j.status, JobStatus::Queued | JobStatus::Active | JobStatus::Paused));
        drop(jobs);
        self.emit_state();
    }

    fn update<F: FnOnce(&mut Job)>(&self, id: u64, f: F) {
        let mut jobs = self.jobs.lock().unwrap();
        if let Some(j) = jobs.iter_mut().find(|j| j.id == id) {
            f(j);
        }
    }

    fn take_next(&self) -> Option<Job> {
        let now = chrono::Utc::now().timestamp_millis();
        let mut jobs = self.jobs.lock().unwrap();
        if let Some(j) = jobs.iter_mut().find(|j| {
            j.status == JobStatus::Queued
                && j.next_retry_at.map_or(true, |t| t <= now)
        }) {
            j.status = JobStatus::Active;
            j.next_retry_at = None;
            Some(j.clone())
        } else {
            None
        }
    }

    fn ensure_worker(&self) {
        if self.worker.swap(true, Ordering::SeqCst) {
            return;
        }
        let this = self.clone();
        tauri::async_runtime::spawn(async move {
            loop {
                if this.paused.load(Ordering::Relaxed) {
                    tokio::time::sleep(Duration::from_millis(200)).await;
                    continue;
                }
                if this.active.load(Ordering::Relaxed) >= this.max.load(Ordering::Relaxed) {
                    tokio::time::sleep(Duration::from_millis(120)).await;
                    continue;
                }
                match this.take_next() {
                    Some(job) => {
                        this.active.fetch_add(1, Ordering::Relaxed);
                        this.emit_state();
                        let worker = this.clone();
                        tauri::async_runtime::spawn(async move {
                            worker.run_job(job).await;
                            worker.active.fetch_sub(1, Ordering::Relaxed);
                            worker.emit_state();
                        });
                    }
                    None => {
                        if this.active.load(Ordering::Relaxed) == 0 {
                            // Check for jobs waiting on backoff
                            let has_pending = this
                                .jobs
                                .lock()
                                .unwrap()
                                .iter()
                                .any(|j| j.status == JobStatus::Queued && j.next_retry_at.is_some());
                            if !has_pending {
                                break;
                            }
                        }
                        tokio::time::sleep(Duration::from_millis(500)).await;
                    }
                }
            }
            this.worker.store(false, Ordering::SeqCst);
            this.emit_state();
        });
    }

    async fn run_job(&self, job: Job) {
        use futures::StreamExt;
        use tokio::io::AsyncWriteExt;

        let dest = PathBuf::from(&job.dest);
        let cancel = Arc::new(AtomicBool::new(false));
        self.cancels.lock().unwrap().insert(job.id, cancel.clone());

        // Skip if a non-empty file already exists.
        if let Ok(meta) = std::fs::metadata(&dest) {
            if meta.len() > 0 {
                self.update(job.id, |j| {
                    j.status = JobStatus::Skipped;
                    j.done = meta.len();
                    j.total = meta.len();
                });
                self.log(&job.filename, &job.creator, "skipped", meta.len(), None);
                return;
            }
        }

        if let Some(parent) = dest.parent() {
            let _ = std::fs::create_dir_all(parent);
        }

        let ua = self.ua.lock().unwrap().clone();
        let bw_limit = self.bandwidth_limit.load(Ordering::Relaxed);
        let max_concurrent = self.max.load(Ordering::Relaxed).max(1) as u64;
        let per_worker_limit = if bw_limit > 0 { bw_limit / max_concurrent } else { 0 };

        let result: Result<(), String> = async {
            let resp = self
                .client
                .get(&job.url)
                .header("User-Agent", &ua)
                .header("Referer", "https://onlyfans.com/")
                .send()
                .await
                .map_err(|e| e.to_string())?;
            let total = resp.content_length().unwrap_or(0);
            self.update(job.id, |j| j.total = total);
            let mut stream = resp.bytes_stream();
            let mut file = tokio::fs::File::create(&dest).await.map_err(|e| e.to_string())?;
            let mut done: u64 = 0;
            let mut last = Instant::now();
            let mut last_bytes: u64 = 0;
            while let Some(chunk) = stream.next().await {
                if cancel.load(Ordering::Relaxed) {
                    drop(file);
                    let _ = tokio::fs::remove_file(&dest).await;
                    return Err("__canceled__".into());
                }
                let chunk = chunk.map_err(|e| e.to_string())?;
                file.write_all(&chunk).await.map_err(|e| e.to_string())?;
                done += chunk.len() as u64;

                // Bandwidth limiting: sleep proportional to chunk size
                if per_worker_limit > 0 {
                    let sleep_secs = (chunk.len() as f64) / (per_worker_limit as f64);
                    if sleep_secs > 0.001 {
                        tokio::time::sleep(Duration::from_secs_f64(sleep_secs)).await;
                    }
                }

                if last.elapsed() >= Duration::from_millis(150) {
                    let secs = last.elapsed().as_secs_f64().max(0.001);
                    let speed = (done - last_bytes) as f64 / secs;
                    self.update(job.id, |j| {
                        j.done = done;
                        j.speed = speed;
                    });
                    let _ = self.app.emit(
                        "downloads://progress",
                        ProgressPayload { id: job.id, done, total, speed },
                    );
                    last = Instant::now();
                    last_bytes = done;
                }
            }
            file.flush().await.map_err(|e| e.to_string())?;
            self.update(job.id, |j| {
                j.done = done;
                j.speed = 0.0;
            });
            Ok(())
        }
        .await;

        self.cancels.lock().unwrap().remove(&job.id);
        match result {
            Ok(()) => {
                let bytes = std::fs::metadata(&dest).map(|m| m.len()).unwrap_or(0);
                self.update(job.id, |j| {
                    j.status = JobStatus::Done;
                    j.speed = 0.0;
                });
                self.log(&job.filename, &job.creator, "downloaded", bytes, None);
            }
            Err(e) if e == "__canceled__" => {
                self.update(job.id, |j| {
                    j.status = JobStatus::Canceled;
                    j.speed = 0.0;
                });
            }
            Err(e) => {
                self.update(job.id, |j| {
                    j.status = JobStatus::Error;
                    j.error = Some(e.clone());
                    j.speed = 0.0;
                });
                self.log(&job.filename, &job.creator, "error", 0, Some(&e));
            }
        }
    }
}
