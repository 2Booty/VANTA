import { Home, Users, LayoutGrid, Download, Settings, BarChart3 } from "lucide-react";
import { useStore, type View } from "../store";

const ICONS = {
  home: Home,
  library: Users,
  gallery: LayoutGrid,
  insights: BarChart3,
  downloads: Download,
};

export default function NavRail() {
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const subs = useStore((s) => s.subs);
  const media = useStore((s) => s.media);
  const jobs = useStore((s) => s.jobs);

  // Active count = queued + actively downloading. "paused" is intentionally
  // excluded so the badge reflects real throughput, not held jobs.
  const activeJobs = jobs.filter(
    (j) => j.status === "queued" || j.status === "active"
  ).length;

  const counts: Record<string, number | undefined> = {
    home: undefined,
    library: subs.length || undefined,
    gallery: media.length || undefined,
    downloads: activeJobs || undefined,
  };

  const items: { id: View; label: string }[] = [
    { id: "home", label: "Home" },
    { id: "library", label: "Library" },
    { id: "gallery", label: "Gallery" },
    { id: "insights", label: "Insights" },
    { id: "downloads", label: "Downloads" },
  ];

  return (
    <div className="rail">
      {items.map((it) => {
        const Icon = ICONS[it.id as keyof typeof ICONS];
        return (
          <button
            key={it.id}
            className={`navi ${view === it.id ? "on" : ""}`}
            onClick={() => setView(it.id)}
          >
            <Icon />
            {it.label}
            {counts[it.id] !== undefined && <span className="cnt mono">{counts[it.id]}</span>}
          </button>
        );
      })}
      <div className="rsp" />
      <div className="rlabel">System</div>
      <button
        className={`navi ${view === "settings" ? "on" : ""}`}
        onClick={() => setView("settings")}
      >
        <Settings />
        Settings
      </button>
    </div>
  );
}
