import { useEffect, useRef, useState, type FormEvent } from "react";
import { Lock } from "lucide-react";
import { useStore } from "../store";
import { verifyPin } from "../lib/format";

export default function LockScreen() {
  const locked = useStore((s) => s.locked);
  const pinHash = useStore((s) => s.config?.pin_hash ?? "");
  const duressHash = useStore((s) => s.config?.duress_pin_hash ?? "");
  const unlock = useStore((s) => s.unlock);
  const scanLibrary = useStore((s) => s.scanLibrary);
  const [pin, setPin] = useState("");
  const [err, setErr] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (locked) {
      setPin("");
      setErr(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [locked]);

  if (!locked || !pinHash) return null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    // Try real PIN first
    if (await verifyPin(pin, pinHash)) {
      unlock();
      setPin("");
      scanLibrary(); // Reload library after unlock
      return;
    }
    // Try duress PIN — unlocks but shows empty library
    if (duressHash && (await verifyPin(pin, duressHash))) {
      unlock();
      setPin("");
      // Don't load media — gallery stays empty (duress mode)
      useStore.setState({ media: [] });
      return;
    }
    setErr(true);
    setPin("");
  };

  return (
    <div className="lockscreen">
      <div className="lock-box">
        <div className="lock-mark">
          <Lock size={24} />
        </div>
        <div className="lock-title">VANTA is locked</div>
        <form onSubmit={submit}>
          <input
            ref={inputRef}
            className={`lock-input ${err ? "err" : ""}`}
            type="password"
            inputMode="numeric"
            placeholder="Enter PIN"
            value={pin}
            onChange={(e) => {
              setPin(e.target.value);
              setErr(false);
            }}
          />
          <button
            className="btn pri"
            type="submit"
            style={{ width: "100%", justifyContent: "center", marginTop: 10 }}
          >
            Unlock
          </button>
        </form>
        {err && <div className="lock-err">Incorrect PIN</div>}
      </div>
    </div>
  );
}
