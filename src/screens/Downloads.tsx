import {
  Pause,
  Play,
  X,
  RotateCcw,
  Trash2,
  Film,
  Image as ImageIcon,
  Ban,
} from "lucide-react";
import { useStore } from "../store";
import { api, type JobStatus } from "../lib/api";
import { formatBytes, formatSpeed, formatETA, fileName } from "../lib/format";

const DOT: Record<JobStatus, string> = {
  active: "var(--accent)",
  queued: "var(--faint)",
  done: "var(--good)",
  skipped: "var(--dim)",
  error: "var(--bad)",
  canceled: "var(--faint)",
  paused: "var(--dim)",
};

export default function Downloads() {
  const jobs = useStore((s) => s.jobs);
  const toast = useStore((s) => s.toast);

  const active = jobs.filter((j) => j.status === "active");
  const paused = jobs.filter((j) => j.status === "paused");
  const queued = jobs.filter((j) => j.status === "queued");
  const failed = jobs.filter((j) => j.status === "error" || j.status === "canceled");
  const doneCount = jobs.filter((j) => j.status === "done" || j.status === "skipped").length;

  return (
    <div className="panel">
      <div className="phead">
        <h1>Downloads</h1>
        <span className="pm mono">
          {active.length} active · {paused.length} paused · {queued.length} queued · {doneCount} done
        </span>
        <div className="right">
          <button className="btn" onClick={() => api.dlPause()}>
            <Pause size={14} /> Pause
          </button>
          <button className="btn" onClick={() => api.dlResume()}>
            <Play size={14} /> Resume
          </button>
          <button className="btn ghost" onClick={() => api.dlClear()}>
            <Trash2 size={14} /> Clear done
          </button>
        </div>
      </div>

      <div className="scroll">
        {jobs.length === 0 ? (
          <div className="empty">
            <ImageIcon />
            <div className="t">No downloads in the queue. Start one from the Library tab.</div>
          </div>
        ) : (
          <>
            {active.map((j) => {
              const pct = j.total > 0 ? Math.min(100, (j.done / j.total) * 100) : 0;
              const eta = j.speed > 0 && j.total > j.done ? (j.total - j.done) / j.speed : 0;
              return (
                <div className="dl-active" key={j.id}>
                  <div className="top">
                    <div style={{ minWidth: 0 }}>
                      <div className="fn">
                        {fileName(j.filename)}
                        {j.retry_count > 0 && (
                          <span
                            className="pillx mono"
                            style={{
                              marginLeft: 8,
                              fontSize: 10,
                              color: "var(--bad)",
                              border: "1px solid var(--bad)",
                            }}
                            title={`This job has been retried ${j.retry_count} time(s)`}
                          >
                            retry #{j.retry_count}
                          </span>
                        )}
                      </div>
                      <div className="sz mono">
                        {j.creator} · {formatBytes(j.done)}
                        {j.total > 0 ? ` / ${formatBytes(j.total)}` : ""}
                      </div>
                    </div>
                    <div className="controls">
                      <div
                        className="icon-btn"
                        title="Pause"
                        onClick={() => api.dlPauseJob(j.id)}
                      >
                        <Pause size={15} />
                      </div>
                      <div className="icon-btn danger" title="Cancel" onClick={() => api.dlCancel(j.id)}>
                        <X size={15} />
                      </div>
                    </div>
                  </div>
                  <div className="track">
                    <div className="fill" style={{ width: `${pct || 4}%` }} />
                  </div>
                  <div className="pl2 mono">
                    <span>{j.kind}</span>
                    <span>
                      {j.total > 0 ? `${Math.round(pct)}%` : "starting..."}
                      {j.speed > 0 ? ` · ${formatSpeed(j.speed)}` : ""}
                      {eta > 0 ? ` · ETA ${formatETA(eta)}` : ""}
                    </span>
                  </div>
                </div>
              );
            })}

            {paused.length > 0 && (
              <div className="sect">
                <h3>Paused · {paused.length} job{paused.length === 1 ? "" : "s"}</h3>
                {paused.map((j) => {
                  const pct = j.total > 0 ? Math.min(100, (j.done / j.total) * 100) : 0;
                  return (
                    <div className="dl-active" key={j.id}>
                      <div className="top">
                        <div style={{ minWidth: 0 }}>
                          <div className="fn">{fileName(j.filename)}</div>
                          <div className="sz mono">
                            {j.creator} · {formatBytes(j.done)}
                            {j.total > 0 ? ` / ${formatBytes(j.total)}` : ""}
                          </div>
                        </div>
                        <div className="controls">
                          <div
                            className="icon-btn"
                            title="Resume"
                            onClick={() => api.dlResumeJob(j.id)}
                          >
                            <Play size={15} />
                          </div>
                          <div className="icon-btn danger" title="Cancel" onClick={() => api.dlCancel(j.id)}>
                            <X size={15} />
                          </div>
                        </div>
                      </div>
                      <div className="track">
                        <div className="fill" style={{ width: `${pct || 4}%`, background: "var(--dim)" }} />
                      </div>
                      <div className="pl2 mono">
                        <span>{j.kind} · paused</span>
                        <span>{j.total > 0 ? `${Math.round(pct)}%` : ""}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {(queued.length > 0 || failed.length > 0) && (
              <div className="sect">
                <h3>
                  Queue · {queued.length} waiting{failed.length ? ` · ${failed.length} failed` : ""}
                </h3>
                {[...failed, ...queued].map((j) => (
                  <div className="q-item" key={j.id}>
                    <span className="qi">
                      {j.kind === "video" ? <Film size={14} /> : <ImageIcon size={14} />}
                    </span>
                    <span className="qn">
                      {fileName(j.filename)}
                      {j.retry_count > 0 && (
                        <span
                          className="mono"
                          style={{ marginLeft: 6, fontSize: 10, color: "var(--bad)" }}
                        >
                          retry #{j.retry_count}
                        </span>
                      )}
                    </span>
                    <span className="qs">
                      <span className="qdot" style={{ background: DOT[j.status] }} />
                      {j.status}
                      <span className="qctrls">
                        {(j.status === "error" || j.status === "canceled") && (
                          <div
                            className="icon-btn"
                            title="Retry"
                            onClick={() => {
                              api.dlRetry(j.id);
                              toast("Retrying...");
                            }}
                          >
                            <RotateCcw size={14} />
                          </div>
                        )}
                        {j.status === "queued" && (
                          <div className="icon-btn danger" title="Cancel" onClick={() => api.dlCancel(j.id)}>
                            <Ban size={14} />
                          </div>
                        )}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
