import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  X,
  ChevronLeft,
  ChevronRight,
  Star,
  FolderOpen,
  ZoomIn,
  ZoomOut,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize2,
  Music,
  RotateCcw,
  RotateCw,
  Camera,
  Gauge,
  Clapperboard,
} from "lucide-react";
import { useStore } from "../store";
import { fileSrc, reveal } from "../lib/api";
import { fileName, formatBytes } from "../lib/format";
import VideoThumb from "./VideoThumb";

function fmt(s: number): string {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

const SPEEDS = [0.5, 1, 1.25, 1.5, 2];

function ImagePane({ src }: { src: string }) {
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [rot, setRot] = useState(0);
  const drag = useRef<{ x: number; y: number } | null>(null);

  const zoomIn = () => setScale((s) => Math.min(4, +(s + 0.5).toFixed(2)));
  const zoomOut = () =>
    setScale((s) => {
      const n = Math.max(1, +(s - 0.5).toFixed(2));
      if (n === 1) setPan({ x: 0, y: 0 });
      return n;
    });

  const rotateLeft = () => setRot((r) => r - 90);
  const rotateRight = () => setRot((r) => r + 90);

  return (
    <>
      <img
        className={`lb-img ${scale > 1 ? "zoomed" : ""}`}
        src={src}
        draggable={false}
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) rotate(${rot}deg) scale(${scale})`,
        }}
        onMouseDown={(e) => {
          if (scale <= 1) return;
          drag.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
        }}
        onMouseMove={(e) => {
          if (!drag.current) return;
          setPan({ x: e.clientX - drag.current.x, y: e.clientY - drag.current.y });
        }}
        onMouseUp={() => (drag.current = null)}
        onMouseLeave={() => (drag.current = null)}
        onDoubleClick={() => {
          if (scale > 1) {
            setScale(1);
            setPan({ x: 0, y: 0 });
          } else setScale(2);
        }}
      />
      <div className="zoomwrap">
        <button className="zb" onClick={zoomOut} title="Zoom out">
          <ZoomOut />
        </button>
        <span className="zl mono">{Math.round(scale * 100)}%</span>
        <button className="zb" onClick={zoomIn} title="Zoom in">
          <ZoomIn />
        </button>
        <button className="zb" onClick={rotateLeft} title="Rotate left">
          <RotateCcw />
        </button>
        <button className="zb" onClick={rotateRight} title="Rotate right">
          <RotateCw />
        </button>
      </div>
    </>
  );
}

function VideoPlayer({ src }: { src: string }) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const [playing, setPlaying] = useState(true);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  const [buf, setBuf] = useState(0);
  const [vol, setVol] = useState(1);
  const [speedIdx, setSpeedIdx] = useState(1);

  const toggle = () => {
    const v = ref.current;
    if (!v) return;
    if (v.paused) v.play();
    else v.pause();
  };

  const cycleSpeed = () => {
    setSpeedIdx((i) => {
      const next = (i + 1) % SPEEDS.length;
      const v = ref.current;
      if (v) v.playbackRate = SPEEDS[next];
      return next;
    });
  };

  useEffect(() => {
    const v = ref.current;
    if (v) v.playbackRate = SPEEDS[speedIdx];
  }, [speedIdx]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === " ") {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const v = ref.current;
    if (!v || !dur) return;
    const r = e.currentTarget.getBoundingClientRect();
    v.currentTime = ((e.clientX - r.left) / r.width) * dur;
  };
  const setVolume = (e: React.MouseEvent<HTMLDivElement>) => {
    const v = ref.current;
    if (!v) return;
    const r = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    v.volume = ratio;
    v.muted = ratio === 0;
    setVol(ratio);
  };

  const captureFrame = () => {
    const v = ref.current;
    if (!v) return;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const base = fileName(src) || "frame";
      const t = v.currentTime ? v.currentTime.toFixed(1) : "0";
      a.href = url;
      a.download = `${base}_frame_${t}s.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, "image/png");
  };

  return (
    <div style={{ position: "relative", maxWidth: "100%", maxHeight: "100%", display: "flex" }}>
      <video
        ref={ref}
        className="lb-video"
        src={src}
        autoPlay
        onClick={toggle}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={() => ref.current && setCur(ref.current.currentTime)}
        onLoadedMetadata={() => {
          if (ref.current) {
            setDur(ref.current.duration || 0);
            ref.current.playbackRate = SPEEDS[speedIdx];
          }
        }}
        onProgress={() => {
          const v = ref.current;
          if (v && v.buffered.length) setBuf(v.buffered.end(v.buffered.length - 1));
        }}
      />
      <div className="vctl">
        <div className="vscrub" onClick={seek}>
          <div className="vbuf" style={{ width: dur ? `${(buf / dur) * 100}%` : "0%" }} />
          <div className="vplay" style={{ width: dur ? `${(cur / dur) * 100}%` : "0%" }}>
            <div className="knob" />
          </div>
        </div>
        <div className="vrow">
          <button className="vb" onClick={toggle}>
            {playing ? <Pause /> : <Play />}
          </button>
          <span className="vt mono">
            {fmt(cur)} / {fmt(dur)}
          </span>
          <span className="vsp" />
          <button className="vb" onClick={cycleSpeed} title="Playback speed">
            <Gauge />
            <span className="mono" style={{ marginLeft: 4, fontSize: 11 }}>
              {SPEEDS[speedIdx]}x
            </span>
          </button>
          <button className="vb" onClick={captureFrame} title="Capture frame">
            <Camera />
          </button>
          <span className="vsp" />
          <button
            className="vb"
            onClick={() => {
              const v = ref.current;
              if (!v) return;
              v.muted = !v.muted;
              setVol(v.muted ? 0 : v.volume || 1);
            }}
          >
            {vol === 0 ? <VolumeX /> : <Volume2 />}
          </button>
          <div className="vvol" onClick={setVolume}>
            <div className="vvf" style={{ width: `${vol * 100}%` }} />
          </div>
          <button className="vb" onClick={() => ref.current?.requestFullscreen?.()}>
            <Maximize2 />
          </button>
        </div>
      </div>
    </div>
  );
}

function AudioPlayer({ src }: { src: string }) {
  const ref = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  const [vol, setVol] = useState(1);

  const toggle = () => {
    const a = ref.current;
    if (!a) return;
    if (a.paused) a.play();
    else a.pause();
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const a = ref.current;
    if (!a || !dur) return;
    const r = e.currentTarget.getBoundingClientRect();
    a.currentTime = ((e.clientX - r.left) / r.width) * dur;
  };
  const setVolume = (e: React.MouseEvent<HTMLDivElement>) => {
    const a = ref.current;
    if (!a) return;
    const r = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    a.volume = ratio;
    a.muted = ratio === 0;
    setVol(ratio);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === " ") {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div
      className="ap"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 24,
        width: "min(560px, 90vw)",
        padding: "40px 24px",
        background: "rgba(0,0,0,0.35)",
        borderRadius: 16,
      }}
    >
      <div
        style={{
          width: 140,
          height: 140,
          borderRadius: "50%",
          background: "linear-gradient(135deg, #444 0%, #111 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
        }}
      >
        <Music size={56} color="#888" />
      </div>

      <audio
        ref={ref}
        src={src}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={() => ref.current && setCur(ref.current.currentTime)}
        onLoadedMetadata={() => ref.current && setDur(ref.current.duration || 0)}
      />

      <div
        className="vscrub"
        onClick={seek}
        style={{ width: "100%", height: 6, cursor: "pointer", background: "rgba(255,255,255,0.15)", borderRadius: 3, position: "relative" }}
      >
        <div
          className="vplay"
          style={{
            width: dur ? `${(cur / dur) * 100}%` : "0%",
            height: "100%",
            background: "#fff",
            borderRadius: 3,
            position: "relative",
          }}
        >
          <div className="knob" />
        </div>
      </div>

      <div className="vrow" style={{ width: "100%", justifyContent: "space-between" }}>
        <span className="vt mono">{fmt(cur)} / {fmt(dur)}</span>
        <button className="vb" onClick={toggle} style={{ width: 48, height: 48 }}>
          {playing ? <Pause /> : <Play />}
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            className="vb"
            onClick={() => {
              const a = ref.current;
              if (!a) return;
              a.muted = !a.muted;
              setVol(a.muted ? 0 : a.volume || 1);
            }}
          >
            {vol === 0 ? <VolumeX /> : <Volume2 />}
          </button>
          <div
            className="vvol"
            onClick={setVolume}
            style={{ width: 80, height: 4, background: "rgba(255,255,255,0.15)", borderRadius: 2, position: "relative", cursor: "pointer" }}
          >
            <div className="vvf" style={{ width: `${vol * 100}%`, height: "100%", background: "#fff", borderRadius: 2 }} />
          </div>
        </div>
      </div>
    </div>
  );
}

function RatingStars({
  rating,
  onRate,
}: {
  rating: number;
  onRate: (r: number) => void;
}) {
  return (
    <div className="lb-rating" style={{ display: "inline-flex", gap: 2 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          className={`lbtn star ${n <= rating ? "on" : ""}`}
          onClick={() => onRate(n)}
          title={`Rate ${n} star${n > 1 ? "s" : ""}`}
          style={{ padding: 2, lineHeight: 0 }}
        >
          <Star size={14} fill={n <= rating ? "currentColor" : "none"} />
        </button>
      ))}
    </div>
  );
}

export default function Lightbox() {
  const open = useStore((s) => s.lightbox.open);
  const items = useStore((s) => s.lightbox.items);
  const index = useStore((s) => s.lightbox.index);
  const slideshowActive = useStore((s) => s.slideshowActive);
  const close = useStore((s) => s.closeLightbox);
  const step = useStore((s) => s.lbStep);
  const goto = useStore((s) => s.lbGoto);
  const toggleFav = useStore((s) => s.toggleFav);
  const rateMedia = useStore((s) => s.rateMedia);
  const setSlideshow = useStore((s) => s.setSlideshow);

  // Slideshow auto-advance
  useEffect(() => {
    if (!open || !slideshowActive) return;
    if (items.length <= 1) return;
    const t = window.setTimeout(() => {
      step(1);
    }, 4000);
    return () => window.clearTimeout(t);
  }, [open, slideshowActive, items.length, step, index]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }
      if (e.key === "Escape") {
        close();
      } else if (e.key === "ArrowRight") {
        step(1);
      } else if (e.key === "ArrowLeft") {
        step(-1);
      } else if (e.key === "f" || e.key === "F") {
        const item = items[index];
        if (item) toggleFav(item.path);
      } else if (e.key === "r" || e.key === "R") {
        const item = items[index];
        if (item) reveal(item.path);
      } else if (e.key === "s" || e.key === "S") {
        setSlideshow(!slideshowActive);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close, step, goto, items, index, toggleFav, slideshowActive, setSlideshow]);

  if (!open || items.length === 0) return null;
  const item = items[index];
  if (!item) return null;
  const isVideo = item.kind === "video";
  const isAudio = item.kind === "audio";
  const name = fileName(item.path);

  return (
    <motion.div
      className="lb"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
    >
      <div className="lb-bar">
        <span className="nm">{name}</span>
        <span className="mt">
          · {item.creator} · {formatBytes(item.bytes)}
          {item.is_paid ? " · paid" : ""}
        </span>
        {slideshowActive && (
          <span
            className="mt"
            style={{
              marginLeft: 8,
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              color: "#7dd3fc",
            }}
          >
            <Clapperboard size={13} /> Slideshow
          </span>
        )}
        <span className="sp" />
        <RatingStars rating={item.rating || 0} onRate={(r) => rateMedia(item.path, r)} />
        <button
          className={`lbtn ${item.favorite ? "fav" : ""}`}
          onClick={() => toggleFav(item.path)}
          title="Favorite (F)"
        >
          <Star fill={item.favorite ? "currentColor" : "none"} />
        </button>
        <button
          className={`lbtn ${slideshowActive ? "fav" : ""}`}
          onClick={() => setSlideshow(!slideshowActive)}
          title="Toggle slideshow (S)"
        >
          <Clapperboard />
        </button>
        <button className="lbtn" onClick={() => reveal(item.path)} title="Reveal in Explorer (R)">
          <FolderOpen />
        </button>
        <button className="lbtn" onClick={close} title="Close (Esc)">
          <X />
        </button>
      </div>

      <div className="lb-stage">
        {items.length > 1 && (
          <button className="lb-nav prev" onClick={() => step(-1)} title="Previous (←)">
            <ChevronLeft />
          </button>
        )}
        {isVideo ? (
          <VideoPlayer key={item.path} src={fileSrc(item.path)} />
        ) : isAudio ? (
          <AudioPlayer key={item.path} src={fileSrc(item.path)} />
        ) : (
          <ImagePane key={item.path} src={fileSrc(item.path)} />
        )}
        {items.length > 1 && (
          <button className="lb-nav next" onClick={() => step(1)} title="Next (→)">
            <ChevronRight />
          </button>
        )}
      </div>

      <div className="lb-strip">
        {items.map((m, i) =>
          m.kind === "video" ? (
            <VideoThumb
              key={m.path}
              path={m.path}
              className={`th ${i === index ? "on" : ""}`}
              onClick={() => goto(i)}
            />
          ) : (
            <img
              key={m.path}
              className={`th ${i === index ? "on" : ""}`}
              src={fileSrc(m.path)}
              onClick={() => goto(i)}
              loading="lazy"
            />
          )
        )}
      </div>
    </motion.div>
  );
}
