import { AnimatePresence, motion } from "framer-motion";
import { Check, AlertCircle } from "lucide-react";
import { useStore } from "../store";

export default function Toasts() {
  const toasts = useStore((s) => s.toasts);
  return (
    <div className="toast-wrap">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            className={`toast ${t.kind === "err" ? "err" : ""}`}
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.96 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
          >
            {t.kind === "err" ? <AlertCircle /> : <Check />}
            <span>{t.msg}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
