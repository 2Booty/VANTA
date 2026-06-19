use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};

use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use sha1::{Digest, Sha1};

use crate::config::Credentials;

const DYNAMIC_RULES_URL: &str =
    "https://raw.githubusercontent.com/DATAHOARDERS/dynamic-rules/main/onlyfans.json";
const BASE_API: &str = "https://onlyfans.com/api2/v2";

// ─── Dynamic Rules ──────────────────────────────────────────────────────────

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct DynamicRules {
    pub app_token: String,
    pub static_param: String,
    pub checksum_indexes: Vec<usize>,
    pub checksum_constant: i64,
    pub format: String,
    pub remove_headers: Vec<String>,
}

// ─── API Types ──────────────────────────────────────────────────────────────

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
pub struct User {
    pub id: Option<u64>,
    pub name: Option<String>,
    pub username: Option<String>,
    pub avatar: Option<String>,
    pub header: Option<String>,
    #[serde(rename = "subscribesCount")]
    pub subscribes_count: Option<u32>,
    #[serde(rename = "postsCount")]
    pub posts_count: Option<u32>,
    #[serde(rename = "photosCount")]
    pub photos_count: Option<u32>,
    #[serde(rename = "videosCount")]
    pub videos_count: Option<u32>,
    pub about: Option<String>,
    #[serde(rename = "isPerformer")]
    pub is_performer: Option<bool>,
}

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
pub struct Post {
    pub id: Option<u64>,
    #[serde(rename = "postedAt")]
    pub posted_at: Option<String>,
    pub text: Option<String>,
    #[serde(rename = "rawText")]
    pub raw_text: Option<String>,
    pub price: Option<f64>,
    #[serde(rename = "isArchived")]
    pub is_archived: Option<bool>,
    #[serde(rename = "canViewMedia")]
    pub can_view_media: Option<bool>,
    #[serde(rename = "isPinned")]
    pub is_pinned: Option<bool>,
    pub media: Option<Vec<Media>>,
    pub author: Option<User>,
}

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
pub struct Media {
    pub id: Option<u64>,
    #[serde(rename = "type")]
    pub media_type: Option<String>,
    pub source: Option<MediaSource>,
    pub preview: Option<String>,
    pub files: Option<MediaFiles>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub duration: Option<f64>,
    #[serde(rename = "canView")]
    pub can_view: Option<bool>,
    #[serde(rename = "hasError")]
    pub has_error: Option<bool>,
    #[serde(rename = "videoSources")]
    pub video_sources: Option<HashMap<String, Option<String>>>,
}

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
pub struct MediaSource {
    pub source: Option<String>,
}

/// The `files` object in the current OF API response
#[derive(Clone, Debug, Serialize, Deserialize, Default)]
pub struct MediaFiles {
    pub full: Option<MediaFileEntry>,
    pub thumb: Option<MediaFileEntry>,
    pub preview: Option<MediaFileEntry>,
    #[serde(rename = "squarePreview")]
    pub square_preview: Option<MediaFileEntry>,
}

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
pub struct MediaFileEntry {
    pub url: Option<String>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub size: Option<u64>,
    pub sources: Option<Vec<serde_json::Value>>,
}

/// A Story (current story or highlight item)
#[derive(Clone, Debug, Serialize, Deserialize, Default)]
pub struct Story {
    pub id: Option<u64>,
    #[serde(rename = "postedAt")]
    pub posted_at: Option<String>,
    pub text: Option<String>,
    pub media: Option<Vec<Media>>,
}

/// A Highlight group containing stories
#[derive(Clone, Debug, Serialize, Deserialize, Default)]
pub struct Highlight {
    pub id: Option<u64>,
    pub title: Option<String>,
    #[serde(rename = "cover")]
    pub cover: Option<Media>,
    pub stories: Option<Vec<Story>>,
}

/// A Message/DM
#[derive(Clone, Debug, Serialize, Deserialize, Default)]
#[allow(non_snake_case)]
pub struct Message {
    pub id: Option<u64>,
    #[serde(rename = "createdAt")]
    pub created_at: Option<String>,
    pub text: Option<String>,
    pub price: Option<f64>,
    #[serde(rename = "isFree")]
    pub is_free: Option<bool>,
    pub media: Option<Vec<Media>>,
    #[allow(non_snake_case)]
    pub fromUser: Option<User>,
}

// ─── API Client ─────────────────────────────────────────────────────────────

pub struct ApiClient {
    http: reqwest::Client,
    creds: Credentials,
    rules: Option<DynamicRules>,
    auth_id: String,
}

impl ApiClient {
    pub fn new(creds: Credentials) -> Self {
        let auth_id = creds.auth_id.clone();
        Self {
            http: reqwest::Client::builder()
                .use_native_tls()
                .timeout(std::time::Duration::from_secs(30))
                .build()
                .expect("Failed to build HTTP client"),
            creds,
            rules: None,
            auth_id,
        }
    }

    pub async fn fetch_rules(&mut self) -> Result<()> {
        let resp = self
            .http
            .get(DYNAMIC_RULES_URL)
            .header("User-Agent", &self.creds.user_agent)
            .send()
            .await
            .map_err(|e| anyhow!("Failed to fetch dynamic rules: {}", e))?;

        if !resp.status().is_success() {
            return Err(anyhow!("Dynamic rules HTTP error: {}", resp.status()));
        }

        self.rules = Some(
            resp.json::<DynamicRules>()
                .await
                .map_err(|e| anyhow!("Failed to parse dynamic rules: {}", e))?,
        );
        Ok(())
    }

    fn rules(&self) -> Result<&DynamicRules> {
        self.rules
            .as_ref()
            .ok_or_else(|| anyhow!("Dynamic rules not loaded"))
    }

    // ─── Signing (time in MILLISECONDS, user-id KEPT) ───────────────────────

    fn sign(&self, link: &str) -> Result<(String, String)> {
        let rules = self.rules()?;
        let parsed = ParsedUrl::parse(link);

        let t = SystemTime::now()
            .duration_since(UNIX_EPOCH)?
            .as_millis()
            .to_string();

        let msg = format!(
            "{}\n{}\n{}\n{}",
            rules.static_param, t, parsed.path, self.auth_id
        );
        let mut hasher = Sha1::new();
        hasher.update(msg.as_bytes());
        let sha1_hex = hex::encode(hasher.finalize());
        let sha1_bytes = sha1_hex.as_bytes();

        let checksum: i64 = rules
            .checksum_indexes
            .iter()
            .map(|&idx| sha1_bytes[idx] as i64)
            .sum::<i64>()
            + rules.checksum_constant;

        let sign = format_sign(&rules.format, &sha1_hex, checksum.unsigned_abs());
        Ok((sign, t))
    }

    fn build_headers(&self, link: &str) -> Result<reqwest::header::HeaderMap> {
        let (sign, time) = self.sign(link)?;
        let rules = self.rules()?;

        let mut h = reqwest::header::HeaderMap::new();
        h.insert("accept", "application/json, text/plain, */*".parse()?);
        h.insert("app-token", rules.app_token.parse()?);
        h.insert("referer", "https://onlyfans.com/".parse()?);
        h.insert("sign", sign.parse()?);
        h.insert("time", time.parse()?);
        h.insert("user-agent", self.creds.user_agent.parse()?);
        h.insert("user-id", self.auth_id.parse()?);
        h.insert("x-bc", self.creds.x_bc.parse()?);
        h.insert(
            "sec-ch-ua",
            r#""Chromium";v="148", "Google Chrome";v="148""#.parse()?,
        );
        h.insert("sec-ch-ua-mobile", "?0".parse()?);
        h.insert("sec-ch-ua-platform", r#""Windows""#.parse()?);
        h.insert("sec-fetch-dest", "empty".parse()?);
        h.insert("sec-fetch-mode", "cors".parse()?);
        h.insert("sec-fetch-site", "same-origin".parse()?);
        Ok(h)
    }

    // ─── Generic GET ────────────────────────────────────────────────────────

    pub async fn get_json(&self, url: &str) -> Result<serde_json::Value> {
        let headers = self.build_headers(url)?;
        let resp = self
            .http
            .get(url)
            .headers(headers)
            .header("cookie", &self.creds.cookie)
            .send()
            .await
            .map_err(|e| anyhow!("Request failed for {}: {}", url, e))?;

        let status = resp.status();
        let text = resp.text().await
            .map_err(|e| anyhow!("Failed reading response body from {}: {}", url, e))?;

        if text.trim().is_empty() {
            return Err(anyhow!("Empty response from {} (HTTP {})", url, status));
        }

        // Try to parse as JSON
        let body: serde_json::Value = serde_json::from_str(&text)
            .map_err(|e| anyhow!(
                "Invalid JSON from {} (HTTP {}): {} — first 200 chars: {}",
                url, status, e,
                &text[..200.min(text.len())]
            ))?;

        if !status.is_success() {
            if let Some(err) = body.get("error") {
                let code = err.get("code").and_then(|c| c.as_i64()).unwrap_or(0);
                let msg = err
                    .get("message")
                    .and_then(|m| m.as_str())
                    .unwrap_or("Unknown");
                return Err(anyhow!("API Error [{}]: {}", code, msg));
            }
            return Err(anyhow!("HTTP {} for {}", status, url));
        }

        Ok(body)
    }

    /// Helper: fetch JSON array from URL, return as Vec<T>
    async fn get_array<T: serde::de::DeserializeOwned>(&self, url: &str) -> Result<Vec<T>> {
        let val = self.get_json(url).await?;
        if let Some(arr) = val.as_array() {
            Ok(arr
                .iter()
                .filter_map(|v| serde_json::from_value(v.clone()).ok())
                .collect())
        } else {
            Ok(vec![])
        }
    }

    // ─── Auth ───────────────────────────────────────────────────────────────

    pub async fn get_me(&self) -> Result<User> {
        let url = format!("{}/users/me", BASE_API);
        let val = self.get_json(&url).await?;
        Ok(serde_json::from_value(val)?)
    }

    // ─── Subscriptions ──────────────────────────────────────────────────────

    pub async fn get_subscriptions(&self, limit: u32, offset: u32) -> Result<Vec<User>> {
        let url = format!(
            "{}/subscriptions/subscribes?limit={}&offset={}&type=active",
            BASE_API, limit, offset
        );
        self.get_array(&url).await
    }

    /// Fetch ALL active subscriptions (paginated)
    pub async fn get_all_subscriptions(&self) -> Result<Vec<User>> {
        let mut all = vec![];
        let mut offset = 0u32;
        loop {
            let batch = self.get_subscriptions(50, offset).await?;
            let count = batch.len();
            if count == 0 {
                break;
            }
            all.extend(batch);
            offset += count as u32;
            if count < 50 {
                break;
            }
        }
        Ok(all)
    }

    // ─── Posts ───────────────────────────────────────────────────────────────

    pub async fn get_posts(&self, user_id: u64, limit: u32, offset: u32) -> Result<Vec<Post>> {
        let url = format!(
            "{}/users/{}/posts?limit={}&offset={}&order=publish_date_desc&skip_users_dups=0",
            BASE_API, user_id, limit, offset
        );
        self.get_array(&url).await
    }

    /// Fetch ALL posts for a user (paginated)
    pub async fn get_all_posts(&self, user_id: u64) -> Result<Vec<Post>> {
        let mut all = vec![];
        let mut offset = 0u32;
        loop {
            let batch = self.get_posts(user_id, 50, offset).await?;
            let count = batch.len();
            if count == 0 {
                break;
            }
            all.extend(batch);
            offset += count as u32;
            if count < 50 {
                break;
            }
        }
        Ok(all)
    }

    /// Fetch a single post by ID (may have fuller media data than the list endpoint)
    pub async fn get_post(&self, post_id: u64) -> Result<Post> {
        let url = format!("{}/posts/{}", BASE_API, post_id);
        let val = self.get_json(&url).await?;
        Ok(serde_json::from_value(val)?)
    }

    pub async fn get_archived_posts(
        &self,
        user_id: u64,
        limit: u32,
        offset: u32,
    ) -> Result<Vec<Post>> {
        let url = format!(
            "{}/users/{}/posts/archived?limit={}&offset={}&order=publish_date_desc",
            BASE_API, user_id, limit, offset
        );
        self.get_array(&url).await
    }

    /// Fetch ALL archived posts for a user (paginated)
    pub async fn get_all_archived_posts(&self, user_id: u64) -> Result<Vec<Post>> {
        let mut all = vec![];
        let mut offset = 0u32;
        loop {
            let batch = self.get_archived_posts(user_id, 50, offset).await?;
            let count = batch.len();
            if count == 0 {
                break;
            }
            all.extend(batch);
            offset += count as u32;
            if count < 50 {
                break;
            }
        }
        Ok(all)
    }

    // ─── Stories ─────────────────────────────────────────────────────────────

    /// Current (active) stories for a user
    pub async fn get_stories(&self, user_id: u64) -> Result<Vec<Story>> {
        let url = format!(
            "{}/users/{}/stories?limit=100&offset=0&order=desc",
            BASE_API, user_id
        );
        self.get_array(&url).await
    }

    /// Archived stories (global — requires auth)
    pub async fn get_archived_stories(&self) -> Result<Vec<Story>> {
        let url = format!(
            "{}/stories/archive/?limit=100&offset=0&order=publish_date_desc",
            BASE_API
        );
        self.get_array(&url).await
    }

    /// List all highlights for a user
    pub async fn get_highlights(&self, user_id: u64) -> Result<Vec<Highlight>> {
        let url = format!(
            "{}/users/{}/stories/highlights?limit=100&offset=0&order=desc",
            BASE_API, user_id
        );
        self.get_array(&url).await
    }

    /// Fetch a single highlight with its stories populated
    pub async fn get_highlight(&self, highlight_id: u64) -> Result<Highlight> {
        let url = format!("{}/stories/highlights/{}", BASE_API, highlight_id);
        let val = self.get_json(&url).await?;
        Ok(serde_json::from_value(val)?)
    }

    /// Fetch ALL stories for a user: current + archived + highlights (all populated)
    pub async fn get_all_stories(&self, user_id: u64) -> Result<Vec<Story>> {
        let mut all = vec![];

        // Current stories
        if let Ok(stories) = self.get_stories(user_id).await {
            all.extend(stories);
        }

        // Archived stories
        if let Ok(stories) = self.get_archived_stories().await {
            all.extend(stories);
        }

        // Highlights — list all, then fetch each by ID
        if let Ok(highlights) = self.get_highlights(user_id).await {
            for h in highlights {
                if let Some(hid) = h.id {
                    if let Ok(detail) = self.get_highlight(hid).await {
                        if let Some(stories) = detail.stories {
                            all.extend(stories);
                        }
                    }
                }
            }
        }

        Ok(all)
    }

    // ─── Messages (DMs) ─────────────────────────────────────────────────────

    /// Fetch ALL messages for a user (paginated, stops when `hasMore` is false)
    pub async fn get_all_messages(&self, user_id: u64) -> Result<Vec<Message>> {
        let mut all = vec![];
        let mut offset = 0u32;
        loop {
            let url = format!(
                "{}/chats/{}/messages?limit=50&offset={}&order=desc",
                BASE_API, user_id, offset
            );
            let val = self.get_json(&url).await?;

            // API returns {list: [...], hasMore: bool} — extract the list
            let arr = if let Some(arr) = val.as_array() {
                // Bare array (legacy format)
                arr.clone()
            } else if let Some(list) = val.get("list").and_then(|l| l.as_array()) {
                // Object with "list" key (current format)
                list.clone()
            } else {
                vec![]
            };

            let messages: Vec<Message> = arr
                .iter()
                .filter_map(|v| serde_json::from_value(v.clone()).ok())
                .collect();

            // Check hasMore from the response object
            let has_more = val
                .get("hasMore")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);

            let count = messages.len();
            all.extend(messages);

            if !has_more || count == 0 {
                break;
            }
            offset += count as u32;
        }
        Ok(all)
    }

    // ─── Media URL Extraction ───────────────────────────────────────────────

    /// Get the best URL for a media item. Priority:
    /// 1. files.full.url (current API — full quality)
    /// 2. For videos: videoSources map (quality selection)
    /// 3. source.source (legacy API)
    /// 4. files.preview.url
    /// 5. preview (legacy)
    /// 6. files.thumb.url (last resort)
    pub fn best_media_url(media: &Media, video_quality: &str) -> Option<String> {
        // For videos, try quality-specific sources first
        if media.media_type.as_deref() == Some("video") {
            if let Some(ref sources) = media.video_sources {
                let quality_key = video_quality.replace('p', "");
                if let Some(Some(url)) = sources.get(&quality_key) {
                    if !url.is_empty() {
                        return Some(url.clone());
                    }
                }
                // Try "source" (original) quality
                if let Some(Some(url)) = sources.get("source") {
                    if !url.is_empty() {
                        return Some(url.clone());
                    }
                }
            }
        }

        // Try files.full.url (current API structure)
        if let Some(ref files) = media.files {
            if let Some(ref full) = files.full {
                if let Some(ref url) = full.url {
                    if !url.is_empty() {
                        return Some(url.clone());
                    }
                }
            }
            // Try files.preview.url
            if let Some(ref preview) = files.preview {
                if let Some(ref url) = preview.url {
                    if !url.is_empty() {
                        return Some(url.clone());
                    }
                }
            }
        }

        // Legacy: source.source
        if let Some(ref source) = media.source {
            if let Some(ref url) = source.source {
                if !url.is_empty() {
                    return Some(url.clone());
                }
            }
        }

        // Legacy: preview string
        if let Some(ref url) = media.preview {
            if !url.is_empty() {
                return Some(url.clone());
            }
        }

        // Last resort: thumb
        if let Some(ref files) = media.files {
            if let Some(ref thumb) = files.thumb {
                if let Some(ref url) = thumb.url {
                    if !url.is_empty() {
                        return Some(url.clone());
                    }
                }
            }
        }

        None
    }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

struct ParsedUrl {
    path: String,
}

impl ParsedUrl {
    fn parse(s: &str) -> Self {
        let rest = s
            .strip_prefix("https://")
            .or_else(|| s.strip_prefix("http://"))
            .unwrap_or(s);
        let path_start = rest.find('/').unwrap_or(rest.len());
        let path_and_query = &rest[path_start..];
        Self {
            path: path_and_query.to_string(),
        }
    }
}

fn format_sign(format: &str, hex: &str, checksum: u64) -> String {
    let mut result = String::with_capacity(format.len() + 64);
    let mut chars = format.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '{' {
            let mut inner = String::new();
            for cc in chars.by_ref() {
                if cc == '}' {
                    break;
                }
                inner.push(cc);
            }
            if inner.is_empty() {
                result.push_str(hex);
            } else if inner == ":x" {
                result.push_str(&format!("{:x}", checksum));
            } else {
                result.push('{');
                result.push_str(&inner);
                result.push('}');
            }
        } else {
            result.push(c);
        }
    }
    result
}
