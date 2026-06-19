use std::collections::{HashMap, HashSet};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager as _, State};

use crate::api::{ApiClient, Media, Message, Post, Story, User};
use crate::config::Config;
use crate::config::DownloadOptions;
use crate::downloader::{build_download_list, DownloadItem};
use crate::downloads::{Job, Manager};
use crate::library::{Collection, Library, MediaEntry};

pub struct AppState {
    pub config: Mutex<Config>,
    pub library: Library,
    pub downloads: Manager,
    pub plan: Mutex<Vec<PlanEntry>>,
    pub analyze_cancel: AtomicBool,
}

pub struct PlanEntry {
    pub item: DownloadItem,
    pub creator: String,
    pub exists: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Target {
    pub user_id: u64,
    pub username: String,
}

#[derive(Serialize, Clone)]
pub struct CreatorBreakdown {
    pub username: String,
    pub total: usize,
    pub new: usize,
    pub bytes: u64,
    pub new_bytes: u64,
}

#[derive(Serialize, Clone, Default)]
pub struct DownloadPlan {
    pub total_items: usize,
    pub new_items: usize,
    pub existing_items: usize,
    pub total_bytes: u64,
    pub new_bytes: u64,
    pub photos: usize,
    pub videos: usize,
    pub audios: usize,
    pub other: usize,
    pub creators: usize,
    pub free_bytes: u64,
    pub canceled: bool,
    pub breakdown: Vec<CreatorBreakdown>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct AnalyzeProgress {
    phase: String,
    creator: String,
    creator_index: usize,
    creator_total: usize,
    items_found: usize,
    sized: usize,
    size_total: usize,
    new_bytes: u64,
    total_bytes: u64,
}

// ─── Config ─────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_config(state: State<'_, AppState>) -> Config {
    state.config.lock().unwrap().clone()
}

#[tauri::command]
pub fn save_config(
    state: State<'_, AppState>,
    app: AppHandle,
    mut config: Config,
) -> Result<Config, String> {
    if config.credentials.auth_id.trim().is_empty() {
        if let Some(aid) = config.parse_cookies().get("auth_id") {
            config.credentials.auth_id = aid.clone();
        }
    }
    config.save().map_err(|e| e.to_string())?;
    let _ = app
        .asset_protocol_scope()
        .allow_directory(&config.download_dir, true);
    // Update bandwidth limit on the download manager
    state.downloads.set_bandwidth_limit(config.bandwidth_limit);
    *state.config.lock().unwrap() = config.clone();
    Ok(config)
}

// ─── Auth / API ─────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn authenticate(state: State<'_, AppState>) -> Result<User, String> {
    let creds = state.config.lock().unwrap().credentials.clone();
    let mut api = ApiClient::new(creds);
    api.fetch_rules().await.map_err(|e| e.to_string())?;
    api.get_me().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_subscriptions(state: State<'_, AppState>) -> Result<Vec<User>, String> {
    let creds = state.config.lock().unwrap().credentials.clone();
    let mut api = ApiClient::new(creds);
    api.fetch_rules().await.map_err(|e| e.to_string())?;
    api.get_all_subscriptions().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_posts(state: State<'_, AppState>, user_id: u64) -> Result<Vec<Post>, String> {
    let creds = state.config.lock().unwrap().credentials.clone();
    let mut api = ApiClient::new(creds);
    api.fetch_rules().await.map_err(|e| e.to_string())?;
    let mut all = api.get_all_posts(user_id).await.map_err(|e| e.to_string())?;
    if let Ok(archived) = api.get_all_archived_posts(user_id).await {
        all.extend(archived);
    }
    let mut enriched = Vec::with_capacity(all.len());
    for post in all {
        let needs_refetch = match &post.media {
            None => true,
            Some(m) if m.is_empty() => true,
            Some(m) => !m
                .iter()
                .any(|item| crate::api::ApiClient::best_media_url(item, "source").is_some()),
        };
        if needs_refetch {
            if let Some(pid) = post.id {
                if let Ok(full_post) = api.get_post(pid).await {
                    enriched.push(full_post);
                    continue;
                }
            }
        }
        enriched.push(post);
    }
    Ok(enriched)
}

#[tauri::command]
pub async fn get_stories(state: State<'_, AppState>, user_id: u64) -> Result<Vec<Story>, String> {
    let creds = state.config.lock().unwrap().credentials.clone();
    let mut api = ApiClient::new(creds);
    api.fetch_rules().await.map_err(|e| e.to_string())?;
    api.get_all_stories(user_id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_messages(state: State<'_, AppState>, user_id: u64) -> Result<Vec<Message>, String> {
    let creds = state.config.lock().unwrap().credentials.clone();
    let mut api = ApiClient::new(creds);
    api.fetch_rules().await.map_err(|e| e.to_string())?;
    api.get_all_messages(user_id).await.map_err(|e| e.to_string())
}

// ─── Download options filtering ─────────────────────────────────────────────

fn post_matches_opts(post: &Post, opts: &DownloadOptions) -> bool {
    if !opts.since_date.is_empty() {
        if let Some(ref posted) = post.posted_at {
            if posted.as_str() < opts.since_date.as_str() {
                return false;
            }
        }
    }
    let is_paid = post.price.map_or(false, |p| p > 0.0);
    if opts.paid_only && !is_paid {
        return false;
    }
    if opts.free_only && is_paid {
        return false;
    }
    true
}

fn item_matches_type(item: &DownloadItem, opts: &DownloadOptions) -> bool {
    if opts.photos_only && item.media_type != "photo" && item.media_type != "image" {
        return false;
    }
    if opts.videos_only && item.media_type != "video" {
        return false;
    }
    true
}

// ─── Item collection (shared by download + analyze) ─────────────────────────

async fn enrich_and_build(
    api: &ApiClient,
    posts: &[Post],
    dl_dir: &str,
    username: &str,
    vq: &str,
) -> Vec<DownloadItem> {
    let mut enriched = Vec::with_capacity(posts.len());
    for post in posts {
        let needs_refetch = match &post.media {
            None => true,
            Some(m) if m.is_empty() => true,
            Some(m) => !m
                .iter()
                .any(|item| crate::api::ApiClient::best_media_url(item, vq).is_some()),
        };
        if needs_refetch {
            if let Some(pid) = post.id {
                if let Ok(full_post) = api.get_post(pid).await {
                    enriched.push(full_post);
                    continue;
                }
            }
        }
        enriched.push(post.clone());
    }
    build_download_list(&enriched, dl_dir, username, "Posts", vq)
}

pub(crate) async fn collect_creator_items(
    api: &mut ApiClient,
    dl_dir: &str,
    vq: &str,
    user_id: u64,
    username: &str,
    opts: &DownloadOptions,
    last_seen_id: Option<i64>,
    on_count: &mut (dyn FnMut(usize) + Send),
) -> Vec<DownloadItem> {
    let mut all_items = vec![];

    // Posts (regular), page by page so progress can tick live.
    let mut offset = 0u32;
    let mut stop = false;
    loop {
        if stop {
            break;
        }
        let batch = match api.get_posts(user_id, 50, offset).await {
            Ok(b) => b,
            Err(_) => break,
        };
        let count = batch.len();
        if count == 0 {
            break;
        }

        // Filter by download options (paid/free/date) and last_seen_id
        let filtered: Vec<Post> = batch
            .into_iter()
            .filter(|p| {
                if !post_matches_opts(p, opts) {
                    return false;
                }
                if let Some(ls) = last_seen_id {
                    if let Some(pid) = p.id {
                        if pid as i64 <= ls {
                            return false;
                        }
                    }
                }
                true
            })
            .collect();

        // If we filtered out any posts due to last_seen_id, we've reached old content
        if last_seen_id.is_some() {
            // Check if the original batch had posts with id <= last_seen_id
            let had_old = filtered.is_empty() || filtered.len() < count;
            if had_old {
                stop = true;
            }
        }

        if !filtered.is_empty() {
            let items = enrich_and_build(api, &filtered, dl_dir, username, vq).await;
            let items: Vec<_> = items.into_iter().filter(|i| item_matches_type(i, opts)).collect();
            all_items.extend(items);
            on_count(all_items.len());
        }
        offset += count as u32;
        if count < 50 {
            break;
        }
    }

    // Archived posts, page by page.
    if !stop {
        let mut offset = 0u32;
        loop {
            let batch = match api.get_archived_posts(user_id, 50, offset).await {
                Ok(b) => b,
                Err(_) => break,
            };
            let count = batch.len();
            if count == 0 {
                break;
            }
            let filtered: Vec<Post> = batch.into_iter().filter(|p| post_matches_opts(p, opts)).collect();
            if !filtered.is_empty() {
                let items = enrich_and_build(api, &filtered, dl_dir, username, vq).await;
                let items: Vec<_> = items.into_iter().filter(|i| item_matches_type(i, opts)).collect();
                all_items.extend(items);
                on_count(all_items.len());
            }
            offset += count as u32;
            if count < 50 {
                break;
            }
        }
    }

    // Stories
    if !opts.skip_stories {
        if let Ok(stories) = api.get_all_stories(user_id).await {
            let items = build_download_list_from_stories(&stories, dl_dir, username, vq);
            let items: Vec<_> = items.into_iter().filter(|i| item_matches_type(i, opts)).collect();
            all_items.extend(items);
            on_count(all_items.len());
        }
    }

    // Messages
    if !opts.skip_messages {
        if let Ok(messages) = api.get_all_messages(user_id).await {
            let items = build_download_list_from_messages(&messages, dl_dir, username, vq);
            let items: Vec<_> = items.into_iter().filter(|i| item_matches_type(i, opts)).collect();
            all_items.extend(items);
            on_count(all_items.len());
        }
    }

    all_items
}

// ─── Downloads ──────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn download_creator(
    state: State<'_, AppState>,
    user_id: u64,
    username: String,
) -> Result<usize, String> {
    let (creds, dl_dir, vq, ua, max, opts) = {
        let c = state.config.lock().unwrap();
        (
            c.credentials.clone(),
            c.download_dir.clone(),
            c.video_quality.clone(),
            c.credentials.user_agent.clone(),
            c.max_concurrent,
            c.download_options(),
        )
    };
    let mut api = ApiClient::new(creds);
    api.fetch_rules().await.map_err(|e| e.to_string())?;
    let items = collect_creator_items(
        &mut api, &dl_dir, &vq, user_id, &username, &opts, None, &mut |_n: usize| {},
    )
    .await;
    let n = items.len();
    state.downloads.enqueue(items, username, ua, max);
    Ok(n)
}

#[tauri::command]
pub async fn download_all(state: State<'_, AppState>) -> Result<usize, String> {
    let (creds, dl_dir, vq, ua, max, opts) = {
        let c = state.config.lock().unwrap();
        (
            c.credentials.clone(),
            c.download_dir.clone(),
            c.video_quality.clone(),
            c.credentials.user_agent.clone(),
            c.max_concurrent,
            c.download_options(),
        )
    };
    let mut api = ApiClient::new(creds);
    api.fetch_rules().await.map_err(|e| e.to_string())?;
    let subs = api.get_all_subscriptions().await.map_err(|e| e.to_string())?;

    let mut total = 0usize;
    for s in subs {
        if let (Some(id), Some(uname)) = (s.id, s.username.clone()) {
            let items = collect_creator_items(
                &mut api, &dl_dir, &vq, id, &uname, &opts, None, &mut |_n: usize| {},
            )
            .await;
            let n = items.len();
            total += n;
            if n > 0 {
                state.downloads.enqueue(items, uname, ua.clone(), max);
            }
        }
    }
    Ok(total)
}

// ─── Analyze (plan) ─────────────────────────────────────────────────────────

async fn probe_size(client: &reqwest::Client, url: &str, ua: &str) -> u64 {
    if let Ok(resp) = client
        .get(url)
        .header("User-Agent", ua)
        .header("Referer", "https://onlyfans.com/")
        .header("Range", "bytes=0-0")
        .send()
        .await
    {
        if let Some(cr) = resp
            .headers()
            .get(reqwest::header::CONTENT_RANGE)
            .and_then(|v| v.to_str().ok())
        {
            if let Some(total) = cr.rsplit('/').next().and_then(|s| s.trim().parse::<u64>().ok()) {
                return total;
            }
        }
        if resp.status().as_u16() == 200 {
            if let Some(len) = resp.content_length() {
                return len;
            }
        }
    }
    0
}

#[tauri::command]
pub async fn analyze(
    app: AppHandle,
    state: State<'_, AppState>,
    targets: Vec<Target>,
) -> Result<DownloadPlan, String> {
    use futures::stream::{self, StreamExt};

    state.analyze_cancel.store(false, Ordering::Relaxed);

    let (creds, dl_dir, vq, ua, opts) = {
        let c = state.config.lock().unwrap();
        (
            c.credentials.clone(),
            c.download_dir.clone(),
            c.video_quality.clone(),
            c.credentials.user_agent.clone(),
            c.download_options(),
        )
    };

    let mut api = ApiClient::new(creds);
    api.fetch_rules().await.map_err(|e| e.to_string())?;
    let client = reqwest::Client::builder()
        .use_native_tls()
        .build()
        .map_err(|e| e.to_string())?;

    let creator_total = targets.len();
    let mut plan = DownloadPlan {
        creators: creator_total,
        ..Default::default()
    };

    // Phase 1 — fetch every item for every target.
    let mut collected: Vec<(DownloadItem, String)> = Vec::new();
    let mut per_creator: HashMap<String, (usize, usize, u64, u64)> = HashMap::new(); // (total, new, bytes, new_bytes)

    for (ci, t) in targets.iter().enumerate() {
        if state.analyze_cancel.load(Ordering::Relaxed) {
            plan.canceled = true;
            emit_progress(&app, "done", &t.username, ci, creator_total, collected.len(), 0, 0, 0, 0);
            return Ok(plan);
        }
        let base = collected.len();
        let uname = t.username.clone();
        let ci1 = ci + 1;
        emit_progress(&app, "fetching", &uname, ci1, creator_total, base, 0, 0, 0, 0);
        let items = {
            let app_ref = &app;
            let mut cb = |n: usize| {
                emit_progress(app_ref, "fetching", &uname, ci1, creator_total, base + n, 0, 0, 0, 0);
            };
            collect_creator_items(
                &mut api, &dl_dir, &vq, t.user_id, &t.username, &opts, None, &mut cb,
            )
            .await
        };
        for it in items {
            collected.push((it, t.username.clone()));
        }
    }

    // De-duplicate by destination and split new vs existing.
    let mut entries: Vec<PlanEntry> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();
    let mut to_size: Vec<(usize, String)> = Vec::new();
    for (it, creator) in collected.into_iter() {
        let dest_str = it.dest.to_string_lossy().to_string();
        if !seen.insert(dest_str) {
            continue;
        }
        let local = std::fs::metadata(&it.dest).ok().filter(|m| m.len() > 0);
        let exists = local.is_some();
        plan.total_items += 1;
        match it.media_type.as_str() {
            "photo" | "image" => plan.photos += 1,
            "video" => plan.videos += 1,
            "audio" | "voice" => plan.audios += 1,
            _ => plan.other += 1,
        }
        let (ct, cn, cb, _cnb) = per_creator.entry(creator.clone()).or_insert((0, 0, 0, 0));
        *ct += 1;
        if let Some(m) = local {
            plan.existing_items += 1;
            plan.total_bytes += m.len();
            *cb += m.len();
        } else {
            plan.new_items += 1;
            *cn += 1;
            to_size.push((entries.len(), it.url.clone()));
        }
        entries.push(PlanEntry { item: it, creator, exists });
    }

    // Phase 2 — size the new items (bounded concurrency).
    let size_total = to_size.len();
    let mut sized = 0usize;
    let mut new_bytes = 0u64;
    let mut last = Instant::now();
    let mut stream = stream::iter(to_size)
        .map(|(idx, url)| {
            let client = client.clone();
            let ua = ua.clone();
            async move { (idx, probe_size(&client, &url, &ua).await) }
        })
        .buffer_unordered(16);

    while let Some((idx, sz)) = stream.next().await {
        if state.analyze_cancel.load(Ordering::Relaxed) {
            plan.canceled = true;
            break;
        }
        if let Some(e) = entries.get_mut(idx) {
            e.item.size_hint = Some(sz);
            // Update per-creator new_bytes
            if let Some((_, _, _, cnb)) = per_creator.get_mut(&e.creator) {
                *cnb += sz;
            }
        }
        sized += 1;
        new_bytes += sz;
        if last.elapsed() >= Duration::from_millis(120) || sized == size_total {
            emit_progress(
                &app, "sizing", "", 0, creator_total, entries.len(), sized, size_total, new_bytes,
                plan.total_bytes + new_bytes,
            );
            last = Instant::now();
        }
    }
    drop(stream);

    plan.new_bytes = new_bytes;
    plan.total_bytes += new_bytes;
    plan.free_bytes = fs4::available_space(&dl_dir).unwrap_or(0);

    // Build per-creator breakdown
    plan.breakdown = per_creator
        .into_iter()
        .map(|(username, (total, new, bytes, new_bytes))| CreatorBreakdown {
            username,
            total,
            new,
            bytes,
            new_bytes,
        })
        .collect();

    *state.plan.lock().unwrap() = entries;
    emit_progress(
        &app, "done", "", creator_total, creator_total, plan.total_items, sized, size_total,
        plan.new_bytes, plan.total_bytes,
    );
    Ok(plan)
}

#[allow(clippy::too_many_arguments)]
fn emit_progress(
    app: &AppHandle,
    phase: &str,
    creator: &str,
    creator_index: usize,
    creator_total: usize,
    items_found: usize,
    sized: usize,
    size_total: usize,
    new_bytes: u64,
    total_bytes: u64,
) {
    let _ = app.emit(
        "analyze://progress",
        AnalyzeProgress {
            phase: phase.to_string(),
            creator: creator.to_string(),
            creator_index,
            creator_total,
            items_found,
            sized,
            size_total,
            new_bytes,
            total_bytes,
        },
    );
}

#[tauri::command]
pub fn analyze_cancel(state: State<'_, AppState>) {
    state.analyze_cancel.store(true, Ordering::Relaxed);
}

/// Enqueue from the last analyzed plan. `only_new` skips items already on disk.
/// `creators` optionally filters to specific creators (for selective download).
#[tauri::command]
pub fn start_plan(
    state: State<'_, AppState>,
    only_new: bool,
    creators: Option<Vec<String>>,
) -> Result<usize, String> {
    let (ua, max) = {
        let c = state.config.lock().unwrap();
        (c.credentials.user_agent.clone(), c.max_concurrent)
    };
    let entries = {
        let mut g = state.plan.lock().unwrap();
        std::mem::take(&mut *g)
    };
    let creator_set: Option<HashSet<String>> = creators.map(|v| v.into_iter().collect());
    let mut groups: HashMap<String, Vec<DownloadItem>> = HashMap::new();
    let mut count = 0usize;
    for e in entries {
        if only_new && e.exists {
            continue;
        }
        if let Some(ref cs) = creator_set {
            if !cs.contains(&e.creator) {
                continue;
            }
        }
        count += 1;
        groups.entry(e.creator).or_default().push(e.item);
    }
    for (creator, items) in groups {
        if !items.is_empty() {
            state.downloads.enqueue(items, creator, ua.clone(), max);
        }
    }
    Ok(count)
}

// ─── Download manager controls ──────────────────────────────────────────────

#[tauri::command]
pub fn dl_state(state: State<'_, AppState>) -> Vec<Job> {
    state.downloads.snapshot()
}
#[tauri::command]
pub fn dl_pause(state: State<'_, AppState>) {
    state.downloads.pause();
}
#[tauri::command]
pub fn dl_resume(state: State<'_, AppState>) {
    state.downloads.resume();
}
#[tauri::command]
pub fn dl_pause_job(state: State<'_, AppState>, id: u64) {
    state.downloads.pause_job(id);
}
#[tauri::command]
pub fn dl_resume_job(state: State<'_, AppState>, id: u64) {
    state.downloads.resume_job(id);
}
#[tauri::command]
pub fn dl_cancel(state: State<'_, AppState>, id: u64) {
    state.downloads.cancel_job(id);
}
#[tauri::command]
pub fn dl_retry(state: State<'_, AppState>, id: u64) {
    state.downloads.retry_job(id);
}
#[tauri::command]
pub fn dl_cancel_all(state: State<'_, AppState>) {
    state.downloads.cancel_all();
}
#[tauri::command]
pub fn dl_clear(state: State<'_, AppState>) {
    state.downloads.clear_finished();
}

// ─── Library ────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn scan_library(state: State<'_, AppState>) -> Result<Vec<MediaEntry>, String> {
    let dir = state.config.lock().unwrap().download_dir.clone();
    state.library.scan(&dir).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn toggle_favorite(state: State<'_, AppState>, path: String) -> Result<bool, String> {
    state.library.toggle_favorite(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn add_tag(state: State<'_, AppState>, path: String, tag: String) -> Result<(), String> {
    state.library.add_tag(&path, &tag).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn remove_tag(state: State<'_, AppState>, path: String, tag: String) -> Result<(), String> {
    state.library.remove_tag(&path, &tag).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn all_tags(state: State<'_, AppState>) -> Result<Vec<(String, i64)>, String> {
    state.library.all_tags().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn rate_media(state: State<'_, AppState>, path: String, rating: i32) -> Result<(), String> {
    state.library.set_rating(&path, rating).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_collections(state: State<'_, AppState>) -> Result<Vec<Collection>, String> {
    state.library.collections().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_collection(state: State<'_, AppState>, name: String) -> Result<i64, String> {
    state.library.create_collection(&name).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn add_to_collection(
    state: State<'_, AppState>,
    cid: i64,
    paths: Vec<String>,
) -> Result<(), String> {
    for p in &paths {
        state
            .library
            .add_to_collection(cid, p)
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn remove_from_collection(
    state: State<'_, AppState>,
    cid: i64,
    path: String,
) -> Result<(), String> {
    state
        .library
        .remove_from_collection(cid, &path)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_collection(state: State<'_, AppState>, cid: i64) -> Result<(), String> {
    state.library.delete_collection(cid).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_collection_items(state: State<'_, AppState>, cid: i64) -> Result<Vec<String>, String> {
    state.library.collection_items(cid).map_err(|e| e.to_string())
}

#[derive(Serialize, Clone)]
pub struct DeleteResult {
    pub deleted: usize,
    pub failed: usize,
    pub errors: Vec<String>,
}

#[tauri::command]
pub fn delete_media(
    state: State<'_, AppState>,
    paths: Vec<String>,
) -> Result<DeleteResult, String> {
    let mut deleted = 0usize;
    let mut failed = 0usize;
    let mut errors = Vec::new();

    for p in &paths {
        // Try the Recycle Bin first (trash crate). If that fails (e.g. the
        // drive doesn't support Recycle Bin), fall back to permanent deletion.
        match trash::delete(p) {
            Ok(()) => {
                let _ = state.library.forget(p);
                deleted += 1;
            }
            Err(_) => {
                // Fallback: permanent delete
                match std::fs::remove_file(p) {
                    Ok(()) => {
                        let _ = state.library.forget(p);
                        deleted += 1;
                    }
                    Err(e) => {
                        failed += 1;
                        errors.push(format!("{}: {}", file_name_from_path(p), e));
                    }
                }
            }
        }
    }

    Ok(DeleteResult {
        deleted,
        failed,
        errors,
    })
}

fn file_name_from_path(p: &str) -> String {
    p.split(|c| c == '\\' || c == '/')
        .next_back()
        .unwrap_or(p)
        .to_string()
}

#[tauri::command]
pub fn open_download_dir(state: State<'_, AppState>) -> Result<String, String> {
    Ok(state.config.lock().unwrap().download_dir.clone())
}

// ─── Download log ───────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_download_log(
    state: State<'_, AppState>,
    limit: Option<usize>,
) -> Result<Vec<crate::library::DownloadLogEntry>, String> {
    state
        .library
        .download_log(limit.unwrap_or(200))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn clear_download_log(state: State<'_, AppState>) -> Result<(), String> {
    state.library.clear_download_log().map_err(|e| e.to_string())
}

// ─── Auto-sync status ───────────────────────────────────────────────────────

#[tauri::command]
pub fn get_auto_sync_status(
    state: State<'_, AppState>,
) -> Result<Vec<crate::library::LastSyncInfo>, String> {
    state.library.all_last_seen().map_err(|e| e.to_string())
}

// ─── Thumbnails ─────────────────────────────────────────────────────────────

#[tauri::command]
pub fn thumb(path: String) -> Result<String, String> {
    use sha1::{Digest, Sha1};
    let dir = dirs::config_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("VANTA")
        .join("thumbs");
    std::fs::create_dir_all(&dir).ok();
    let mut hasher = Sha1::new();
    hasher.update(path.as_bytes());
    let out = dir.join(format!("{}.jpg", hex::encode(hasher.finalize())));
    if out.exists() {
        return Ok(out.to_string_lossy().to_string());
    }
    let img = image::open(&path).map_err(|e| e.to_string())?;
    let thumb = image::DynamicImage::ImageRgb8(img.thumbnail(480, 480).to_rgb8());
    thumb.save(&out).map_err(|e| e.to_string())?;
    Ok(out.to_string_lossy().to_string())
}

// ─── Duplicates ─────────────────────────────────────────────────────────────

#[derive(Serialize, Clone)]
pub struct DupGroup {
    pub hash: String,
    pub size: u64,
    pub paths: Vec<String>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct DedupeProgress {
    phase: String,
    done: usize,
    total: usize,
    groups: usize,
}

fn hash_file(p: &str) -> Option<String> {
    use sha1::{Digest, Sha1};
    use std::io::Read;
    let mut f = std::fs::File::open(p).ok()?;
    let mut hasher = Sha1::new();
    let mut buf = [0u8; 65536];
    loop {
        let n = f.read(&mut buf).ok()?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Some(hex::encode(hasher.finalize()))
}

#[tauri::command]
pub async fn find_duplicates(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Vec<DupGroup>, String> {
    let dir = state.config.lock().unwrap().download_dir.clone();
    let entries = state.library.scan(&dir).map_err(|e| e.to_string())?;

    let res = tokio::task::spawn_blocking(move || {
        let mut by_size: HashMap<u64, Vec<String>> = HashMap::new();
        for e in &entries {
            if e.bytes > 0 {
                by_size.entry(e.bytes).or_default().push(e.path.clone());
            }
        }
        let candidates: Vec<(u64, Vec<String>)> =
            by_size.into_iter().filter(|(_, v)| v.len() > 1).collect();
        let total: usize = candidates.iter().map(|(_, v)| v.len()).sum();
        let mut done = 0usize;
        let mut groups: Vec<DupGroup> = Vec::new();
        for (size, paths) in candidates {
            let mut by_hash: HashMap<String, Vec<String>> = HashMap::new();
            for p in paths {
                if let Some(h) = hash_file(&p) {
                    by_hash.entry(h).or_default().push(p);
                }
                done += 1;
                if done % 4 == 0 {
                    let _ = app.emit(
                        "dedupe://progress",
                        DedupeProgress { phase: "hashing".into(), done, total, groups: groups.len() },
                    );
                }
            }
            for (h, ps) in by_hash {
                if ps.len() > 1 {
                    groups.push(DupGroup { hash: h, size, paths: ps });
                }
            }
        }
        let _ = app.emit(
            "dedupe://progress",
            DedupeProgress { phase: "done".into(), done: total, total, groups: groups.len() },
        );
        groups
    })
    .await
    .map_err(|e| e.to_string())?;

    Ok(res)
}

// ─── Download list builders for Stories & Messages ──────────────────────────

fn build_download_list_from_stories(
    stories: &[Story],
    download_dir: &str,
    username: &str,
    video_quality: &str,
) -> Vec<DownloadItem> {
    let mut items = vec![];
    let base = std::path::PathBuf::from(download_dir)
        .join(username)
        .join("Stories");

    for story in stories {
        let story_id = story.id.unwrap_or(0);
        let posted_at = story.posted_at.as_deref().unwrap_or("unknown");
        let date_prefix = posted_at[..10.min(posted_at.len())].replace('-', "");

        if let Some(ref media_list) = story.media {
            for media in media_list {
                if let Some(item) =
                    build_media_item(media, &base, "Free", &date_prefix, story_id, video_quality)
                {
                    items.push(item);
                }
            }
        }
    }
    items
}

fn build_download_list_from_messages(
    messages: &[Message],
    download_dir: &str,
    username: &str,
    video_quality: &str,
) -> Vec<DownloadItem> {
    let mut items = vec![];
    let base = std::path::PathBuf::from(download_dir)
        .join(username)
        .join("Messages");

    for msg in messages {
        let msg_id = msg.id.unwrap_or(0);
        let created_at = msg.created_at.as_deref().unwrap_or("unknown");
        let date_prefix = created_at[..10.min(created_at.len())].replace('-', "");
        let is_paid = msg.price.map_or(false, |p| p > 0.0);
        let price_folder = if is_paid { "Paid" } else { "Free" };

        if let Some(ref media_list) = msg.media {
            for media in media_list {
                if let Some(item) =
                    build_media_item(media, &base, price_folder, &date_prefix, msg_id, video_quality)
                {
                    items.push(item);
                }
            }
        }
    }
    items
}

fn build_media_item(
    media: &Media,
    base: &std::path::Path,
    price_folder: &str,
    date_prefix: &str,
    parent_id: u64,
    video_quality: &str,
) -> Option<DownloadItem> {
    let media_id = media.id.unwrap_or(0);
    let media_type_str = media.media_type.as_deref().unwrap_or("unknown");

    if media.can_view == Some(false) {
        return None;
    }

    let url = crate::api::ApiClient::best_media_url(media, video_quality)?;

    let url_path = url.split('?').next().unwrap_or(&url);
    let ext = url_path
        .rsplit('/')
        .next()
        .and_then(|f| f.rsplit('.').next())
        .unwrap_or("bin");

    let filename = format!("{}_{}_{}.{}", date_prefix, parent_id, media_id, ext);

    let media_folder = match media_type_str {
        "photo" | "image" => "Images",
        "video" => "Videos",
        "audio" | "voice" => "Audios",
        "gif" => "GIFs",
        _ => "Other",
    };

    let dest = base.join(price_folder).join(media_folder).join(&filename);

    Some(DownloadItem {
        url,
        dest,
        media_type: media_type_str.to_string(),
        post_id: parent_id,
        media_id,
        filename,
        size_hint: None,
    })
}
