import { useEffect, useRef, useState } from "react";
import { Film } from "lucide-react";
import { fileSrc } from "../lib/api";

/**
 * Renders a video's frame as a thumbnail. The source is only attached once the
 * tile scrolls near the viewport (IntersectionObserver), and we seek to ~0.5s
 * via a media fragment so a real frame is shown rather than a black poster.
 */
export default function VideoThumb({
  path,
  className,
  onClick,
}: {
  path: string;
  className?: string;
  onClick?: () => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && !el.getAttribute("src")) {
            el.setAttribute("preload", "metadata");
            el.src = fileSrc(path) + "#t=0.5";
            el.load();
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
      className={className}
      onClick={onClick}
      style={{
        position: "relative",
        overflow: "hidden",
        background: "var(--elev)",
        cursor: onClick ? "pointer" : undefined,
      }}
    >
      <video
        ref={ref}
        muted
        playsInline
        preload="none"
        tabIndex={-1}
        onLoadedData={() => setLoaded(true)}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          opacity: loaded ? 1 : 0,
          transition: "opacity .25s",
        }}
      />
      {!loaded && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            color: "var(--faint)",
          }}
        >
          <Film size={20} />
        </div>
      )}
    </div>
  );
}
