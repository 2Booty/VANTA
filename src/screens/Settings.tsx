import { useEffect, useState } from "react";
import { Save, RefreshCw, FolderOpen, Check, Gauge, EyeOff, Shield, Eye } from "lucide-react";
import { useStore } from "../store";
import { pickFolder, type Config, type Credentials } from "../lib/api";
import { hashPin } from "../lib/format";
import PinModal from "../components/PinModal";

const THEMES = [
  { id: "graphite", name: "Graphite", a: "#0f0f12", b: "#0b0b0d", acc: "#8C93C9", line: "#2a2a30" },
  { id: "bone", name: "Bone", a: "#e9e5dc", b: "#f1eee7", acc: "#5b5950", line: "#d8d2c5" },
  { id: "clay", name: "Clay", a: "#191510", b: "#14110d", acc: "#C2876A", line: "#322c24" },
];
const ACCENTS = ["#8C93C9", "#C2876A", "#6FBF8E", "#D9A441", "#cf6f8f"];
const QUALITIES = ["source", "720p", "480p", "240p"];
const DENSITIES = [
  { id: "small", label: "Small" },
  { id: "medium", label: "Medium" },
  { id: "large", label: "Large" },
];

export default function Settings() {
  const config = useStore((s) => s.config);
  const theme = useStore((s) => s.config?.theme ?? "graphite");
  const accent = useStore((s) => s.config?.accent ?? "#8C93C9");
  const saveConfig = useStore((s) => s.saveConfig);
  const applyTheme = useStore((s) => s.applyTheme);
  const applyAccent = useStore((s) => s.applyAccent);
  const authenticate = useStore((s) => s.authenticate);
  const patchConfig = useStore((s) => s.patchConfig);
  const lock = useStore((s) => s.lock);

  const [form, setForm] = useState<Config | null>(config);
  const [pinOpen, setPinOpen] = useState(false);
  const [duressOpen, setDuressOpen] = useState(false);
  const [blurCreds, setBlurCreds] = useState(true);
  useEffect(() => {
    if (config && !form) setForm(config);
  }, [config, form]);

  if (!form) {
    return (
      <div className="panel">
        <div className="phead">
          <h1>Settings</h1>
        </div>
      </div>
    );
  }

  const up = (patch: Partial<Config>) => setForm((f) => (f ? { ...f, ...patch } : f));
  const upCred = (patch: Partial<Credentials>) =>
    setForm((f) => (f ? { ...f, credentials: { ...f.credentials, ...patch } } : f));

  const merged = (): Config => {
    const cur = useStore.getState().config;
    return { ...form, theme: cur?.theme ?? form.theme, accent: cur?.accent ?? form.accent };
  };
  const save = () => saveConfig(merged());
  const reconnect = async () => {
    await saveConfig(merged());
    authenticate();
  };
  const browse = async () => {
    const dir = await pickFolder();
    if (dir) up({ download_dir: dir });
  };

  const openPin = () => setPinOpen(true);
  const savePin = async (p: string) => {
    await patchConfig({ pin_hash: await hashPin(p) });
    setPinOpen(false);
  };
  const removePin = () => patchConfig({ pin_hash: "" });

  const saveDuress = async (p: string) => {
    await patchConfig({ duress_pin_hash: await hashPin(p) });
    setDuressOpen(false);
  };
  const removeDuress = () => patchConfig({ duress_pin_hash: "" });

  const bwMB = Math.round((form.bandwidth_limit || 0) / 1048576);

  return (
    <div className="panel">
      <div className="phead">
        <h1>Settings</h1>
        <span className="pm">credentials, appearance &amp; downloads</span>
      </div>

      <div className="scroll">
        {/* Appearance */}
        <div className="sect">
          <h3>Appearance</h3>
          <div className="themes">
            {THEMES.map((t) => (
              <div
                key={t.id}
                className={`theme-card ${theme === t.id ? "on" : ""}`}
                onClick={() => applyTheme(t.id)}
              >
                <div className="theme-prev">
                  <div className="a" style={{ background: t.a }} />
                  <div className="b" style={{ background: t.b }}>
                    <i style={{ background: t.acc, width: "60%" }} />
                    <i style={{ background: t.line, width: "80%" }} />
                    <i style={{ background: t.line, width: "50%" }} />
                  </div>
                </div>
                <div className="tn">
                  {t.name}
                  <span className="ck">
                    <Check />
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 16 }}>
            <label style={{ fontSize: 12, color: "var(--dim)", display: "block", marginBottom: 8 }}>
              Accent
            </label>
            <div className="accents">
              {ACCENTS.map((a) => (
                <div
                  key={a}
                  className={`acc ${accent.toLowerCase() === a.toLowerCase() ? "on" : ""}`}
                  style={{ background: a }}
                  onClick={() => applyAccent(a)}
                />
              ))}
            </div>
          </div>
          <div className="field" style={{ marginTop: 14, marginBottom: 0 }}>
            <label>Grid density</label>
            <select
              className="tfield"
              value={config?.grid_density ?? "medium"}
              onChange={(e) => patchConfig({ grid_density: e.target.value })}
            >
              {DENSITIES.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Credentials */}
        <div className="sect">
          <h3>
            Credentials
            <button
              className="btn ghost"
              style={{ marginLeft: "auto", padding: "4px 10px", fontSize: 11 }}
              onClick={() => setBlurCreds(!blurCreds)}
            >
              {blurCreds ? <Eye size={12} /> : <EyeOff size={12} />}
              {blurCreds ? " Show" : " Hide"}
            </button>
          </h3>
          <div className={blurCreds ? "cred-blur" : ""}>
            <div className="field">
              <label>Cookie</label>
              <div className="hint">Paste from the Datagrabber extension.</div>
              <textarea
                className="tfield"
                rows={3}
                value={form.credentials.cookie}
                onChange={(e) => upCred({ cookie: e.target.value })}
              />
            </div>
            <div className="row2">
              <div className="field">
                <label>x-bc</label>
                <input
                  className="tfield"
                  value={form.credentials.x_bc}
                  onChange={(e) => upCred({ x_bc: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Auth ID</label>
                <input
                  className="tfield"
                  value={form.credentials.auth_id}
                  onChange={(e) => upCred({ auth_id: e.target.value })}
                />
              </div>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>User Agent</label>
              <input
                className="tfield"
                value={form.credentials.user_agent}
                onChange={(e) => upCred({ user_agent: e.target.value })}
              />
            </div>
          </div>
        </div>

        {/* Downloads */}
        <div className="sect">
          <h3>Downloads</h3>
          <div className="field">
            <label>Download folder</label>
            <div style={{ display: "flex", gap: 9 }}>
              <input
                className="tfield"
                value={form.download_dir}
                onChange={(e) => up({ download_dir: e.target.value })}
              />
              <button className="btn" onClick={browse}>
                <FolderOpen size={14} /> Browse
              </button>
            </div>
          </div>
          <div className="row2">
            <div className="field">
              <label>Video quality</label>
              <select
                className="tfield"
                value={form.video_quality}
                onChange={(e) => up({ video_quality: e.target.value })}
              >
                {QUALITIES.map((q) => (
                  <option key={q} value={q}>
                    {q}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Max concurrent downloads</label>
              <input
                className="tfield"
                type="number"
                min={1}
                max={10}
                value={form.max_concurrent}
                onChange={(e) =>
                  up({ max_concurrent: Math.max(1, Math.min(10, Number(e.target.value) || 1)) })
                }
              />
            </div>
          </div>
          <div className="row2">
            <div className="field">
              <label>
                <Gauge size={12} style={{ display: "inline", verticalAlign: "-1px" }} /> Bandwidth limit (MB/s)
              </label>
              <input
                className="tfield"
                type="number"
                min={0}
                value={bwMB}
                onChange={(e) =>
                  patchConfig({
                    bandwidth_limit: Math.max(0, Number(e.target.value) || 0) * 1048576,
                  })
                }
              />
              <div className="hint">0 = unlimited</div>
            </div>
            <div className="field" style={{ display: "flex", alignItems: "flex-end" }}>
              <div
                className="toggle-row"
                onClick={() => up({ overwrite_files: !form.overwrite_files })}
              >
                <div className={`switch ${form.overwrite_files ? "on" : ""}`} />
                Overwrite files
              </div>
            </div>
          </div>
        </div>

        {/* Download filters */}
        <div className="sect">
          <h3>Download filters</h3>
          <div className="hint" style={{ marginBottom: 12 }}>
            Control what gets downloaded. These apply to all downloads and auto-sync.
          </div>
          <div className="toggle-row" onClick={() => patchConfig({ skip_stories: !config?.skip_stories })}>
            <div className={`switch ${config?.skip_stories ? "on" : ""}`} />
            Skip stories
          </div>
          <div className="toggle-row" onClick={() => patchConfig({ skip_messages: !config?.skip_messages })}>
            <div className={`switch ${config?.skip_messages ? "on" : ""}`} />
            Skip messages / DMs
          </div>
          <div className="toggle-row" onClick={() => patchConfig({ photos_only: !config?.photos_only })}>
            <div className={`switch ${config?.photos_only ? "on" : ""}`} />
            Photos only
          </div>
          <div className="toggle-row" onClick={() => patchConfig({ videos_only: !config?.videos_only })}>
            <div className={`switch ${config?.videos_only ? "on" : ""}`} />
            Videos only
          </div>
          <div className="toggle-row" onClick={() => patchConfig({ paid_only: !config?.paid_only })}>
            <div className={`switch ${config?.paid_only ? "on" : ""}`} />
            Paid content only
          </div>
          <div className="toggle-row" onClick={() => patchConfig({ free_only: !config?.free_only })}>
            <div className={`switch ${config?.free_only ? "on" : ""}`} />
            Free content only
          </div>
          <div className="field" style={{ marginTop: 14, marginBottom: 0 }}>
            <label>Only download content posted after</label>
            <input
              className="tfield"
              type="date"
              value={config?.since_date ?? ""}
              onChange={(e) => patchConfig({ since_date: e.target.value })}
            />
            <div className="hint">Leave empty to download everything</div>
          </div>
        </div>

        {/* Automation */}
        <div className="sect">
          <h3>Automation</h3>
          <div
            className="toggle-row"
            onClick={() => patchConfig({ auto_sync_enabled: !config?.auto_sync_enabled })}
          >
            <div className={`switch ${config?.auto_sync_enabled ? "on" : ""}`} />
            Auto-sync new content in the background
          </div>
          <div className="row2" style={{ marginTop: 12 }}>
            <div className="field">
              <label>Check every (hours)</label>
              <input
                className="tfield"
                type="number"
                min={1}
                max={168}
                value={config?.auto_sync_hours ?? 12}
                onChange={(e) =>
                  patchConfig({
                    auto_sync_hours: Math.max(1, Math.min(168, Number(e.target.value) || 12)),
                  })
                }
              />
            </div>
            <div className="field" style={{ display: "flex", alignItems: "flex-end" }}>
              <div
                className="toggle-row"
                onClick={() => patchConfig({ auto_sync_new_only: !config?.auto_sync_new_only })}
              >
                <div className={`switch ${config?.auto_sync_new_only ? "on" : ""}`} />
                New files only
              </div>
            </div>
          </div>
        </div>

        {/* Privacy */}
        <div className="sect">
          <h3>
            <Shield size={13} style={{ verticalAlign: "-2px", marginRight: 6 }} />
            Privacy
          </h3>
          <div
            className="toggle-row"
            onClick={() => patchConfig({ blur_thumbs: !config?.blur_thumbs })}
          >
            <div className={`switch ${config?.blur_thumbs ? "on" : ""}`} />
            Blur thumbnails until hover
          </div>
          <div
            className="toggle-row"
            style={{ marginTop: 10 }}
            onClick={() => patchConfig({ lock_on_blur: !config?.lock_on_blur })}
          >
            <div className={`switch ${config?.lock_on_blur ? "on" : ""}`} />
            Lock when the window loses focus
          </div>
          <div className="field" style={{ marginTop: 14 }}>
            <label>Auto-lock after inactivity (minutes)</label>
            <input
              className="tfield"
              type="number"
              min={0}
              max={480}
              value={config?.auto_lock_minutes ?? 0}
              onChange={(e) =>
                patchConfig({
                  auto_lock_minutes: Math.max(0, Math.min(480, Number(e.target.value) || 0)),
                })
              }
            />
            <div className="hint">0 = disabled</div>
          </div>
          <div className="field" style={{ marginTop: 14 }}>
            <label>Panic hotkey (hide &amp; lock)</label>
            <input
              className="tfield"
              value={config?.panic_hotkey ?? ""}
              onChange={(e) => patchConfig({ panic_hotkey: e.target.value })}
            />
            <div className="hint">
              e.g. CmdOrCtrl+Shift+H — press anywhere to instantly hide &amp; lock; press again to
              bring VANTA back.
            </div>
          </div>
          <div
            className="toggle-row"
            style={{ marginTop: 10 }}
            onClick={() => patchConfig({ clear_on_panic: !config?.clear_on_panic })}
          >
            <div className={`switch ${config?.clear_on_panic ? "on" : ""}`} />
            Clear activity &amp; clipboard on panic
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
            {config?.pin_hash ? (
              <>
                <button className="btn" onClick={openPin}>
                  Change PIN
                </button>
                <button className="btn ghost" onClick={removePin}>
                  Remove PIN
                </button>
                <button className="btn" onClick={lock}>
                  Lock now
                </button>
              </>
            ) : (
              <button className="btn" onClick={openPin}>
                Set a PIN lock
              </button>
            )}
          </div>
          {/* Duress PIN */}
          <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--line)" }}>
            <div style={{ fontSize: 12, color: "var(--dim)", marginBottom: 6 }}>
              <EyeOff size={11} style={{ display: "inline", verticalAlign: "-1px" }} /> Duress PIN
            </div>
            <div className="hint" style={{ marginBottom: 8 }}>
              Entering this PIN unlocks VANTA but shows an empty library — use under pressure.
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              {config?.duress_pin_hash ? (
                <>
                  <button className="btn" onClick={() => setDuressOpen(true)}>
                    Change duress PIN
                  </button>
                  <button className="btn ghost" onClick={removeDuress}>
                    Remove
                  </button>
                </>
              ) : (
                <button className="btn" onClick={() => setDuressOpen(true)}>
                  Set duress PIN
                </button>
              )}
            </div>
          </div>
          {/* Stealth mode */}
          <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--line)" }}>
            <div style={{ fontSize: 12, color: "var(--dim)", marginBottom: 6 }}>
              <EyeOff size={11} style={{ display: "inline", verticalAlign: "-1px" }} /> Stealth mode
            </div>
            <div
              className="toggle-row"
              onClick={() => patchConfig({ stealth_mode: !config?.stealth_mode })}
            >
              <div className={`switch ${config?.stealth_mode ? "on" : ""}`} />
              Disguise window title in taskbar
            </div>
            {config?.stealth_mode && (
              <div className="field" style={{ marginTop: 10, marginBottom: 0 }}>
                <label>Disguised title</label>
                <input
                  className="tfield"
                  value={config?.stealth_title ?? "Files"}
                  onChange={(e) => patchConfig({ stealth_title: e.target.value })}
                />
              </div>
            )}
          </div>
        </div>

        {/* Platform */}
        <div className="sect">
          <h3>Platform</h3>
          <div
            className="toggle-row"
            onClick={() => patchConfig({ close_to_tray: !config?.close_to_tray })}
          >
            <div className={`switch ${config?.close_to_tray ? "on" : ""}`} />
            Close to system tray (keep running in background)
          </div>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn pri" onClick={save}>
            <Save size={14} /> Save settings
          </button>
          <button className="btn" onClick={reconnect}>
            <RefreshCw size={14} /> Save &amp; reconnect
          </button>
        </div>
      </div>
      <PinModal
        open={pinOpen}
        onClose={() => setPinOpen(false)}
        onSave={savePin}
      />
      <PinModal
        open={duressOpen}
        onClose={() => setDuressOpen(false)}
        onSave={saveDuress}
        title="Set duress PIN"
        subtitle="Unlocks VANTA with an empty library"
      />
    </div>
  );
}
