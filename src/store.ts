import { create } from "zustand";
import {
  api,
  type Config,
  type User,
  type Post,
  type MediaEntry,
  type Job,
  type Target,
  type DownloadPlan,
  type AnalyzeProgress,
  type DupGroup,
  type DedupeProgress,
  type Collection,
  type DownloadLogEntry,
  type LastSyncInfo,
} from "./lib/api";

export type View = "home" | "library" | "gallery" | "insights" | "downloads" | "settings";
export type AuthStatus = "idle" | "loading" | "ok" | "error";
export type Filter = "all" | "photo" | "video" | "audio" | "paid" | "free" | "favorites" | "untagged";
export type SortBy = "newest" | "oldest" | "largest" | "smallest" | "name" | "creator" | "rating";
export type GroupBy = "none" | "creator";

export interface Toast {
  id: number;
  msg: string;
  kind: "ok" | "err";
}

interface LightboxState {
  open: boolean;
  index: number;
  items: MediaEntry[];
}

export interface AnalyzeState {
  open: boolean;
  mode: "creator" | "all";
  status: "running" | "done" | "error";
  phase: string;
  label: string;
  current: string;
  creatorIndex: number;
  creatorTotal: number;
  itemsFound: number;
  sized: number;
  sizeTotal: number;
  liveBytes: number;
  plan: DownloadPlan | null;
  error: string;
}

const ANALYZE_INIT: AnalyzeState = {
  open: false,
  mode: "creator",
  status: "running",
  phase: "",
  label: "",
  current: "",
  creatorIndex: 0,
  creatorTotal: 0,
  itemsFound: 0,
  sized: 0,
  sizeTotal: 0,
  liveBytes: 0,
  plan: null,
  error: "",
};

export interface DedupeState {
  open: boolean;
  status: "running" | "done" | "error";
  done: number;
  total: number;
  groups: DupGroup[];
  error: string;
}

const DEDUPE_INIT: DedupeState = {
  open: false,
  status: "running",
  done: 0,
  total: 0,
  groups: [],
  error: "",
};

interface State {
  view: View;
  config: Config | null;

  authStatus: AuthStatus;
  me: User | null;
  authError: string;

  subs: User[];
  subsLoading: boolean;
  expanded: number | null;
  postsByUser: Record<number, Post[]>;
  postsLoading: Record<number, boolean>;

  media: MediaEntry[];
  mediaLoading: boolean;
  query: string;
  filter: Filter;
  creatorFilter: string | null;
  sortBy: SortBy;
  groupBy: GroupBy;
  minRating: number;
  dateFrom: string;
  dateTo: string;

  selMode: boolean;
  selected: string[];

  jobs: Job[];

  lightbox: LightboxState;
  slideshowActive: boolean;
  toasts: Toast[];
  analyze: AnalyzeState;
  dedupe: DedupeState;
  locked: boolean;

  collections: Collection[];
  allTags: [string, number][];
  downloadLog: DownloadLogEntry[];
  autoSyncStatus: LastSyncInfo[];

  commandPaletteOpen: boolean;
  keyboardHelpOpen: boolean;
  contextMenu: { x: number; y: number; path: string } | null;

  // actions
  setView: (v: View) => void;
  init: () => Promise<void>;
  applyTheme: (theme: string) => void;
  applyAccent: (accent: string) => void;
  patchConfig: (patch: Partial<Config>) => Promise<void>;
  saveConfig: (cfg: Config) => Promise<void>;
  authenticate: () => Promise<void>;
  loadSubs: () => Promise<void>;
  toggleCreator: (userId: number) => Promise<void>;
  scanLibrary: () => Promise<void>;
  setQuery: (q: string) => void;
  setFilter: (f: Filter) => void;
  setCreatorFilter: (c: string | null) => void;
  setSortBy: (s: SortBy) => void;
  setGroupBy: (g: GroupBy) => void;
  setMinRating: (n: number) => void;
  setDateFrom: (d: string) => void;
  setDateTo: (d: string) => void;
  toggleFav: (path: string) => Promise<void>;
  rateMedia: (path: string, rating: number) => Promise<void>;

  setSelMode: (on: boolean) => void;
  toggleSelect: (path: string) => void;
  clearSelection: () => void;

  setJobs: (jobs: Job[]) => void;
  patchProgress: (id: number, done: number, total: number, speed: number) => void;

  openLightbox: (items: MediaEntry[], index: number) => void;
  closeLightbox: () => void;
  lbStep: (d: number) => void;
  lbGoto: (i: number) => void;
  setSlideshow: (on: boolean) => void;

  toast: (msg: string, kind?: "ok" | "err") => void;
  dropToast: (id: number) => void;

  openAnalyze: (targets: Target[], mode: "creator" | "all", label: string) => void;
  setAnalyzeProgress: (p: AnalyzeProgress) => void;
  startPlan: (onlyNew: boolean, creators?: string[]) => Promise<void>;
  cancelAnalyze: () => void;
  closeAnalyze: () => void;

  openDuplicates: () => void;
  setDedupeProgress: (p: DedupeProgress) => void;
  closeDuplicates: () => void;
  lock: () => void;
  unlock: () => void;

  loadCollections: () => Promise<void>;
  loadAllTags: () => Promise<void>;
  loadDownloadLog: () => Promise<void>;
  loadAutoSyncStatus: () => Promise<void>;

  setCommandPaletteOpen: (open: boolean) => void;
  setKeyboardHelpOpen: (open: boolean) => void;
  setContextMenu: (menu: { x: number; y: number; path: string } | null) => void;
}

function setThemeVars(theme: string, accent: string) {
  document.body.dataset.theme = theme;
  document.body.style.setProperty("--accent", accent);
}

let toastSeq = 1;

export const useStore = create<State>((set, get) => ({
  view: "home",
  config: null,
  authStatus: "idle",
  me: null,
  authError: "",
  subs: [],
  subsLoading: false,
  expanded: null,
  postsByUser: {},
  postsLoading: {},
  media: [],
  mediaLoading: false,
  query: "",
  filter: "all",
  creatorFilter: null,
  sortBy: "newest",
  groupBy: "none",
  minRating: 0,
  dateFrom: "",
  dateTo: "",
  selMode: false,
  selected: [],
  jobs: [],
  lightbox: { open: false, index: 0, items: [] },
  slideshowActive: false,
  toasts: [],
  analyze: ANALYZE_INIT,
  dedupe: DEDUPE_INIT,
  locked: false,
  collections: [],
  allTags: [],
  downloadLog: [],
  autoSyncStatus: [],
  commandPaletteOpen: false,
  keyboardHelpOpen: false,
  contextMenu: null,

  setView: (v) => set({ view: v }),

  init: async () => {
    try {
      const cfg = await api.getConfig();
      setThemeVars(cfg.theme || "graphite", cfg.accent || "#8c93c9");
      set({
        config: cfg,
        sortBy: (cfg.gallery_sort as SortBy) || "newest",
        groupBy: (cfg.gallery_group as GroupBy) || "none",
        locked: !!cfg.pin_hash,
      });
      try {
        const jobs = await api.dlState();
        set({ jobs });
      } catch {}
      // Load auxiliary data
      get().loadCollections();
      get().loadAllTags();
      get().loadAutoSyncStatus();
      const hasCreds =
        cfg.credentials.cookie.trim() !== "" && cfg.credentials.x_bc.trim() !== "";
      if (hasCreds) {
        await get().authenticate();
      }
      get().scanLibrary();
    } catch (e) {
      get().toast(String(e), "err");
    }
  },

  applyTheme: (theme) => {
    const cfg = get().config;
    setThemeVars(theme, cfg?.accent || "#8c93c9");
    if (cfg) get().patchConfig({ theme });
  },
  applyAccent: (accent) => {
    const cfg = get().config;
    setThemeVars(cfg?.theme || "graphite", accent);
    if (cfg) get().patchConfig({ accent });
  },

  patchConfig: async (patch) => {
    const cur = get().config;
    if (!cur) return;
    const next = { ...cur, ...patch };
    set({ config: next });
    try {
      const saved = await api.saveConfig(next);
      set({ config: saved });
    } catch (e) {
      get().toast(String(e), "err");
    }
  },

  saveConfig: async (cfg) => {
    try {
      const saved = await api.saveConfig(cfg);
      setThemeVars(saved.theme || "graphite", saved.accent || "#8c93c9");
      set({ config: saved });
      get().toast("Settings saved");
    } catch (e) {
      get().toast(String(e), "err");
    }
  },

  authenticate: async () => {
    set({ authStatus: "loading", authError: "" });
    try {
      const me = await api.authenticate();
      set({ authStatus: "ok", me });
      get().loadSubs();
    } catch (e) {
      set({ authStatus: "error", authError: String(e) });
    }
  },

  loadSubs: async () => {
    set({ subsLoading: true });
    try {
      const subs = await api.getSubscriptions();
      set({ subs, subsLoading: false });
    } catch (e) {
      set({ subsLoading: false });
      get().toast(String(e), "err");
    }
  },

  toggleCreator: async (userId) => {
    if (get().expanded === userId) {
      set({ expanded: null });
      return;
    }
    set({ expanded: userId });
    if (!get().postsByUser[userId]) {
      set((s) => ({ postsLoading: { ...s.postsLoading, [userId]: true } }));
      try {
        const posts = await api.getPosts(userId);
        set((s) => ({
          postsByUser: { ...s.postsByUser, [userId]: posts },
          postsLoading: { ...s.postsLoading, [userId]: false },
        }));
      } catch (e) {
        set((s) => ({ postsLoading: { ...s.postsLoading, [userId]: false } }));
        get().toast(String(e), "err");
      }
    }
  },

  scanLibrary: async () => {
    set({ mediaLoading: true });
    try {
      const media = await api.scanLibrary();
      set({ media, mediaLoading: false });
      get().loadAllTags();
    } catch (e) {
      set({ mediaLoading: false });
      get().toast(String(e), "err");
    }
  },

  setQuery: (q) => set({ query: q }),
  setFilter: (f) => set({ filter: f }),
  setCreatorFilter: (c) => set({ creatorFilter: c, view: "gallery" }),
  setSortBy: (s) => {
    set({ sortBy: s });
    get().patchConfig({ gallery_sort: s });
  },
  setGroupBy: (g) => {
    set({ groupBy: g });
    get().patchConfig({ gallery_group: g });
  },
  setMinRating: (n) => set({ minRating: n }),
  setDateFrom: (d) => set({ dateFrom: d }),
  setDateTo: (d) => set({ dateTo: d }),

  toggleFav: async (path) => {
    try {
      const fav = await api.toggleFavorite(path);
      set((s) => ({
        media: s.media.map((m) => (m.path === path ? { ...m, favorite: fav } : m)),
        lightbox: {
          ...s.lightbox,
          items: s.lightbox.items.map((m) =>
            m.path === path ? { ...m, favorite: fav } : m,
          ),
        },
      }));
    } catch (e) {
      get().toast(String(e), "err");
    }
  },

  rateMedia: async (path, rating) => {
    try {
      await api.rateMedia(path, rating);
      set((s) => ({
        media: s.media.map((m) => (m.path === path ? { ...m, rating } : m)),
        lightbox: {
          ...s.lightbox,
          items: s.lightbox.items.map((m) =>
            m.path === path ? { ...m, rating } : m,
          ),
        },
      }));
    } catch (e) {
      get().toast(String(e), "err");
    }
  },

  setSelMode: (on) => set({ selMode: on, selected: on ? get().selected : [] }),
  toggleSelect: (path) =>
    set((s) => ({
      selected: s.selected.includes(path)
        ? s.selected.filter((p) => p !== path)
        : [...s.selected, path],
    })),
  clearSelection: () => set({ selected: [] }),

  setJobs: (jobs) => {
    // Use jobs as-is — speed is now injected via patchProgress only
    set({ jobs });
  },
  patchProgress: (id, done, total, speed) =>
    set((s) => {
      // Update only the single job that changed, avoid full array copy
      const jobs = s.jobs.map((j) =>
        j.id === id ? { ...j, done, total, speed } : j,
      );
      return { jobs };
    }),

  openLightbox: (items, index) => set({ lightbox: { open: true, items, index } }),
  closeLightbox: () => set((s) => ({ lightbox: { ...s.lightbox, open: false }, slideshowActive: false })),
  lbStep: (d) =>
    set((s) => {
      const n = s.lightbox.items.length;
      if (n === 0) return s;
      return { lightbox: { ...s.lightbox, index: (s.lightbox.index + d + n) % n } };
    }),
  lbGoto: (i) => set((s) => ({ lightbox: { ...s.lightbox, index: i } })),
  setSlideshow: (on) => set({ slideshowActive: on }),

  toast: (msg, kind = "ok") => {
    const id = toastSeq++;
    set((s) => ({ toasts: [...s.toasts, { id, msg, kind }] }));
    setTimeout(() => get().dropToast(id), 2400);
  },
  dropToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  openAnalyze: (targets, mode, label) => {
    set({
      analyze: {
        ...ANALYZE_INIT,
        open: true,
        mode,
        status: "running",
        phase: "fetching",
        label,
        creatorTotal: targets.length,
      },
    });
    api
      .analyze(targets)
      .then((plan) => {
        if (plan.canceled) {
          set((s) => ({ analyze: { ...s.analyze, open: false } }));
          return;
        }
        set((s) => ({ analyze: { ...s.analyze, status: "done", phase: "done", plan } }));
      })
      .catch((e) =>
        set((s) => ({ analyze: { ...s.analyze, status: "error", error: String(e) } })),
      );
  },

  setAnalyzeProgress: (p) =>
    set((s) => {
      if (!s.analyze.open || s.analyze.status !== "running") return s;
      return {
        analyze: {
          ...s.analyze,
          phase: p.phase,
          current: p.creator || s.analyze.current,
          creatorIndex: p.creatorIndex || s.analyze.creatorIndex,
          creatorTotal: p.creatorTotal || s.analyze.creatorTotal,
          itemsFound: p.itemsFound,
          sized: p.sized,
          sizeTotal: p.sizeTotal,
          liveBytes: p.totalBytes,
        },
      };
    }),

  startPlan: async (onlyNew, creators) => {
    try {
      const n = await api.startPlan(onlyNew, creators);
      get().toast(n > 0 ? `Queued ${n} file${n === 1 ? "" : "s"}` : "Nothing to download");
      set((s) => ({ analyze: { ...s.analyze, open: false } }));
      if (n > 0) set({ view: "downloads" });
    } catch (e) {
      get().toast(String(e), "err");
    }
  },

  cancelAnalyze: () => {
    api.analyzeCancel();
    set((s) => ({ analyze: { ...s.analyze, open: false } }));
  },

  closeAnalyze: () => set((s) => ({ analyze: { ...s.analyze, open: false } })),

  openDuplicates: () => {
    set({ dedupe: { open: true, status: "running", done: 0, total: 0, groups: [], error: "" } });
    api
      .findDuplicates()
      .then((groups) =>
        set((s) => ({ dedupe: { ...s.dedupe, status: "done", groups } })),
      )
      .catch((e) =>
        set((s) => ({ dedupe: { ...s.dedupe, status: "error", error: String(e) } })),
      );
  },
  setDedupeProgress: (p) =>
    set((s) =>
      s.dedupe.open && s.dedupe.status === "running"
        ? { dedupe: { ...s.dedupe, done: p.done, total: p.total } }
        : s,
    ),
  closeDuplicates: () => set((s) => ({ dedupe: { ...s.dedupe, open: false } })),
  lock: () => set({ locked: true }),
  unlock: () => set({ locked: false }),

  loadCollections: async () => {
    try {
      const cols = await api.listCollections();
      set({ collections: cols });
    } catch {}
  },
  loadAllTags: async () => {
    try {
      const tags = await api.allTags();
      set({ allTags: tags });
    } catch {}
  },
  loadDownloadLog: async () => {
    try {
      const log = await api.getDownloadLog(200);
      set({ downloadLog: log });
    } catch {}
  },
  loadAutoSyncStatus: async () => {
    try {
      const status = await api.getAutoSyncStatus();
      set({ autoSyncStatus: status });
    } catch {}
  },

  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
  setKeyboardHelpOpen: (open) => set({ keyboardHelpOpen: open }),
  setContextMenu: (menu) => set({ contextMenu: menu }),
}));
