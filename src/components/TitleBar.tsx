import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Square, X } from "lucide-react";
import { useStore } from "../store";

export default function TitleBar() {
  const authStatus = useStore((s) => s.authStatus);
  const me = useStore((s) => s.me);
  const win = getCurrentWindow();

  const conn =
    authStatus === "ok"
      ? { cls: "ok", txt: `Connected · @${me?.username ?? ""}` }
      : authStatus === "loading"
      ? { cls: "warn", txt: "Connecting..." }
      : authStatus === "error"
      ? { cls: "err", txt: "Auth error" }
      : { cls: "", txt: "Disconnected" };

  return (
    <div className="titlebar" data-tauri-drag-region>
      <span className="wm">VANTA</span>
      <span className={`conn ${conn.cls}`}>
        <span className="dot" />
        {conn.txt}
      </span>
      <div className="spacer" data-tauri-drag-region />
      <div className="win-ctrls">
        <button className="cb" onClick={() => win.minimize()} title="Minimize">
          <Minus size={15} />
        </button>
        <button className="cb" onClick={() => win.toggleMaximize()} title="Maximize">
          <Square size={12} />
        </button>
        <button className="cb x" onClick={() => win.close()} title="Close">
          <X size={15} />
        </button>
      </div>
    </div>
  );
}
