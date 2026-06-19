import { motion } from "framer-motion";
import { X, Copy, Trash2 } from "lucide-react";
import { useStore } from "../store";
import { api, type MediaEntry } from "../lib/api";
import { formatBytes, fileName } from "../lib/format";
import Thumb from "./Thumb";
import VideoThumb from "./VideoThumb";

const isVideo = (p: string) => /\.(mp4|mov|avi|mkv|webm|m4v)$/i.test(p);

const toEntry = (p: string, size: number): MediaEntry => ({
  id: p,
  path: p,
  creator: "",
  kind: isVideo(p) ? "video" : "photo",
  is_paid: false,
  bytes: size,
  modified: 0,
  favorite: false,
  tags: [],
  rating: 0,
});

function DupThumb({
  path,
  kind,
  onClick,
}: {
  path: string;
  kind: "keep" | "dupe";
  onClick?: () => void;
}) {
  return (
    <div
      className={`dup-thumb ${kind}`}
      title={fileName(path)}
      onClick={onClick}
      style={{ cursor: onClick ? "zoom-in" : undefined }}
    >
      {isVideo(path) ? (
        <VideoThumb path={path} className="dt-inner" />
      ) : (
        <Thumb path={path} className="dt-inner" />
      )}
    </div>
  );
}

export default function DuplicatesModal() {
  const d = useStore((s) => s.dedupe);
  const close = useStore((s) => s.closeDuplicates);
  const scanLibrary = useStore((s) => s.scanLibrary);
  const openLightbox = useStore((s) => s.openLightbox);
  const toast = useStore((s) => s.toast);

  if (!d.open) return null;

  const running = d.status === "running";
  const groups = d.groups;
  const dupPaths = groups.flatMap((g) => g.paths.slice(1));
  const reclaim = groups.reduce((a, g) => a + (g.paths.length - 1) * g.size, 0);

  const deleteDupes = async () => {
    if (dupPaths.length === 0) return;
    if (
      !window.confirm(
        `Move ${dupPaths.length} duplicate file(s) to the Recycle Bin? One copy of each is kept.`
      )
    )
      return;
    try {
      await api.deleteMedia(dupPaths);
      toast(`Removed ${dupPaths.length} duplicates`);
      close();
      scanLibrary();
    } catch (e) {
      toast(String(e), "err");
    }
  };

  return (
    <motion.div
      className="modal-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15 }}
      onClick={() => !running && close()}
    >
      <motion.div
        className="modal modal-lg"
        initial={{ opacity: 0, y: 14, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <Copy size={18} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="mt">Duplicate finder</div>
            <div className="ms">
              {running
                ? "Scanning your library…"
                : d.status === "error"
                ? "Failed"
                : `${groups.length} duplicate set${groups.length === 1 ? "" : "s"} found`}
            </div>
          </div>
          <button className="icon-btn" onClick={() => close()}>
            <X size={15} />
          </button>
        </div>

        <div className="modal-body" style={{ maxHeight: "54vh", overflowY: "auto" }}>
          {d.status === "error" ? (
            <div className="banner err">
              <div className="bd">{d.error}</div>
            </div>
          ) : running ? (
            <>
              <div className="analyze-phase">
                <div className="spinner" />
                <div>
                  Hashing files…{" "}
                  <b style={{ color: "var(--ink)" }}>
                    {d.done}/{d.total || "?"}
                  </b>
                </div>
              </div>
              <div className="track">
                <div
                  className="fill"
                  style={{ width: d.total > 0 ? `${(d.done / d.total) * 100}%` : "20%" }}
                />
              </div>
            </>
          ) : groups.length === 0 ? (
            <div className="empty">
              <Copy />
              <div className="t">No duplicates found. Your library is clean.</div>
            </div>
          ) : (
            <>
              <div style={{ fontSize: 12.5, color: "var(--dim)", marginBottom: 12 }}>
                Keeping the first copy · reclaim ~
                <b style={{ color: "var(--ink)" }}>{formatBytes(reclaim)}</b> ·{" "}
                <span style={{ color: "var(--good)" }}>green = kept</span>,{" "}
                <span style={{ color: "var(--bad)" }}>red = removed</span> · click any thumbnail to
                preview
              </div>
              {groups.map((g) => (
                <div className="dup-group" key={g.hash}>
                  {g.paths.map((p, idx) => (
                    <DupThumb
                      key={p}
                      path={p}
                      kind={idx === 0 ? "keep" : "dupe"}
                      onClick={() => openLightbox(g.paths.map((pp) => toEntry(pp, g.size)), idx)}
                    />
                  ))}
                  <span className="dup-size mono">{formatBytes(g.size)} each</span>
                </div>
              ))}
            </>
          )}
        </div>

        <div className="modal-foot">
          <button className="btn ghost" onClick={close}>
            Close
          </button>
          {!running && groups.length > 0 && (
            <button className="btn danger-btn" onClick={deleteDupes}>
              <Trash2 size={14} /> Delete {dupPaths.length} duplicates
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
