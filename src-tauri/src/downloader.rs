use std::path::PathBuf;

use crate::api::{ApiClient, Post};

// ─── Download Item ──────────────────────────────────────────────────────────

#[derive(Clone, Debug)]
pub struct DownloadItem {
    pub url: String,
    pub dest: PathBuf,
    pub media_type: String,
    pub post_id: u64,
    #[allow(dead_code)]
    pub media_id: u64,
    pub filename: String,
    pub size_hint: Option<u64>,
}

// ─── Build Download List from Posts ─────────────────────────────────────────
//
// Constructs the list of files to download for a set of posts. The folder
// structure mirrors what the gallery scanner expects:
//
//   download_dir / username / Posts / {Paid|Free} / {Images|Videos|Audios|GIFs|Other} / filename
//
// Filenames are formatted as `{YYYYMMDD}_{postId}_{mediaId}.{ext}` so the post
// date is sortable without parsing metadata.

pub fn build_download_list(
    posts: &[Post],
    download_dir: &str,
    username: &str,
    api_type: &str,
    video_quality: &str,
) -> Vec<DownloadItem> {
    let mut items = vec![];
    let base = PathBuf::from(download_dir).join(username).join(api_type);

    for post in posts {
        let post_id = post.id.unwrap_or(0);
        let posted_at = post.posted_at.as_deref().unwrap_or("unknown");
        let date_prefix = posted_at[..10.min(posted_at.len())].replace('-', "");

        let media_list = match &post.media {
            Some(m) => m,
            None => continue,
        };

        for media in media_list {
            let media_id = media.id.unwrap_or(0);
            let media_type_str = media.media_type.as_deref().unwrap_or("unknown");

            if media.can_view == Some(false) {
                continue;
            }

            let url = match ApiClient::best_media_url(media, video_quality) {
                Some(u) => u,
                None => continue,
            };

            let url_path = url.split('?').next().unwrap_or(&url);
            let ext = url_path
                .rsplit('/')
                .next()
                .and_then(|f| f.rsplit('.').next())
                .unwrap_or("bin");

            let filename = format!("{}_{}_{}.{}", date_prefix, post_id, media_id, ext);

            let media_folder = match media_type_str {
                "photo" | "image" => "Images",
                "video" => "Videos",
                "audio" | "voice" => "Audios",
                "gif" => "GIFs",
                _ => "Other",
            };

            let is_paid = post.price.map_or(false, |p| p > 0.0);
            let price_folder = if is_paid { "Paid" } else { "Free" };

            let dest = base.join(price_folder).join(media_folder).join(&filename);

            items.push(DownloadItem {
                url,
                dest,
                media_type: media_type_str.to_string(),
                post_id,
                media_id,
                filename,
                size_hint: None,
            });
        }
    }

    items
}
