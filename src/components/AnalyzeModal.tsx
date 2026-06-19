import { useState } from "react";
import { motion } from "framer-motion";
import {
  X,
  Download,
  DownloadCloud,
  Image as ImageIcon,
  Film,
  Music,
  FileQuestion,
  HardDrive,
  Check,
} from "lucide-react";
import { useStore } from "../store";
import { formatBytes } from "../lib/format";

export default function AnalyzeModal() {
  const a = useStore((s) => s.analyze);
  const startPlan = useStore((s) => s.startPlan);
  const cancelAnalyze = useStore((s) => s.cancelAnalyze);
  const closeAnalyze = useStore((s) => s.closeAnalyze);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());

  if (!a.open) return null;

  const title = a.mode === "all" ? "Analyzing all creators" : `Analyzing @${a.label}`;
  const running = a.status === "running";
  const plan = a.plan;
  const sizingPct = a.sizeTotal > 0 ? (a.sized / a.sizeTotal) * 100 : 0;
  const lowSpace = !!plan && plan.free_bytes > 0 && plan.new_bytes > plan.free_bytes;

  const confirmStart = (onlyNew: boolean, creators?: string[]) => {
    if (
      lowSpace &&
      !window.confirm(
        `This needs about ${formatBytes(plan!.new_bytes)} but only ${formatBytes(
          plan!.free_bytes,
        )} is free. Continue anyway?`,
      )
    )
      return;
    startPlan(onlyNew, creators);
    setExcluded(new Set());
  };

  const toggleCreator = (name: string) => {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const includedCount = plan?.breakdown?.filter((b) => !excluded.has(b.username)).length ?? 0;

  return (
    <motion.div
      className="modal-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15 }}
      onClick={() => !running && closeAnalyze()}
    >
      <motion.div
        className="modal"
        style={{ width: 520 }}
        initial={{ opacity: 0, y: 14, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <DownloadCloud size={18} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="mt">{title}</div>
            <div className="ms">
              {running
                ? "Working out exactly what to download..."
                : a.status === "error"
                ? "Something went wrong"
                : "Here's the plan"}
            </div>
          </div>
          <button className="icon-btn" onClick={() => (running ? cancelAnalyze() : closeAnalyze())}>
            <X size={15} />
          </button>
        </div>

        <div className="modal-body" style={{ maxHeight: "60vh", overflowY: "auto" }}>
          {a.status === "error" ? (
            <div className="banner err">
              <div className="bd">{a.error}</div>
            </div>
          ) : running ? (
            <>
              <div className="analyze-phase">
                <div className="spinner" />
                <div>
                  {a.phase === "sizing" ? (
                    <>
                      Calculating sizes...{" "}
                      <b style={{ color: "var(--ink)" }}>
                        {a.sized}/{a.sizeTotal}
                      </b>
                    </>
                  ) : (
                    <>
                      Fetching posts, stories &amp; messages
                      {a.creatorTotal > 1 ? ` (creator ${a.creatorIndex}/${a.creatorTotal})` : ""}...
                    </>
                  )}
                  {a.current && a.mode === "all" ? (
                    <div style={{ fontSize: 11.5, color: "var(--faint)", marginTop: 2 }}>
                      @{a.current}
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="track">
                {a.phase === "sizing" ? (
                  <div className="fill" style={{ width: `${Math.max(4, sizingPct)}%` }} />
                ) : (
                  <div className="fill indet" />
                )}
              </div>
              <div className="pl2 mono" style={{ marginTop: 8 }}>
                <span>{a.itemsFound} media found</span>
                <span>~{formatBytes(a.liveBytes)}</span>
              </div>
            </>
          ) : plan ? (
            <>
              <div className="plan-grid">
                <div className="plan-stat hl">
                  <div className="v">
                    {plan.new_items}
                    <small> new</small>
                  </div>
                  <div className="l">to download · ~{formatBytes(plan.new_bytes)}</div>
                </div>
                <div className="plan-stat">
                  <div className="v">{plan.total_items}</div>
                  <div className="l">
                    total media · {plan.existing_items} already saved
                  </div>
                </div>
              </div>
              <div className="plan-stat" style={{ marginBottom: 14 }}>
                <div className="v">{formatBytes(plan.total_bytes)}</div>
                <div className="l">
                  full size if you scrape everything
                  {plan.creators > 1 ? ` · ${plan.creators} creators` : ""}
                </div>
              </div>
              {plan.free_bytes > 0 && (
                <div className={`disk-row ${lowSpace ? "low" : ""}`}>
                  <HardDrive size={13} /> {formatBytes(plan.free_bytes)} free on disk
                  {lowSpace && <span> — not enough for ~{formatBytes(plan.new_bytes)}</span>}
                </div>
              )}
              <div className="breakdown">
                <span>
                  <ImageIcon size={12} /> <b>{plan.photos}</b> photos
                </span>
                <span>
                  <Film size={12} /> <b>{plan.videos}</b> videos
                </span>
                {plan.audios > 0 && (
                  <span>
                    <Music size={12} /> <b>{plan.audios}</b> audio
                  </span>
                )}
                {plan.other > 0 && (
                  <span>
                    <FileQuestion size={12} /> <b>{plan.other}</b> other
                  </span>
                )}
              </div>

              {/* Per-creator breakdown with selective download */}
              {plan.breakdown.length > 1 && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontSize: 12, color: "var(--dim)", marginBottom: 8 }}>
                    Per-creator breakdown — uncheck to skip
                  </div>
                  {plan.breakdown.map((b) => (
                    <div
                      key={b.username}
                      className={`breakdown-row ${excluded.has(b.username) ? "excluded" : ""}`}
                      onClick={() => toggleCreator(b.username)}
                    >
                      <div className={`br-check ${!excluded.has(b.username) ? "on" : ""}`}>
                        <Check size={11} />
                      </div>
                      <span className="br-name">{b.username}</span>
                      <span className="br-stats mono">
                        {b.new > 0 ? `${b.new} new` : `${b.total} total`}
                        {b.new_bytes > 0 && ` · ~${formatBytes(b.new_bytes)}`}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : null}
        </div>

        {running ? (
          <div className="modal-foot">
            <button className="btn ghost" onClick={cancelAnalyze}>
              Cancel
            </button>
          </div>
        ) : a.status === "error" ? (
          <div className="modal-foot">
            <button className="btn ghost" onClick={closeAnalyze}>
              Close
            </button>
          </div>
        ) : plan ? (
          <div className="modal-foot">
            <button className="btn ghost" onClick={closeAnalyze}>
              Close
            </button>
            <button
              className="btn"
              onClick={() => confirmStart(false)}
              disabled={plan.total_items === 0}
            >
              <DownloadCloud size={14} /> Everything ({plan.total_items})
            </button>
            <button
              className="btn pri"
              onClick={() =>
                confirmStart(
                  true,
                  plan.breakdown.length > 1
                    ? plan.breakdown
                        .filter((b) => !excluded.has(b.username))
                        .map((b) => b.username)
                    : undefined,
                )
              }
              disabled={plan.new_items === 0 || includedCount === 0}
            >
              <Download size={14} /> Download new ({plan.new_items})
            </button>
          </div>
        ) : null}
      </motion.div>
    </motion.div>
  );
}
