import { useState, useEffect, useMemo } from "react";
import { Search, ChevronRight, ChevronDown, Download, FolderInput, Check, DownloadCloud, Sparkles } from "lucide-react";
import { useStore } from "../store";

export default function Library() {
  const authStatus = useStore((s) => s.authStatus);
  const subs = useStore((s) => s.subs);
  const subsLoading = useStore((s) => s.subsLoading);
  const expanded = useStore((s) => s.expanded);
  const postsByUser = useStore((s) => s.postsByUser);
  const postsLoading = useStore((s) => s.postsLoading);
  const toggleCreator = useStore((s) => s.toggleCreator);
  const setView = useStore((s) => s.setView);
  const media = useStore((s) => s.media);
  const openAnalyze = useStore((s) => s.openAnalyze);
  const autoSyncStatus = useStore((s) => s.autoSyncStatus);
  const loadAutoSyncStatus = useStore((s) => s.loadAutoSyncStatus);
  const [q, setQ] = useState("");

  // Refresh auto-sync status on mount so the "what's new" indicator is current.
  useEffect(() => {
    loadAutoSyncStatus();
  }, [loadAutoSyncStatus]);

  // Group library media by creator (lowercased) → count.
  const mediaByCreator = useMemo(() => {
    const map: Record<string, number> = {};
    for (const m of media) {
      const key = (m.creator || "").toLowerCase();
      map[key] = (map[key] || 0) + 1;
    }
    return map;
  }, [media]);

  const scraped = new Set(Object.keys(mediaByCreator));

  // Map creator → last sync timestamp (in ms), for the "what's new" badge.
  const syncByCreator = useMemo(() => {
    const map: Record<string, number> = {};
    for (const s of autoSyncStatus) {
      if (s.creator && s.last_sync) {
        map[s.creator.toLowerCase()] = s.last_sync * 1000;
      }
    }
    return map;
  }, [autoSyncStatus]);

  const now = Date.now();
  const DAY_MS = 24 * 60 * 60 * 1000;

  const filtered = subs.filter((c) => {
    const t = `${c.name ?? ""} ${c.username ?? ""}`.toLowerCase();
    return t.includes(q.toLowerCase());
  });

  const allTargets = subs
    .filter((c) => c.id != null && c.username)
    .map((c) => ({ userId: c.id as number, username: c.username as string }));

  const startCreator = (id: number, username: string) =>
    openAnalyze([{ userId: id, username }], "creator", username);

  return (
    <div className="panel">
      <div className="phead">
        <h1>Library</h1>
        <span className="pm">your subscriptions</span>
        <div className="right">
          <div className="input">
            <Search size={15} />
            <input placeholder="Search creators" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {subs.length > 0 && (
            <button className="btn pri" onClick={() => openAnalyze(allTargets, "all", "all")}>
              <DownloadCloud size={14} /> Download all
            </button>
          )}
        </div>
      </div>

      <div className="scroll">
        {authStatus !== "ok" ? (
          <div className="banner">
            <div className="bt">Not connected</div>
            <div className="bd">Add your credentials in Settings to load your subscriptions.</div>
            <button className="btn" style={{ marginTop: 10 }} onClick={() => setView("settings")}>
              Open Settings
            </button>
          </div>
        ) : subsLoading ? (
          <div className="center-load">
            <div className="spinner" /> Loading subscriptions…
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty">
            <div className="t">No creators found.</div>
          </div>
        ) : (
          filtered.map((c) => {
            const id = c.id ?? 0;
            const username = c.username ?? "unknown";
            const isOpen = expanded === id;
            const posts = postsByUser[id];
            const mediaCount = posts
              ? posts.reduce((a, p) => a + (p.media?.length ?? 0), 0)
              : null;
            const libCount = mediaByCreator[username.toLowerCase()] || 0;
            const lastSyncMs = syncByCreator[username.toLowerCase()];
            const hasNew = lastSyncMs != null && now - lastSyncMs < DAY_MS;
            return (
              <div key={id}>
                <div className="crow" onClick={() => toggleCreator(id)}>
                  <div className="av-wrap">
                    {c.avatar ? (
                      <img className="av" src={c.avatar} alt="" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="av" />
                    )}
                    {scraped.has(username.toLowerCase()) && (
                      <span className="scraped-check" title="Already in your library">
                        <Check />
                      </span>
                    )}
                  </div>
                  <div>
                    <div className="nm" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {c.name ?? username}
                      {hasNew && (
                        <span
                          className="pillx mono"
                          style={{
                            fontSize: 9,
                            padding: "1px 5px",
                            color: "var(--accent)",
                            border: "1px solid var(--accent)",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 3,
                          }}
                          title="Synced within the last 24h"
                        >
                          <Sparkles size={9} /> new
                        </span>
                      )}
                    </div>
                    <div className="un">@{username}</div>
                  </div>
                  <div className="badges">
                    {c.postsCount != null && <span className="pillx mono">{c.postsCount} posts</span>}
                    {libCount > 0 && (
                      <span className="pillx mono" title="Items from this creator in your library">
                        {libCount} in library
                      </span>
                    )}
                    <button
                      className="btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        startCreator(id, username);
                      }}
                    >
                      <Download size={14} /> Download
                    </button>
                    <span className="go">{isOpen ? <ChevronDown /> : <ChevronRight />}</span>
                  </div>
                </div>

                {isOpen && (
                  <div style={{ padding: "2px 4px 12px 16px" }}>
                    {postsLoading[id] ? (
                      <div className="center-load" style={{ padding: 20, justifyContent: "flex-start" }}>
                        <div className="spinner" /> Loading posts…
                      </div>
                    ) : posts && posts.length > 0 ? (
                      <div style={{ fontSize: 12.5, color: "var(--dim)", display: "flex", gap: 14, alignItems: "center" }}>
                        <span>
                          {posts.length} posts · {mediaCount} media
                        </span>
                        <button className="btn ghost" onClick={() => startCreator(id, username)}>
                          <FolderInput size={14} /> Download all
                        </button>
                      </div>
                    ) : (
                      <div style={{ fontSize: 12.5, color: "var(--faint)" }}>No posts found.</div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
