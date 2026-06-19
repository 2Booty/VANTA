import { useEffect, useRef, useState } from "react";
import { api, fileSrc } from "../lib/api";

// Session cache of generated thumbnail URLs, keyed by source path.
// Capped at 500 entries (LRU-style: oldest evicted when full) to prevent
// unbounded memory growth with very large libraries.
const cache = new Map<string, string>();
const CACHE_MAX = 500;

function cacheSet(key: string, val: string) {
  if (cache.size >= CACHE_MAX) {
    // Evict the first entry (oldest insertion order)
    const firstKey = cache.keys().next().value;
    if (firstKey) cache.delete(firstKey);
  }
  cache.set(key, val);
}

/**
 * Shows a cached, downscaled JPEG thumbnail for a photo. The thumbnail is only
 * requested once the tile scrolls near the viewport; until then nothing heavy loads.
 */
export default function Thumb({ path, className }: { path: string; className?: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const requested = useRef(false);
  const [src, setSrc] = useState<string | null>(() => cache.get(path) ?? null);

  useEffect(() => {
    const cached = cache.get(path);
    if (cached) {
      setSrc(cached);
      return;
    }
    setSrc(null);
    requested.current = false;
    const el = wrapRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && !requested.current) {
            requested.current = true;
            api
              .thumb(path)
              .then((p) => {
                const u = fileSrc(p);
                cacheSet(path, u);
                setSrc(u);
              })
              .catch(() => {
                // Fall back to the full-resolution image if thumbnailing fails.
                const u = fileSrc(path);
                cacheSet(path, u);
                setSrc(u);
              });
          }
        }
      },
      { rootMargin: "300px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [path]);

  return (
    <div
      ref={wrapRef}
      className={className}
      style={{ position: "relative", overflow: "hidden", background: "var(--elev)" }}
    >
      {src && (
        <img
          src={src}
          alt=""
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
      )}
    </div>
  );
}
