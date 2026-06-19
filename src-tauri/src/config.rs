use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use anyhow::Result;

fn default_theme() -> String { "graphite".into() }
fn default_accent() -> String { "#8C93C9".into() }
fn default_sort() -> String { "newest".into() }
fn default_group() -> String { "none".into() }
fn default_hotkey() -> String { "CmdOrCtrl+Shift+H".into() }
fn default_sync_hours() -> u32 { 12 }
fn default_true() -> bool { true }
fn default_density() -> String { "medium".into() }
fn default_stealth_title() -> String { "Files".into() }

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Config {
    pub credentials: Credentials,
    pub download_dir: String,
    pub video_quality: String,
    pub overwrite_files: bool,
    pub max_concurrent: usize,
    #[serde(default = "default_theme")]
    pub theme: String,
    #[serde(default = "default_accent")]
    pub accent: String,
    #[serde(default = "default_sort")]
    pub gallery_sort: String,
    #[serde(default = "default_group")]
    pub gallery_group: String,
    #[serde(default)]
    pub blur_thumbs: bool,
    #[serde(default)]
    pub pin_hash: String,
    #[serde(default)]
    pub lock_on_blur: bool,
    #[serde(default = "default_hotkey")]
    pub panic_hotkey: String,
    #[serde(default)]
    pub auto_sync_enabled: bool,
    #[serde(default = "default_sync_hours")]
    pub auto_sync_hours: u32,
    #[serde(default = "default_true")]
    pub auto_sync_new_only: bool,

    // ─── Download options ───
    #[serde(default)]
    pub skip_stories: bool,
    #[serde(default)]
    pub skip_messages: bool,
    #[serde(default)]
    pub photos_only: bool,
    #[serde(default)]
    pub videos_only: bool,
    #[serde(default)]
    pub paid_only: bool,
    #[serde(default)]
    pub free_only: bool,
    #[serde(default)]
    pub since_date: String,
    #[serde(default)]
    pub bandwidth_limit: u64, // bytes/sec, 0 = unlimited

    // ─── Privacy ───
    #[serde(default)]
    pub auto_lock_minutes: u32, // 0 = disabled
    #[serde(default)]
    pub duress_pin_hash: String,
    #[serde(default)]
    pub stealth_mode: bool,
    #[serde(default = "default_stealth_title")]
    pub stealth_title: String,
    #[serde(default)]
    pub clear_on_panic: bool,

    // ─── UI ───
    #[serde(default = "default_density")]
    pub grid_density: String,

    // ─── Platform ───
    #[serde(default)]
    pub close_to_tray: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Credentials {
    pub cookie: String,
    pub x_bc: String,
    pub user_agent: String,
    pub auth_id: String,
}

/// Derived from Config — controls what gets collected during download/analyze.
#[derive(Clone, Debug)]
pub struct DownloadOptions {
    pub skip_stories: bool,
    pub skip_messages: bool,
    pub photos_only: bool,
    pub videos_only: bool,
    pub paid_only: bool,
    pub free_only: bool,
    pub since_date: String,
}

impl Default for DownloadOptions {
    fn default() -> Self {
        Self {
            skip_stories: false,
            skip_messages: false,
            photos_only: false,
            videos_only: false,
            paid_only: false,
            free_only: false,
            since_date: String::new(),
        }
    }
}

impl Config {
    pub fn download_options(&self) -> DownloadOptions {
        DownloadOptions {
            skip_stories: self.skip_stories,
            skip_messages: self.skip_messages,
            photos_only: self.photos_only,
            videos_only: self.videos_only,
            paid_only: self.paid_only,
            free_only: self.free_only,
            since_date: self.since_date.clone(),
        }
    }
}

impl Default for Config {
    fn default() -> Self {
        Self {
            credentials: Credentials {
                cookie: String::new(),
                x_bc: String::new(),
                user_agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36".into(),
                auth_id: String::new(),
            },
            download_dir: dirs::download_dir()
                .unwrap_or_else(|| PathBuf::from("."))
                .join("VANTA")
                .to_string_lossy()
                .to_string(),
            video_quality: "source".into(),
            overwrite_files: false,
            max_concurrent: 3,
            theme: default_theme(),
            accent: default_accent(),
            gallery_sort: default_sort(),
            gallery_group: default_group(),
            blur_thumbs: false,
            pin_hash: String::new(),
            lock_on_blur: false,
            panic_hotkey: default_hotkey(),
            auto_sync_enabled: false,
            auto_sync_hours: default_sync_hours(),
            auto_sync_new_only: true,
            skip_stories: false,
            skip_messages: false,
            photos_only: false,
            videos_only: false,
            paid_only: false,
            free_only: false,
            since_date: String::new(),
            bandwidth_limit: 0,
            auto_lock_minutes: 0,
            duress_pin_hash: String::new(),
            stealth_mode: false,
            stealth_title: default_stealth_title(),
            clear_on_panic: false,
            grid_density: default_density(),
            close_to_tray: false,
        }
    }
}

impl Config {
    pub fn config_path() -> PathBuf {
        let dir = dirs::config_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("VANTA");
        std::fs::create_dir_all(&dir).ok();
        dir.join("config.json")
    }

    pub fn load() -> Self {
        let path = Self::config_path();
        if path.exists() {
            let data = std::fs::read_to_string(&path).unwrap_or_default();
            serde_json::from_str(&data).unwrap_or_default()
        } else {
            Self::default()
        }
    }

    pub fn save(&self) -> Result<()> {
        let path = Self::config_path();
        let data = serde_json::to_string_pretty(self)?;
        std::fs::write(path, data)?;
        Ok(())
    }

    pub fn parse_cookies(&self) -> std::collections::HashMap<String, String> {
        self.credentials.cookie
            .split(';')
            .filter_map(|p| {
                let p = p.trim();
                let (k, v) = p.split_once('=')?;
                Some((k.trim().to_string(), v.trim().to_string()))
            })
            .collect()
    }
}
