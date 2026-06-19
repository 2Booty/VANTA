import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { revealItemInDir, openPath } from "@tauri-apps/plugin-opener";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";

// ─── Types ───────────────────────────────────────────────────────────────

export interface Credentials {
  cookie: string;
  x_bc: string;
  user_agent: string;
  auth_id: string;
}

export interface Config {
  credentials: Credentials;
  download_dir: string;
  video_quality: string;
  overwrite_files: boolean;
  max_concurrent: number;
  theme: string;
  accent: string;
  gallery_sort: string;
  gallery_group: string;
  blur_thumbs: boolean;
  pin_hash: string;
  lock_on_blur: boolean;
  panic_hotkey: string;
  auto_sync_enabled: boolean;
  auto_sync_hours: number;
  auto_sync_new_only: boolean;
  // Download options
  skip_stories: boolean;
  skip_messages: boolean;
  photos_only: boolean;
  videos_only: boolean;
  paid_only: boolean;
  free_only: boolean;
  since_date: string;
  bandwidth_limit: number;
  // Privacy
  auto_lock_minutes: number;
  duress_pin_hash: string;
  stealth_mode: boolean;
  stealth_title: string;
  clear_on_panic: boolean;
  // UI
  grid_density: string;
  // Platform
  close_to_tray: boolean;
}

export interface User {
  id?: number;
  name?: string;
  username?: string;
  avatar?: string;
  header?: string;
  subscribesCount?: number;
  postsCount?: number;
  photosCount?: number;
  videosCount?: number;
  about?: string;
  isPerformer?: boolean;
}

export interface MediaSource { source?: string; }
export interface Media {
  id?: number;
  type?: string;
  source?: MediaSource;
  preview?: string;
  width?: number;
  height?: number;
  duration?: number;
  canView?: boolean;
}
export interface Post {
  id?: number;
  postedAt?: string;
  text?: string;
  rawText?: string;
  price?: number;
  isArchived?: boolean;
  canViewMedia?: boolean;
  isPinned?: boolean;
  media?: Media[];
}

export interface MediaEntry {
  id: string;
  path: string;
  creator: string;
  kind: "photo" | "video" | "audio" | "other";
  is_paid: boolean;
  bytes: number;
  modified: number;
  favorite: boolean;
  tags: string[];
  rating: number;
}

export type JobStatus = "queued" | "active" | "done" | "skipped" | "error" | "canceled" | "paused";
export interface Job {
  id: number;
  filename: string;
  creator: string;
  kind: string;
  url: string;
  dest: string;
  total: number;
  done: number;
  status: JobStatus;
  error?: string | null;
  speed: number;
  retry_count: number;
  next_retry_at: number | null;
}

export interface Collection {
  id: number;
  name: string;
  count: number;
}

export interface CreatorBreakdown {
  username: string;
  total: number;
  new: number;
  bytes: number;
  new_bytes: number;
}

export interface ProgressPayload {
  id: number;
  done: number;
  total: number;
  speed: number;
}

export interface Target {
  userId: number;
  username: string;
}

export interface DownloadPlan {
  total_items: number;
  new_items: number;
  existing_items: number;
  total_bytes: number;
  new_bytes: number;
  photos: number;
  videos: number;
  audios: number;
  other: number;
  creators: number;
  free_bytes: number;
  canceled: boolean;
  breakdown: CreatorBreakdown[];
}

export interface DupGroup {
  hash: string;
  size: number;
  paths: string[];
}

export interface DedupeProgress {
  phase: "hashing" | "done";
  done: number;
  total: number;
  groups: number;
}

export interface AnalyzeProgress {
  phase: "fetching" | "sizing" | "done";
  creator: string;
  creatorIndex: number;
  creatorTotal: number;
  itemsFound: number;
  sized: number;
  sizeTotal: number;
  newBytes: number;
  totalBytes: number;
}

export interface DownloadLogEntry {
  id: number;
  filename: string;
  creator: string;
  status: string;
  bytes: number;
  error: string | null;
  timestamp: number;
}

export interface LastSyncInfo {
  creator: string;
  last_post_id: number;
  last_sync: number;
}

export interface DeleteResult {
  deleted: number;
  failed: number;
  errors: string[];
}

// ─── Commands ──────────────────────────────────────────────────────────────

export const api = {
  getConfig: () => invoke<Config>("get_config"),
  saveConfig: (config: Config) => invoke<Config>("save_config", { config }),
  authenticate: () => invoke<User>("authenticate"),
  getSubscriptions: () => invoke<User[]>("get_subscriptions"),
  getPosts: (userId: number) => invoke<Post[]>("get_posts", { userId }),
  downloadCreator: (userId: number, username: string) =>
    invoke<number>("download_creator", { userId, username }),
  downloadAll: () => invoke<number>("download_all"),
  analyze: (targets: Target[]) => invoke<DownloadPlan>("analyze", { targets }),
  analyzeCancel: () => invoke("analyze_cancel"),
  startPlan: (onlyNew: boolean, creators?: string[]) =>
    invoke<number>("start_plan", { onlyNew, creators }),

  dlState: () => invoke<Job[]>("dl_state"),
  dlPause: () => invoke("dl_pause"),
  dlResume: () => invoke("dl_resume"),
  dlPauseJob: (id: number) => invoke("dl_pause_job", { id }),
  dlResumeJob: (id: number) => invoke("dl_resume_job", { id }),
  dlCancel: (id: number) => invoke("dl_cancel", { id }),
  dlRetry: (id: number) => invoke("dl_retry", { id }),
  dlCancelAll: () => invoke("dl_cancel_all"),
  dlClear: () => invoke("dl_clear"),

  scanLibrary: () => invoke<MediaEntry[]>("scan_library"),
  thumb: (path: string) => invoke<string>("thumb", { path }),
  findDuplicates: () => invoke<DupGroup[]>("find_duplicates"),
  toggleFavorite: (path: string) => invoke<boolean>("toggle_favorite", { path }),
  addTag: (path: string, tag: string) => invoke("add_tag", { path, tag }),
  removeTag: (path: string, tag: string) => invoke("remove_tag", { path, tag }),
  allTags: () => invoke<[string, number][]>("all_tags"),
  rateMedia: (path: string, rating: number) => invoke("rate_media", { path, rating }),
  listCollections: () => invoke<Collection[]>("list_collections"),
  createCollection: (name: string) => invoke<number>("create_collection", { name }),
  addToCollection: (cid: number, paths: string[]) =>
    invoke("add_to_collection", { cid, paths }),
  removeFromCollection: (cid: number, path: string) =>
    invoke("remove_from_collection", { cid, path }),
  deleteCollection: (cid: number) => invoke("delete_collection", { cid }),
  listCollectionItems: (cid: number) => invoke<string[]>("list_collection_items", { cid }),
  deleteMedia: (paths: string[]) => invoke<DeleteResult>("delete_media", { paths }),
  getDownloadLog: (limit?: number) => invoke<DownloadLogEntry[]>("get_download_log", { limit }),
  clearDownloadLog: () => invoke("clear_download_log"),
  getAutoSyncStatus: () => invoke<LastSyncInfo[]>("get_auto_sync_status"),
};

// ─── Events ──────────────────────────────────────────────────────────────

export function onDownloadState(cb: (jobs: Job[]) => void): Promise<UnlistenFn> {
  return listen<Job[]>("downloads://state", (e) => cb(e.payload));
}
export function onDownloadProgress(cb: (p: ProgressPayload) => void): Promise<UnlistenFn> {
  return listen<ProgressPayload>("downloads://progress", (e) => cb(e.payload));
}
export function onAnalyzeProgress(cb: (p: AnalyzeProgress) => void): Promise<UnlistenFn> {
  return listen<AnalyzeProgress>("analyze://progress", (e) => cb(e.payload));
}
export function onDedupeProgress(cb: (p: DedupeProgress) => void): Promise<UnlistenFn> {
  return listen<DedupeProgress>("dedupe://progress", (e) => cb(e.payload));
}

// ─── Filesystem helpers ────────────────────────────────────────────────────

export const fileSrc = (path: string) => convertFileSrc(path);
export const reveal = (path: string) => revealItemInDir(path).catch(() => {});
export const openFile = (path: string) => openPath(path).catch(() => {});
export async function pickFolder(): Promise<string | null> {
  const res = await openDialog({ directory: true, multiple: false });
  return typeof res === "string" ? res : null;
}
export async function saveFile(defaultName: string): Promise<string | null> {
  const res = await saveDialog({ defaultPath: defaultName });
  return typeof res === "string" ? res : null;
}
