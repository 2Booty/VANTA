import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Home, Users, LayoutGrid, BarChart3, Download, Settings,
  Search, RefreshCw, Copy, Star,
} from "lucide-react";
import { useStore, type View } from "../store";

interface Cmd {
  id: string;
  label: string;
  icon: typeof Home;
  action: () => void;
  hint?: string;
}

export default function CommandPalette() {
  const open = useStore((s) => s.commandPaletteOpen);
  const setOpen = useStore((s) => s.setCommandPaletteOpen);
  const setView = useStore((s) => s.setView);
  const scanLibrary = useStore((s) => s.scanLibrary);
  const openDuplicates = useStore((s) => s.openDuplicates);
  const toast = useStore((s) => s.toast);
  const [query, setQuery] = useState("");
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const go = (v: View) => { setView(v); setOpen(false); };

  const commands: Cmd[] = [
    { id: "home", label: "Go to Home", icon: Home, action: () => go("home") },
    { id: "library", label: "Go to Library", icon: Users, action: () => go("library") },
    { id: "gallery", label: "Go to Gallery", icon: LayoutGrid, action: () => go("gallery") },
    { id: "insights", label: "Go to Insights", icon: BarChart3, action: () => go("insights") },
    { id: "downloads", label: "Go to Downloads", icon: Download, action: () => go("downloads") },
    { id: "settings", label: "Go to Settings", icon: Settings, action: () => go("settings") },
    { id: "rescan", label: "Rescan library", icon: RefreshCw, action: () => { scanLibrary(); toast("Rescanning…"); setOpen(false); } },
    { id: "dedupe", label: "Find duplicates", icon: Copy, action: () => { openDuplicates(); setOpen(false); } },
    { id: "fav", label: "Go to Favorites", icon: Star, action: () => { useStore.getState().setFilter("favorites"); go("gallery"); } },
  ];

  const filtered = commands.filter((c) =>
    c.label.toLowerCase().includes(query.toLowerCase()),
  );

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIdx((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      filtered[idx]?.action();
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="modal-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          onClick={() => setOpen(false)}
        >
          <motion.div
            className="cmd-palette"
            initial={{ opacity: 0, y: -20, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.97 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="cmd-input">
              <Search size={16} />
              <input
                ref={inputRef}
                placeholder="Type a command…"
                value={query}
                onChange={(e) => { setQuery(e.target.value); setIdx(0); }}
                onKeyDown={onKey}
              />
            </div>
            <div className="cmd-list">
              {filtered.map((c, i) => {
                const Icon = c.icon;
                return (
                  <div
                    key={c.id}
                    className={`cmd-item ${i === idx ? "on" : ""}`}
                    onClick={c.action}
                    onMouseEnter={() => setIdx(i)}
                  >
                    <Icon size={15} />
                    <span>{c.label}</span>
                  </div>
                );
              })}
              {filtered.length === 0 && (
                <div className="cmd-empty">No commands found</div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
