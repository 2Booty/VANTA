import { useEffect } from "react";
import { motion } from "framer-motion";
import { RefreshCw, DownloadCloud, Check, AlertCircle, ArrowDown, RefreshCcw, Clock, Image as ImageIcon, Film, Music, File } from "lucide-react";
import { useStore } from "../store";
import { formatBytes, fileName, formatTime } from "../lib/format";

export default function Home() {
  const authStatus = useStore((s) => s.authStatus);
  const authError = useStore((s) => s.authError);
  const subs = useStore((s) => s.subs);
  const media = useStore((s) => s.media);
  const jobs = useStore((s) => s.jobs);
  const config = useStore((s) => s.config);
  const autoSyncStatus = useStore((s) => s.autoSyncStatus);
  const loadAutoSyncStatus = useStore((s) => s.loadAutoSyncStatus);
  const setView = useStore((s) => s.setView);
  const loadSubs = useStore((s) => s.loadSubs);
  const scanLibrary = useStore((s) => s.scanLibrary);
  const authenticate = useStore((s) => s.authenticate);
  const toast = useStore((s) => s.toast);
  const openAnalyze = useStore((s) => s.openAnalyze);

  // Refresh auto-sync status on mount and every 30s while Home is visible.
  useEffect(() => {
    loadAutoSyncStatus();
    const t = setInterval(() => loadAutoSyncStatus(), 30000);
    return () => clearInterval(t);
  }, [loadAutoSyncStatus]);

  const storage = media.reduce((a, m) => a + (m.bytes || 0), 0);
  const active = jobs.filter((j) => j.status === "queued" || j.status === "active").length;
  const recent = [...jobs]
    .filter((j) => ["done", "skipped", "error", "active"].includes(j.status))
    .slice(-6)
    .reverse();

  // Storage breakdown by kind
  const breakdown = media.reduce(
    (acc, m) => {
      const k = m.kind as "photo" | "video" | "audio" | "other";
      acc[k] = (acc[k] || 0) + (m.bytes || 0);
      return acc;
    },
    {} as Record<string, number>,
  );
  const photoBytes = breakdown.photo || 0;
  const videoBytes = breakdown.video || 0;
  const audioBytes = breakdown.audio || 0;
  const otherBytes = breakdown.other || 0;
  const breakdownRows: { label: string; bytes: number; icon: typeof ImageIcon }[] = [
    { label: "Photos", bytes: photoBytes, icon: ImageIcon },
    { label: "Videos", bytes: videoBytes, icon: Film },
    { label: "Audio", bytes: audioBytes, icon: Music },
    { label: "Other", bytes: otherBytes, icon: File },
  ];

  // Auto-sync status summary
  const autoSyncEnabled = config?.auto_sync_enabled ?? false;
  const autoSyncHours = config?.auto_sync_hours ?? 0;
  const lastSyncTs = autoSyncStatus
    .map((s) => s.last_sync)
    .filter(Boolean)
    .sort((a, b) => b - a)[0];

  const allTargets = subs
    .filter((c) => c.id != null && c.username)
    .map((c) => ({ userId: c.id as number, username: c.username as string }));
  const syncAll = () => openAnalyze(allTargets, "all", "all");

  return (
    <div className="panel">
      <div className="phead">
        <h1>Home</h1>
        <span className="pm">overview &amp; activity</span>
        <div className="right">
          <button
            className="btn"
            onClick={() => {
              loadSubs();
              scanLibrary();
              toast("Refreshing…");
            }}
          >
            <RefreshCw size={14} /> Refresh
          </button>
          <button className="btn pri" onClick={syncAll} disabled={authStatus !== "ok"}>
            <DownloadCloud size={14} /> Sync all
          </button>
        </div>
      </div>

      <div className="scroll">
        {authStatus === "error" && (
          <div className="banner err" style={{ marginBottom: 14 }}>
            <div className="bt">Authentication failed</div>
            <div className="bd">{authError}</div>
            <button className="btn" style={{ marginTop: 10 }} onClick={authenticate}>
              <RefreshCw size={14} /> Retry
            </button>
          </div>
        )}
        {authStatus === "idle" && (
          <div className="banner" style={{ marginBottom: 14 }}>
            <div className="bt">Welcome to VANTA</div>
            <div className="bd">Add your credentials in Settings to connect and start downloading.</div>
            <button className="btn" style={{ marginTop: 10 }} onClick={() => setView("settings")}>
              Open Settings
            </button>
          </div>
        )}

        <motion.div
          className="stats"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className="tile">
            <div className="v">{subs.length}</div>
            <div className="l">Creators</div>
          </div>
          <div className="tile">
            <div className="v">{media.length}</div>
            <div className="l">Items in library</div>
          </div>
          <div className="tile">
            <div className="v">
              {formatBytes(storage).split(" ")[0]}
              <small> {formatBytes(storage).split(" ")[1]}</small>
            </div>
            <div className="l">Storage used</div>
          </div>
          <div className="tile">
            <div className="v">{active}</div>
            <div className="l">Downloading now</div>
          </div>
        </motion.div>

        {/* Auto-sync status panel */}
        <motion.div
          className="sect"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.05 }}
        >
          <h3 style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <RefreshCcw size={14} /> Auto-sync
            <span
              className="pillx mono"
              style={{
                fontSize: 10,
                color: autoSyncEnabled ? "var(--good)" : "var(--dim)",
                border: `1px solid ${autoSyncEnabled ? "var(--good)" : "var(--dim)"}`,
              }}
            >
              {autoSyncEnabled ? "on" : "off"}
            </span>
          </h3>
          <div style={{ fontSize: 13, color: "var(--dim)", display: "flex", flexDirection: "column", gap: 4 }}>
            <span>
              {autoSyncEnabled ? (
                <>Syncing every {autoSyncHours}h across {autoSyncStatus.length} creator{autoSyncStatus.length === 1 ? "" : "s"}.</>
              ) : (
                <>Auto-sync is disabled. Enable it in Settings to keep your library up to date.</>
              )}
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Clock size={12} />
              {lastSyncTs ? (
                <>Last sync: {formatTime(lastSyncTs)}</>
              ) : autoSyncStatus.length > 0 ? (
                <>Synced {autoSyncStatus.length} creator{autoSyncStatus.length === 1 ? "" : "s"}, last sync: never</>
              ) : (
                <>No sync history yet.</>
              )}
            </span>
          </div>
        </motion.div>

        {/* Storage breakdown */}
        <motion.div
          className="sect"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          <h3>Storage breakdown</h3>
          {storage === 0 ? (
            <div style={{ color: "var(--faint)", fontSize: 13, padding: "6px 0" }}>
              No media in library yet.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {breakdownRows.map((row) => {
                const pct = storage > 0 ? (row.bytes / storage) * 100 : 0;
                return (
                  <div key={row.label} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12.5 }}>
                    <row.icon size={13} style={{ color: "var(--dim)", flexShrink: 0 }} />
                    <span style={{ width: 56, color: "var(--dim)" }}>{row.label}</span>
                    <div className="track" style={{ flex: 1, height: 6 }}>
                      <div className="fill" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="mono" style={{ width: 90, textAlign: "right", color: "var(--dim)" }}>
                      {formatBytes(row.bytes)}
                    </span>
                    <span className="mono" style={{ width: 44, textAlign: "right", color: "var(--faint)" }}>
                      {Math.round(pct)}%
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </motion.div>

        <div className="sect">
          <h3>Recent activity</h3>
          {recent.length === 0 ? (
            <div style={{ color: "var(--faint)", fontSize: 13, padding: "6px 0" }}>
              No activity yet.
            </div>
          ) : (
            recent.map((j) => (
              <div className="act-row" key={j.id}>
                <span className="ic">
                  {j.status === "done" ? (
                    <Check size={14} />
                  ) : j.status === "skipped" ? (
                    <Check size={14} />
                  ) : j.status === "error" ? (
                    <AlertCircle size={14} />
                  ) : (
                    <ArrowDown size={14} />
                  )}
                </span>
                <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {fileName(j.filename)}
                </span>
                <span className="tm">
                  {j.creator} · {j.status}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
