import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { useStore } from "../store";

const SHORTCUTS = [
  { keys: "Ctrl + K", desc: "Open command palette" },
  { keys: "?", desc: "Toggle this help" },
  { keys: "← →", desc: "Navigate media in lightbox" },
  { keys: "Space", desc: "Play / pause video" },
  { keys: "F", desc: "Toggle favorite (in lightbox)" },
  { keys: "R", desc: "Reveal in Explorer (in lightbox)" },
  { keys: "S", desc: "Toggle slideshow (in lightbox)" },
  { keys: "Esc", desc: "Close lightbox / menu" },
  { keys: "Ctrl + Shift + H", desc: "Panic — hide & lock VANTA" },
];

export default function KeyboardHelp() {
  const open = useStore((s) => s.keyboardHelpOpen);
  const setOpen = useStore((s) => s.setKeyboardHelpOpen);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="modal-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          onClick={() => setOpen(false)}
        >
          <motion.div
            className="modal"
            style={{ width: 420 }}
            initial={{ opacity: 0, y: 14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <div style={{ flex: 1 }}>
                <div className="mt">Keyboard shortcuts</div>
              </div>
              <button className="icon-btn" onClick={() => setOpen(false)}>
                <X size={15} />
              </button>
            </div>
            <div className="modal-body">
              <div className="kb-list">
                {SHORTCUTS.map((s) => (
                  <div className="kb-row" key={s.keys}>
                    <span className="kb-keys mono">{s.keys}</span>
                    <span className="kb-desc">{s.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
