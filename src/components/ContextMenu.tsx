import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Star, FolderOpen, Tag, Trash2, Copy, Eye } from "lucide-react";
import { useStore } from "../store";
import { api, reveal } from "../lib/api";

export default function ContextMenu() {
  const menu = useStore((s) => s.contextMenu);
  const setMenu = useStore((s) => s.setContextMenu);
  const openLightbox = useStore((s) => s.openLightbox);
  const toggleFav = useStore((s) => s.toggleFav);
  const rateMedia = useStore((s) => s.rateMedia);
  const scanLibrary = useStore((s) => s.scanLibrary);
  const toast = useStore((s) => s.toast);
  const media = useStore((s) => s.media);
  const ref = useRef<HTMLDivElement>(null);
  const [showRating, setShowRating] = useState(false);

  useEffect(() => {
    if (!menu) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setMenu(null);
        setShowRating(false);
      }
    };
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && setMenu(null);
    setTimeout(() => {
      document.addEventListener("click", onClick);
      document.addEventListener("keydown", onEsc);
    }, 0);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [menu, setMenu]);

  if (!menu) return null;
  const item = media.find((m) => m.path === menu.path);
  if (!item) return null;

  const open = () => {
    openLightbox(media, media.findIndex((m) => m.path === menu.path));
    setMenu(null);
  };
  const favorite = async () => {
    await toggleFav(item.path);
    setMenu(null);
  };
  const addTag = async () => {
    const tag = window.prompt("Add tag:");
    if (tag) {
      await api.addTag(item.path, tag);
      toast(`Tagged with "${tag}"`);
      scanLibrary();
    }
    setMenu(null);
  };
  const copyPath = async () => {
    await navigator.clipboard.writeText(item.path);
    toast("Path copied");
    setMenu(null);
  };
  const del = async () => {
    if (!window.confirm("Move this file to the Recycle Bin?")) return;
    await api.deleteMedia([item.path]);
    toast("Deleted");
    scanLibrary();
    setMenu(null);
  };

  const w = 200;
  const h = 360;
  const x = Math.min(menu.x, window.innerWidth - w - 8);
  const y = Math.min(menu.y, window.innerHeight - h - 8);

  return (
    <AnimatePresence>
      <motion.div
        ref={ref}
        className="ctx-menu"
        style={{ left: x, top: y }}
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.12 }}
      >
        <div className="ctx-item" onClick={open}>
          <Eye size={14} /> Open
        </div>
        <div className="ctx-item" onClick={() => { reveal(item.path); setMenu(null); }}>
          <FolderOpen size={14} /> Reveal in Explorer
        </div>
        <div className="ctx-sep" />
        <div className="ctx-item" onClick={favorite}>
          <Star size={14} fill={item.favorite ? "currentColor" : "none"} />
          {item.favorite ? "Unfavorite" : "Favorite"}
        </div>
        <div className="ctx-item" onMouseEnter={() => setShowRating(true)}>
          <Star size={14} /> Rate
          {showRating && (
            <div className="ctx-stars" onClick={(e) => e.stopPropagation()}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  className="ctx-star"
                  onClick={async () => {
                    await rateMedia(item.path, n === item.rating ? 0 : n);
                    setShowRating(false);
                    setMenu(null);
                  }}
                >
                  <Star size={14} fill={n <= item.rating ? "var(--warn)" : "none"} />
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="ctx-item" onClick={addTag}>
          <Tag size={14} /> Add tag
        </div>
        <div className="ctx-sep" />
        <div className="ctx-item" onClick={copyPath}>
          <Copy size={14} /> Copy path
        </div>
        <div className="ctx-item danger" onClick={del}>
          <Trash2 size={14} /> Delete
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
