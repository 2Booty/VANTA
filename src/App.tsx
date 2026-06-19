import { useEffect, useRef, type ComponentType } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { register, unregisterAll } from "@tauri-apps/plugin-global-shortcut";
import { getCurrentWindow } from "@tauri-apps/api/window";
import TitleBar from "./components/TitleBar";
import NavRail from "./components/NavRail";
import Toasts from "./components/Toasts";
import Lightbox from "./components/Lightbox";
import AnalyzeModal from "./components/AnalyzeModal";
import DuplicatesModal from "./components/DuplicatesModal";
import LockScreen from "./components/LockScreen";
import ContextMenu from "./components/ContextMenu";
import CommandPalette from "./components/CommandPalette";
import KeyboardHelp from "./components/KeyboardHelp";
import Home from "./screens/Home";
import Library from "./screens/Library";
import Gallery from "./screens/Gallery";
import Insights from "./screens/Insights";
import Downloads from "./screens/Downloads";
import Settings from "./screens/Settings";
import { useStore, type View } from "./store";
import {
  onDownloadState,
  onDownloadProgress,
  onAnalyzeProgress,
  onDedupeProgress,
} from "./lib/api";

const SCREENS: Record<View, ComponentType> = {
  home: Home,
  library: Library,
  gallery: Gallery,
  insights: Insights,
  downloads: Downloads,
  settings: Settings,
};

export default function App() {
  const view = useStore((s) => s.view);
  const init = useStore((s) => s.init);
  const setJobs = useStore((s) => s.setJobs);
  const patchProgress = useStore((s) => s.patchProgress);
  const setAnalyzeProgress = useStore((s) => s.setAnalyzeProgress);
  const setDedupeProgress = useStore((s) => s.setDedupeProgress);
  const panicHotkey = useStore((s) => s.config?.panic_hotkey);
  const lockOnBlur = useStore((s) => s.config?.lock_on_blur);
  const pinHash = useStore((s) => s.config?.pin_hash);
  const autoLockMinutes = useStore((s) => s.config?.auto_lock_minutes);
  const clearOnPanic = useStore((s) => s.config?.clear_on_panic);
  const closeToTray = useStore((s) => s.config?.close_to_tray);
  const stealthMode = useStore((s) => s.config?.stealth_mode);
  const stealthTitle = useStore((s) => s.config?.stealth_title);
  const setCommandPaletteOpen = useStore((s) => s.setCommandPaletteOpen);
  const setKeyboardHelpOpen = useStore((s) => s.setKeyboardHelpOpen);
  const hiddenRef = useRef(false);

  useEffect(() => {
    init();
  }, [init]);

  // ─── Global keyboard shortcuts ───
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement;
      const typing = tgt.tagName === "INPUT" || tgt.tagName === "TEXTAREA" || tgt.isContentEditable;

      // Ctrl+K — command palette
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setCommandPaletteOpen(!useStore.getState().commandPaletteOpen);
        return;
      }

      // ? — keyboard help (only when not typing)
      if (e.key === "?" && !typing) {
        e.preventDefault();
        setKeyboardHelpOpen(!useStore.getState().keyboardHelpOpen);
        return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setCommandPaletteOpen, setKeyboardHelpOpen]);

  // ─── Panic hotkey: hide + lock; press again to bring the window back ───
  useEffect(() => {
    const hotkey = panicHotkey?.trim();
    if (!hotkey) return;
    const win = getCurrentWindow();
    let cancelled = false;
    (async () => {
      try {
        await unregisterAll();
        if (cancelled) return;
        await register(hotkey, async (event: { state?: string }) => {
          if (event?.state && event.state !== "Pressed") return;
          if (!hiddenRef.current) {
            useStore.getState().lock();
            if (clearOnPanic) {
              // Clear clipboard and recent activity
              try { await navigator.clipboard.writeText(""); } catch {}
              useStore.setState({ jobs: [], downloadLog: [] });
            }
            hiddenRef.current = true;
            await win.hide();
          } else {
            hiddenRef.current = false;
            await win.show();
            await win.setFocus();
          }
        });
      } catch {
        /* invalid / taken hotkey - ignore */
      }
    })();
    return () => {
      cancelled = true;
      unregisterAll().catch(() => {});
    };
  }, [panicHotkey, clearOnPanic]);

  // ─── Re-lock when the app is truly deactivated ───
  useEffect(() => {
    if (!lockOnBlur || !pinHash) return;
    const win = getCurrentWindow();
    let timer: number | undefined;
    let unlisten: (() => void) | undefined;
    win
      .onFocusChanged(({ payload: focused }) => {
        if (focused) {
          if (timer) {
            clearTimeout(timer);
            timer = undefined;
          }
        } else {
          timer = window.setTimeout(() => useStore.getState().lock(), 700);
        }
      })
      .then((u) => (unlisten = u));
    return () => {
      if (timer) clearTimeout(timer);
      unlisten?.();
    };
  }, [lockOnBlur, pinHash]);

  // ─── Auto-lock on inactivity ───
  useEffect(() => {
    if (!autoLockMinutes || !pinHash) return;
    let timer: number;
    const reset = () => {
      clearTimeout(timer);
      timer = window.setTimeout(() => useStore.getState().lock(), autoLockMinutes * 60 * 1000);
    };
    window.addEventListener("mousemove", reset);
    window.addEventListener("keydown", reset);
    window.addEventListener("click", reset);
    reset();
    return () => {
      clearTimeout(timer);
      window.removeEventListener("mousemove", reset);
      window.removeEventListener("keydown", reset);
      window.removeEventListener("click", reset);
    };
  }, [autoLockMinutes, pinHash]);

  // ─── Close-to-tray ───
  useEffect(() => {
    if (!closeToTray) return;
    const win = getCurrentWindow();
    let unlisten: (() => void) | undefined;
    win
      .onCloseRequested((event) => {
        event.preventDefault();
        win.hide();
      })
      .then((u) => (unlisten = u));
    return () => unlisten?.();
  }, [closeToTray]);

  // ─── Stealth mode: set window title ───
  useEffect(() => {
    if (stealthMode && stealthTitle) {
      getCurrentWindow().setTitle(stealthTitle).catch(() => {});
    }
  }, [stealthMode, stealthTitle]);

  // ─── Event listeners ───
  useEffect(() => {
    let un1: undefined | (() => void);
    let un2: undefined | (() => void);
    let un3: undefined | (() => void);
    let un4: undefined | (() => void);
    onDownloadState(setJobs).then((f) => (un1 = f));
    onDownloadProgress((p) => patchProgress(p.id, p.done, p.total, p.speed)).then((f) => (un2 = f));
    onAnalyzeProgress(setAnalyzeProgress).then((f) => (un3 = f));
    onDedupeProgress(setDedupeProgress).then((f) => (un4 = f));
    return () => {
      un1?.();
      un2?.();
      un3?.();
      un4?.();
    };
  }, [setJobs, patchProgress, setAnalyzeProgress, setDedupeProgress]);

  const Screen = SCREENS[view];

  return (
    <div className="win">
      <TitleBar />
      <div className="body">
        <NavRail />
        <div className="content">
          <AnimatePresence mode="wait">
            <motion.div
              key={view}
              style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
            >
              <Screen />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
      <Lightbox />
      <AnalyzeModal />
      <DuplicatesModal />
      <Toasts />
      <LockScreen />
      <ContextMenu />
      <CommandPalette />
      <KeyboardHelp />
    </div>
  );
}
