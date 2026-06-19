import { useEffect, useMemo, type ReactNode } from "react";
import {
  BarChart3,
  Image as ImageIcon,
  Film,
  DollarSign,
  Users,
  Download,
  AlertTriangle,
  FileDown,
  CheckCircle2,
  XCircle,
  Clock,
} from "lucide-react";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { useStore } from "../store";
import { formatBytes, formatTime, toCSV } from "../lib/format";
import { saveFile, type MediaEntry } from "../lib/api";

function Bar({ label, value, max, display }: { label: string; value: number; max: number; display: string }) {
  const pct = max > 0 ? Math.max(2, (value / max) * 100) : 0;
  return (
    <div className="bar-row">
      <span className="bar-label">{label}</span>
      <div className="bar-track">
        <div className="bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="bar-val mono">{display}</span>
    </div>
  );
}

function ProgressBar({ saved, total }: { saved: number; total: number }) {
  const pct = total > 0 ? Math.min(100, (saved / total) * 100) : 0;
  return (
    <div className="bar-track" style={{ marginTop: 4 }}>
      <div className="bar-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

const STATUS_ICON: Record<string, ReactNode> = {
  done: <CheckCircle2 size={13} style={{ color: "var(--ok, #4ade80)" }} />,
  error: <XCircle size={13} style={{ color: "var(--err, #f87171)" }} />,
  skipped: <Clock size={13} style={{ color: "var(--faint, #888)" }} />,
};

export default function Insights() {
  const media = useStore((s) => s.media);
  const subs = useStore((s) => s.subs);
  const downloadLog = useStore((s) => s.downloadLog);
  const loadDownloadLog = useStore((s) => s.loadDownloadLog);
  const toast = useStore((s) => s.toast);

  // Load download log on mount
  useEffect(() => {
    loadDownloadLog();
  }, [loadDownloadLog]);

  const s = useMemo(() => {
    const bytes = media.reduce((a, m) => a + m.bytes, 0);
    const photos = media.filter((m) => m.kind === "photo");
    const videos = media.filter((m) => m.kind === "video");
    const paid = media.filter((m) => m.is_paid);
    const free = media.filter((m) => !m.is_paid);

    const byCreator = new Map<string, number>();
    media.forEach((m) => byCreator.set(m.creator, (byCreator.get(m.creator) || 0) + m.bytes));
    const creators = [...byCreator.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);

    const byMonth = new Map<string, number>();
    media.forEach((m) => {
      const d = new Date(m.modified * 1000);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      byMonth.set(key, (byMonth.get(key) || 0) + 1);
    });
    const months = [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-12);

    return {
      total: media.length,
      bytes,
      photos: photos.length,
      videos: videos.length,
      paidCount: paid.length,
      freeCount: free.length,
      paidBytes: paid.reduce((a, m) => a + m.bytes, 0),
      freeBytes: free.reduce((a, m) => a + m.bytes, 0),
      creators,
      months,
      creatorCount: byCreator.size,
    };
  }, [media]);

  // Missing-content detection: count saved media per creator, compare to subs[i].postsCount
  const coverage = useMemo(() => {
    const savedByCreator = new Map<string, number>();
    media.forEach((m) => savedByCreator.set(m.creator, (savedByCreator.get(m.creator) || 0) + 1));
    return subs
      .map((u) => {
        const key = u.username || u.name || "";
        const total = u.postsCount || 0;
        const saved = savedByCreator.get(key) || 0;
        return { name: key || u.name || "—", total, saved };
      })
      .filter((c) => c.total > 0)
      .sort((a, b) => b.total - a.total);
  }, [media, subs]);

  // Recent download log entries (last 20)
  const recentLog = useMemo(
    () => (downloadLog || []).slice(0, 20),
    [downloadLog],
  );

  const maxCreator = s.creators.length ? s.creators[0][1] : 0;
  const maxMonth = s.months.reduce((a, [, v]) => Math.max(a, v), 0);

  // Paid content in GB (one decimal)
  const paidGB = (s.paidBytes / 1024 / 1024 / 1024).toFixed(1);

  async function handleExport() {
    if (media.length === 0) {
      toast("Nothing to export", "err");
      return;
    }
    const rows: Record<string, unknown>[] = media.map((m: MediaEntry) => ({
      path: m.path,
      creator: m.creator,
      kind: m.kind,
      is_paid: m.is_paid,
      bytes: m.bytes,
      modified: m.modified,
      favorite: m.favorite,
      rating: m.rating,
      tags: Array.isArray(m.tags) ? m.tags.join("|") : "",
    }));
    const csv = toCSV(rows);
    try {
      const dest = await saveFile("vanta-library.csv");
      if (!dest) return; // user cancelled
      await writeTextFile(dest, csv);
      toast(`Exported ${rows.length} items to CSV`);
    } catch (e) {
      toast(String(e), "err");
    }
  }

  return (
    <div className="panel">
      <div className="phead">
        <h1>Insights</h1>
        <span className="pm">your library at a glance</span>
        <button
          onClick={handleExport}
          title="Export library to CSV"
          style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6 }}
        >
          <FileDown size={14} />
          Export
        </button>
      </div>

      <div className="scroll">
        {media.length === 0 ? (
          <div className="empty">
            <BarChart3 />
            <div className="t">Nothing to chart yet. Download some content first.</div>
          </div>
        ) : (
          <>
            <div className="stats">
              <div className="tile">
                <div className="v">{s.total}</div>
                <div className="l">Total items</div>
              </div>
              <div className="tile">
                <div className="v">
                  {formatBytes(s.bytes).split(" ")[0]}
                  <small> {formatBytes(s.bytes).split(" ")[1]}</small>
                </div>
                <div className="l">Storage used</div>
              </div>
              <div className="tile">
                <div className="v">{s.creatorCount}</div>
                <div className="l">Creators</div>
              </div>
              <div className="tile">
                <div className="v">{maxMonth ? Math.round(s.total / Math.max(1, s.months.length)) : 0}</div>
                <div className="l">Avg / month</div>
              </div>
            </div>

            <div className="stats">
              <div className="tile">
                <div className="v" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <ImageIcon size={18} /> {s.photos}
                </div>
                <div className="l">Photos</div>
              </div>
              <div className="tile">
                <div className="v" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Film size={18} /> {s.videos}
                </div>
                <div className="l">Videos</div>
              </div>
              <div className="tile">
                <div className="v" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <DollarSign size={18} /> {s.paidCount}
                </div>
                <div className="l">Paid · {formatBytes(s.paidBytes)}</div>
              </div>
              <div className="tile">
                <div className="v">{s.freeCount}</div>
                <div className="l">Free · {formatBytes(s.freeBytes)}</div>
              </div>
            </div>

            {/* Paid content tracker */}
            <div className="sect">
              <h3>
                <DollarSign size={13} style={{ verticalAlign: "-2px", marginRight: 6 }} />
                Paid content tracker
              </h3>
              <div style={{ color: "var(--fg, #ddd)", fontSize: 14, lineHeight: 1.6 }}>
                You've archived{" "}
                <strong style={{ color: "var(--accent, #6ee7b7)" }}>{s.paidCount}</strong> paid items
                totaling <strong style={{ color: "var(--accent, #6ee7b7)" }}>{paidGB} GB</strong>.
              </div>
            </div>

            <div className="sect">
              <h3>
                <Users size={13} style={{ verticalAlign: "-2px", marginRight: 6 }} />
                Storage by creator
              </h3>
              {s.creators.map(([name, val]) => (
                <Bar key={name} label={name} value={val} max={maxCreator} display={formatBytes(val)} />
              ))}
            </div>

            <div className="sect">
              <h3>Items added over time</h3>
              {s.months.length === 0 ? (
                <div style={{ color: "var(--faint)", fontSize: 13 }}>No dated items.</div>
              ) : (
                s.months.map(([month, count]) => (
                  <Bar key={month} label={month} value={count} max={maxMonth} display={String(count)} />
                ))
              )}
            </div>

            {/* Missing content detection */}
            <div className="sect">
              <h3>
                <AlertTriangle size={13} style={{ verticalAlign: "-2px", marginRight: 6 }} />
                Content coverage
              </h3>
              {coverage.length === 0 ? (
                <div style={{ color: "var(--faint)", fontSize: 13 }}>
                  No subscription data. Load subscriptions to see coverage.
                </div>
              ) : (
                coverage.map((c) => (
                  <div key={c.name} className="bar-row" style={{ display: "block", marginBottom: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                      <span className="bar-label">{c.name}</span>
                      <span className="bar-val mono" style={{ color: c.saved >= c.total ? "var(--ok, #4ade80)" : "var(--faint, #888)" }}>
                        {c.saved}/{c.total} posts saved
                      </span>
                    </div>
                    <ProgressBar saved={c.saved} total={c.total} />
                  </div>
                ))
              )}
            </div>

            {/* Download history */}
            <div className="sect">
              <h3>
                <Download size={13} style={{ verticalAlign: "-2px", marginRight: 6 }} />
                Download history
              </h3>
              {recentLog.length === 0 ? (
                <div style={{ color: "var(--faint)", fontSize: 13 }}>No downloads logged yet.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {recentLog.map((entry) => (
                    <div
                      key={entry.id}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "auto 1fr auto auto",
                        gap: 10,
                        alignItems: "center",
                        padding: "6px 8px",
                        borderRadius: 6,
                        background: "var(--card, rgba(255,255,255,0.03))",
                        fontSize: 13,
                      }}
                    >
                      {STATUS_ICON[entry.status] || <Clock size={13} style={{ color: "var(--faint, #888)" }} />}
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={entry.filename}>
                        {entry.filename}
                      </span>
                      <span style={{ color: "var(--faint, #888)", fontSize: 12 }}>{entry.creator}</span>
                      <span style={{ color: "var(--faint, #888)", fontSize: 12 }} className="mono">
                        {formatTime(entry.timestamp)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
