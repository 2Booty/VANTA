mod api;
mod commands;
mod config;
mod downloader;
mod downloads;
mod library;

use std::sync::Mutex;

use tauri::Manager as _;
use tauri::menu::{Menu, MenuItem};

use commands::AppState;
use config::Config;
use downloads::Manager;
use library::Library;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .setup(|app| {
            let cfg = Config::load();
            let _ = app
                .asset_protocol_scope()
                .allow_directory(&cfg.download_dir, true);

            let library = Library::open().expect("failed to open library db");
            let manager = Manager::new(app.handle().clone());
            manager.set_bandwidth_limit(cfg.bandwidth_limit);

            // Apply stealth mode
            if cfg.stealth_mode {
                let main_win = app.get_webview_window("main").unwrap();
                let _ = main_win.set_title(&cfg.stealth_title);
            }

            app.manage(AppState {
                config: Mutex::new(cfg),
                library,
                downloads: manager,
                plan: Mutex::new(Vec::new()),
                analyze_cancel: std::sync::atomic::AtomicBool::new(false),
            });

            // ─── System tray ───
            let show_item = MenuItem::with_id(app, "show", "Show VANTA", true, None::<&str>)?;
            let hide_item = MenuItem::with_id(app, "hide", "Hide VANTA", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &hide_item, &quit_item])?;

            let _tray = tauri::tray::TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .tooltip("VANTA")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(win) = app.get_webview_window("main") {
                            let _ = win.show();
                            let _ = win.set_focus();
                        }
                    }
                    "hide" => {
                        if let Some(win) = app.get_webview_window("main") {
                            let _ = win.hide();
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let tauri::tray::TrayIconEvent::Click { button: tauri::tray::MouseButton::Left, button_state: tauri::tray::MouseButtonState::Up, .. } = event {
                        let app = tray.app_handle();
                        if let Some(win) = app.get_webview_window("main") {
                            if win.is_visible().unwrap_or(false) {
                                let _ = win.hide();
                            } else {
                                let _ = win.show();
                                let _ = win.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;

            // ─── Background auto-sync: periodically check for and download new media ───
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                use crate::api::ApiClient;
                use std::time::{Duration, Instant};
                use tauri_plugin_notification::NotificationExt;

                let mut last_run: Option<Instant> = None;
                loop {
                    tokio::time::sleep(Duration::from_secs(300)).await;

                    let (enabled, hours, new_only, creds, dl_dir, vq, ua, max, bw, opts) = {
                        let st = app_handle.state::<AppState>();
                        let c = st.config.lock().unwrap();
                        (
                            c.auto_sync_enabled,
                            c.auto_sync_hours.max(1) as u64,
                            c.auto_sync_new_only,
                            c.credentials.clone(),
                            c.download_dir.clone(),
                            c.video_quality.clone(),
                            c.credentials.user_agent.clone(),
                            c.max_concurrent,
                            c.bandwidth_limit,
                            c.download_options(),
                        )
                    };
                    if !enabled || creds.cookie.trim().is_empty() {
                        continue;
                    }
                    let due = last_run
                        .map(|t| t.elapsed() >= Duration::from_secs(hours * 3600))
                        .unwrap_or(true);
                    if !due {
                        continue;
                    }
                    last_run = Some(Instant::now());

                    let manager = app_handle.state::<AppState>().downloads.clone();
                    manager.set_bandwidth_limit(bw);
                    let library = &app_handle.state::<AppState>().library;
                    let mut api = ApiClient::new(creds);
                    if api.fetch_rules().await.is_err() {
                        continue;
                    }
                    let subs = api.get_all_subscriptions().await.unwrap_or_default();
                    let mut total_new = 0usize;
                    let mut creators_new = 0usize;
                    for s in subs {
                        if let (Some(id), Some(uname)) = (s.id, s.username.clone()) {
                            // Incremental sync: get last seen post ID
                            let last_seen = library.get_last_seen(&uname).map(|(pid, _)| pid);

                            let items = crate::commands::collect_creator_items(
                                &mut api,
                                &dl_dir,
                                &vq,
                                id,
                                &uname,
                                &opts,
                                last_seen,
                                &mut |_n: usize| {},
                            )
                            .await;

                            // Update last seen post ID
                            if let Some(max_pid) = items.iter().map(|i| i.post_id as i64).max() {
                                let _ = library.set_last_seen(&uname, max_pid);
                            }

                            let to_queue: Vec<_> = if new_only {
                                items
                                    .into_iter()
                                    .filter(|it| {
                                        std::fs::metadata(&it.dest)
                                            .map(|m| m.len() == 0)
                                            .unwrap_or(true)
                                    })
                                    .collect()
                            } else {
                                items
                            };
                            if !to_queue.is_empty() {
                                total_new += to_queue.len();
                                creators_new += 1;
                                manager.enqueue(to_queue, uname, ua.clone(), max);
                            }
                        }
                    }
                    if total_new > 0 {
                        let _ = app_handle
                            .notification()
                            .builder()
                            .title("VANTA auto-sync")
                            .body(format!(
                                "Queued {} new file{} from {} creator{}",
                                total_new,
                                if total_new == 1 { "" } else { "s" },
                                creators_new,
                                if creators_new == 1 { "" } else { "s" }
                            ))
                            .show();
                    }
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_config,
            commands::save_config,
            commands::authenticate,
            commands::get_subscriptions,
            commands::get_posts,
            commands::get_stories,
            commands::get_messages,
            commands::download_creator,
            commands::download_all,
            commands::analyze,
            commands::analyze_cancel,
            commands::start_plan,
            commands::dl_state,
            commands::dl_pause,
            commands::dl_resume,
            commands::dl_pause_job,
            commands::dl_resume_job,
            commands::dl_cancel,
            commands::dl_retry,
            commands::dl_cancel_all,
            commands::dl_clear,
            commands::scan_library,
            commands::thumb,
            commands::find_duplicates,
            commands::toggle_favorite,
            commands::add_tag,
            commands::remove_tag,
            commands::all_tags,
            commands::rate_media,
            commands::list_collections,
            commands::create_collection,
            commands::add_to_collection,
            commands::remove_from_collection,
            commands::delete_collection,
            commands::list_collection_items,
            commands::delete_media,
            commands::open_download_dir,
            commands::get_download_log,
            commands::clear_download_log,
            commands::get_auto_sync_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
