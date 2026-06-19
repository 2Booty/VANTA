import { useEffect, useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import { Lock, X } from "lucide-react";

export default function PinModal({
  open,
  onClose,
  onSave,
  title = "Set a PIN",
  subtitle = "You'll enter this to unlock VANTA",
}: {
  open: boolean;
  onClose: () => void;
  onSave: (pin: string) => void;
  title?: string;
  subtitle?: string;
}) {
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    if (open) {
      setPin("");
      setConfirm("");
      setErr("");
    }
  }, [open]);

  if (!open) return null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!pin) {
      setErr("Enter a PIN");
      return;
    }
    if (pin !== confirm) {
      setErr("PINs don't match");
      return;
    }
    onSave(pin);
  };

  return (
    <motion.div
      className="modal-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15 }}
      onClick={onClose}
    >
      <motion.div
        className="modal"
        style={{ width: 360 }}
        initial={{ opacity: 0, y: 14, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <Lock size={18} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="mt">{title}</div>
            <div className="ms">{subtitle}</div>
          </div>
          <button className="icon-btn" onClick={onClose}>
            <X size={15} />
          </button>
        </div>
        <form onSubmit={submit}>
          <div className="modal-body">
            <input
              className="lock-input"
              type="password"
              inputMode="numeric"
              autoFocus
              placeholder="New PIN"
              value={pin}
              onChange={(e) => {
                setPin(e.target.value);
                setErr("");
              }}
            />
            <input
              className="lock-input"
              style={{ marginTop: 10 }}
              type="password"
              inputMode="numeric"
              placeholder="Confirm PIN"
              value={confirm}
              onChange={(e) => {
                setConfirm(e.target.value);
                setErr("");
              }}
            />
            {err && (
              <div className="lock-err" style={{ textAlign: "left" }}>
                {err}
              </div>
            )}
          </div>
          <div className="modal-foot">
            <button type="button" className="btn ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn pri">
              Save PIN
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}
