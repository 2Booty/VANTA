import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Search, CheckSquare, Star, Play, Image as ImageIcon, Film, Music,
  Check, Trash2, Tag, X, RefreshCw, Copy, FolderPlus, SlidersHorizontal,
  Calendar,
} from "lucide-react";
import { useStore, type Filter, type SortBy, type GroupBy } from "../store";
import { api, type MediaEntry } from "../lib/api";
import { fileName, postDate } from "../lib/format";
import VideoThumb from "../components/VideoThumb";
import Thumb from "../components/Thumb";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "photo", label: "Photos" },
  { id: "video", label: "Videos" },
  { id: "audio", label: "Audio" },
  { id: "paid", label: "Paid" },
  { id: "free", label: "Free" },
  { id: "favorites", label: "Favorites" },
  { id: "untagged", label: "Untagged" },
];

const SORTS: { id: SortBy; label: string }[] = [
  { id: "newest", label: "Newest" },
  { id: "oldest", label: "Oldest" },
  { id: "largest", label: "Largest" },
  { id: "smallest", label: "Smallest" },
  { id: "name", label: "Name" },
  { id: "creator", label: "Creator" },
  { id: "rating", label: "Rating" },
];

const DENSITIES = [
  { id: "small", label: "S" },
  { id: "medium", label: "M" },
  { id: "large", label: "L" },
];

const GAP = 12;
const DENSITY_MIN: Record<string, number> = { small: 110, medium: 158, large: 210 };

function sortMedia(arr: MediaEntry[], by: SortBy): MediaEntry[] {
  const a = [...arr];
  switch (by) {
    case "newest": a.sort((x, y) => postDate(y) - postDate(x) || y.modified - x.modified); break;
    case "oldest": a.sort((x, y) => postDate(x) - postDate(y) || x.modified - y.modified); break;
    case "largest": a.sort((x, y) => y.bytes - x.bytes); break;
    case "smallest": a.sort((x, y) => x.bytes - y.bytes); break;
    case "name": a.sort((x, y) => fileName(x.path).localeCompare(fileName(y.path))); break;
    case "creator": a.sort((x, y) => x.creator.localeCompare(y.creator) || y.modified - x.modified); break;
    case "rating": a.sort((x, y) => (y.rating || 0) - (x.rating || 0) || postDate(y) - postDate(x)); break;
  }
  return a;
}

function dateStrToTs(s: string): number {
  if (!s) return 0;
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return 0;
  return new Date(y, m - 1, d, 0, 0, 0).getTime() / 1000;
}
function dateStrToTsEnd(s: string): number {
  if (!s) return 0;
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return 0;
  return new Date(y, m - 1, d, 23, 59, 59).getTime() / 1000;
}

export default function Gallery() {
  const media = useStore((s) => s.media);
  const mediaLoading = useStore((s) => s.mediaLoading);
  const query = useStore((s) => s.query);
  const setQuery = useStore((s) => s.setQuery);
  const filter = useStore((s) => s.filter);
  const setFilter = useStore((s) => s.setFilter);
  const creatorFilter = useStore((s) => s.creatorFilter);
  const setCreatorFilter = useStore((s) => s.setCreatorFilter);
  const sortBy = useStore((s) => s.sortBy);
  const setSortBy = useStore((s) => s.setSortBy);
  const groupBy = useStore((s) => s.groupBy);
  const setGroupBy = useStore((s) => s.setGroupBy);
  const blurThumbs = useStore((s) => s.config?.blur_thumbs ?? false);
  const gridDensity = useStore((s) => (s.config?.grid_density as string) || "medium");
  const patchConfig = useStore((s) => s.patchConfig);
  const minRating = useStore((s) => s.minRating);
  const setMinRating = useStore((s) => s.setMinRating);
  const dateFrom = useStore((s) => s.dateFrom);
  const dateTo = useStore((s) => s.dateTo);
  const setDateFrom = useStore((s) => s.setDateFrom);
  const setDateTo = useStore((s) => s.setDateTo);
  const allTags = useStore((s) => s.allTags);
  const selMode = useStore((s) => s.selMode);
  const setSelMode = useStore((s) => s.setSelMode);
  const selected = useStore((s) => s.selected);
  const toggleSelect = useStore((s) => s.toggleSelect);
  const clearSelection = useStore((s) => s.clearSelection);
  const openLightbox = useStore((s) => s.openLightbox);
  const toggleFav = useStore((s) => s.toggleFav);
  const scanLibrary = useStore((s) => s.scanLibrary);
  const openDuplicates = useStore((s) => s.openDuplicates);
  const toast = useStore((s) => s.toast);
  const setContextMenu = useStore((s) => s.setContextMenu);

  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  const minTile = DENSITY_MIN[gridDensity] ?? DENSITY_MIN.medium;

  useEffect(() => {
    document.body.classList.toggle("selmode", selMode);
    return () => document.body.classList.remove("selmode");
  }, [selMode]);

  const creators = useMemo(
    () => Array.from(new Set(media.map((m) => m.creator))).sort(),
    [media],
  );

  const list = useMemo(() => {
    const fromTs = dateStrToTs(dateFrom);
    const toTs = dateStrToTsEnd(dateTo);
    const filtered = media.filter((m) => {
      if (filter === "photo" && m.kind !== "photo") return false;
      if (filter === "video" && m.kind !== "video") return false;
      if (filter === "audio" && m.kind !== "audio") return false;
      if (filter === "paid" && !m.is_paid) return false;
      if (filter === "free" && m.is_paid) return false;
      if (filter === "favorites" && !m.favorite) return false;
      if (filter === "untagged" && m.tags.length !== 0) return false;
      if (creatorFilter && m.creator !== creatorFilter) return false;
      if (tagFilter && !m.tags.includes(tagFilter)) return false;
      if (minRating > 0 && (m.rating || 0) < minRating) return false;
      if (fromTs || toTs) {
        const pd = postDate(m);
        if (fromTs && pd < fromTs) return false;
        if (toTs && pd > toTs) return false;
      }
      if (query) {
        const t = `${m.path} ${m.creator} ${m.tags.join(" ")}`.toLowerCase();
        if (!t.includes(query.toLowerCase())) return false;
      }
      return true;
    });
    return sortMedia(filtered, sortBy);
  }, [media, filter, creatorFilter, tagFilter, minRating, dateFrom, dateTo, query, sortBy]);

  // Count active advanced filters for the badge
  const activeFilterCount = [
    creatorFilter, tagFilter, minRating > 0, dateFrom, dateTo, groupBy !== "none",
  ].filter(Boolean).length;

  // Build active filter badges
  const activeBadges: { label: string; onClear: () => void }[] = [];
  if (creatorFilter) activeBadges.push({ label: creatorFilter, onClear: () => setCreatorFilter(null) });
  if (tagFilter) activeBadges.push({ label: `#${tagFilter}`, onClear: () => setTagFilter(null) });
  if (minRating > 0) activeBadges.push({ label: `${minRating}★+`, onClear: () => setMinRating(0) });
  if (dateFrom) activeBadges.push({ label: `From ${dateFrom}`, onClear: () => setDateFrom("") });
  if (dateTo) activeBadges.push({ label: `To ${dateTo}`, onClear: () => setDateTo("") });

  const clearAllFilters = () => {
    setCreatorFilter(null);
    setTagFilter(null);
    setMinRating(0);
    setDateFrom("");
    setDateTo("");
    setFilter("all");
  };

  const groups = useMemo(() => {
    if (groupBy !== "creator") return null;
    const m = new Map<string, { m: MediaEntry; i: number }[]>();
    list.forEach((item, i) => {
      const arr = m.get(item.creator) ?? [];
      arr.push({ m: item, i });
      m.set(item.creator, arr);
    });
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [list, groupBy]);

  // ---- virtualization ----
  const scrollRef = useRef<HTMLDivElement>(null);
  const gridWrapRef = useRef<HTMLDivElement>(null);
  const [cols, setCols] = useState(4);
  const [tileSize, setTileSize] = useState(180);
  const [scrollMargin, setScrollMargin] = useState(0);

  const remeasure = () => {
    const el = gridWrapRef.current;
    const sc = scrollRef.current;
    if (!el || !sc) return;
    const w = el.clientWidth;
    const c = Math.max(1, Math.floor((w + GAP) / (minTile + GAP)));
    const tw = (w - (c - 1) * GAP) / c;
    setCols(c);
    setTileSize(tw);
    const m = el.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop;
    setScrollMargin(m > 0 ? m : 0);
  };

  useLayoutEffect(() => {
    remeasure();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupBy, creatorFilter, filter, query, list.length, creators.length, media.length, minTile, tagFilter, showFilters]);

  useEffect(() => {
    const sc = scrollRef.current;
    if (!sc) return;
    const ro = new ResizeObserver(() => remeasure());
    ro.observe(sc);
    window.addEventListener("resize", remeasure);
    return () => { ro.disconnect(); window.removeEventListener("resize", remeasure); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rowCount = groupBy === "creator" ? 0 : Math.ceil(list.length / cols);
  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => tileSize + GAP,
    overscan: 4,
    scrollMargin,
  });

  const onTile = (i: number, m: MediaEntry) => {
    if (selMode) toggleSelect(m.path);
    else openLightbox(list, i);
  };

  const onRate = async (m: MediaEntry, rating: number) => {
    try {
      await api.rateMedia(m.path, rating);
      scanLibrary();
    } catch (e) {
      toast(String(e), "err");
    }
  };

  const favoriteSelected = async () => {
    for (const p of selected) {
      const m = media.find((x) => x.path === p);
      if (m && !m.favorite) await toggleFav(p);
    }
    toast(`Favorited ${selected.length}`);
  };
  const tagSelected = async () => {
    const tag = window.prompt("Add tag to selection:");
    if (!tag) return;
    for (const p of selected) await api.addTag(p, tag);
    toast(`Tagged ${selected.length} with "${tag}"`);
    scanLibrary();
  };
  const deleteSelected = async () => {
    if (!window.confirm(`Move ${selected.length} item(s) to the Recycle Bin?`)) return;
    try {
      await api.deleteMedia(selected);
      toast(`Deleted ${selected.length}`);
      clearSelection();
      setSelMode(false);
      scanLibrary();
    } catch (e) {
      toast(String(e), "err");
    }
  };
  const collectionSelected = async () => {
    const name = window.prompt("Create new collection named:");
    if (!name) return;
    try {
      const cid = await api.createCollection(name);
      await api.addToCollection(cid, selected);
      toast(`Added ${selected.length} to "${name}"`);
    } catch (e) {
      toast(String(e), "err");
    }
  };

  const renderCell = (m: MediaEntry, i: number) => (
    <div
      key={m.path}
      className={`cell ${selected.includes(m.path) ? "sel" : ""} ${blurThumbs ? "blurred" : ""}`}
      onClick={() => onTile(i, m)}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setContextMenu({ x: e.clientX, y: e.clientY, path: m.path });
      }}
    >
      {m.kind === "photo" ? (
        <Thumb path={m.path} className="ph" />
      ) : m.kind === "audio" ? (
        <div className="ph audio-ph">
          <Music size={Math.max(20, tileSize * 0.22)} />
        </div>
      ) : (
        <VideoThumb path={m.path} className="ph" />
      )}
      <div className="ov" />
      <div className="chk"><Check /></div>
      <div className="type">
        {m.kind === "video" ? <Film /> : m.kind === "audio" ? <Music /> : <ImageIcon />}
        {m.kind.toUpperCase()}
      </div>
      <button
        className={`star ${m.favorite ? "fav" : ""}`}
        onClick={(e) => { e.stopPropagation(); toggleFav(m.path); }}
      >
        <Star fill={m.favorite ? "currentColor" : "none"} />
      </button>
      {m.rating > 0 && (
        <div className="rating-badge" title={`${m.rating} / 5`}>
          <Star size={10} fill="currentColor" /> {m.rating}
        </div>
      )}
      {m.kind === "video" && <div className="play"><Play /></div>}
      <div className="tile-bottom">
        <span className="meta">{m.creator}</span>
        <div className="rate-row" onClick={(e) => e.stopPropagation()}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              className={`rate-pip ${n <= (m.rating || 0) ? "on" : ""}`}
              onClick={(e) => { e.stopPropagation(); onRate(m, n === m.rating ? 0 : n); }}
              title={`${n} star${n > 1 ? "s" : ""}`}
            >
              <Star size={13} fill={n <= (m.rating || 0) ? "currentColor" : "none"} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className="panel">
      {/* ─── Header: title + search + actions ─── */}
      <div className="phead">
        <h1>Gallery</h1>
        <span className="pm mono">{list.length} items</span>
        <div className="right">
          <div className="input">
            <Search size={15} />
            <input
              placeholder="Search media"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <select className="gsel" value={sortBy} onChange={(e) => setSortBy(e.target.value as SortBy)} title="Sort">
            {SORTS.map((srt) => (
              <option key={srt.id} value={srt.id}>{srt.label}</option>
            ))}
          </select>
          <button
            className={`btn ${showFilters ? "pri" : ""}`}
            onClick={() => setShowFilters(!showFilters)}
            title="Filters & options"
            style={{ position: "relative" }}
          >
            <SlidersHorizontal size={14} />
            {activeFilterCount > 0 && <span className="filter-badge">{activeFilterCount}</span>}
          </button>
          <button className="btn" onClick={() => openDuplicates()} title="Find duplicates">
            <Copy size={14} />
          </button>
          <button className="btn" onClick={() => scanLibrary()} title="Rescan library">
            <RefreshCw size={14} />
          </button>
          <button className={`btn ${selMode ? "pri" : ""}`} onClick={() => setSelMode(!selMode)}>
            <CheckSquare size={14} /> {selMode ? "Done" : "Select"}
          </button>
        </div>
      </div>

      {/* ─── Quick filter chips (always visible) ─── */}
      <div className="gtoolbar">
        <div className="qfilters">
          {FILTERS.map((f) => (
            <span
              key={f.id}
              className={`chip ${filter === f.id ? "on" : ""}`}
              onClick={() => setFilter(f.id)}
            >
              {f.id === "favorites" && <Star size={12} />}
              {f.id === "untagged" && <Tag size={12} />}
              {f.label}
            </span>
          ))}
        </div>

        {/* Active filter badges — scrollable */}
        {activeBadges.length > 0 && (
          <div className="active-badges">
            {activeBadges.map((b, i) => (
              <span key={i} className="badge" onClick={b.onClear}>
                {b.label} <X size={11} />
              </span>
            ))}
            <span className="badge clear-all" onClick={clearAllFilters}>Clear all</span>
          </div>
        )}
      </div>

      {/* ─── Collapsible filter panel ─── */}
      {showFilters && (
        <div className="filter-panel">
          <div className="fp-row">
            {/* Group by */}
            <div className="fp-group">
              <span className="fp-label">Group</span>
              <select className="gsel" value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)}>
                <option value="none">None</option>
                <option value="creator">By creator</option>
              </select>
            </div>
            {/* Density */}
            <div className="fp-group">
              <span className="fp-label">Size</span>
              <div className="density-toggle">
                {DENSITIES.map((d) => (
                  <button
                    key={d.id}
                    className={`d-btn ${gridDensity === d.id ? "on" : ""}`}
                    onClick={() => patchConfig({ grid_density: d.id })}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
            {/* Rating */}
            <div className="fp-group">
              <span className="fp-label">Min rating</span>
              <div className="rating-filter">
                {[0, 1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    className={`r-btn ${minRating === n ? "on" : ""}`}
                    onClick={() => setMinRating(n)}
                    title={n === 0 ? "No filter" : `${n}+ stars`}
                  >
                    {n === 0 ? "Any" : <Star size={11} fill={n <= minRating ? "currentColor" : "none"} />}
                  </button>
                ))}
              </div>
            </div>
            {/* Date range */}
            <div className="fp-group">
              <span className="fp-label"><Calendar size={11} /> Date</span>
              <div className="date-range">
                <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} title="From" />
                <span className="d-sep">—</span>
                <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} title="To" />
                {(dateFrom || dateTo) && (
                  <button className="d-clear" onClick={() => { setDateFrom(""); setDateTo(""); }}>
                    <X size={12} />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Creators — scrollable chip list */}
          {creators.length > 1 && (
            <div className="fp-section">
              <span className="fp-label">Creators ({creators.length})</span>
              <div className="chip-scroll">
                {creators.map((c) => (
                  <span
                    key={c}
                    className={`chip sm ${creatorFilter === c ? "on" : ""}`}
                    onClick={() => setCreatorFilter(creatorFilter === c ? null : c)}
                  >
                    {c}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Tags — scrollable chip list */}
          {allTags.length > 0 && (
            <div className="fp-section">
              <span className="fp-label">Tags ({allTags.length})</span>
              <div className="chip-scroll">
                {allTags.map(([tag, count]) => (
                  <span
                    key={tag}
                    className={`chip sm ${tagFilter === tag ? "on" : ""}`}
                    onClick={() => setTagFilter(tagFilter === tag ? null : tag)}
                  >
                    #{tag} <span className="mono dim">{count}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── Grid ─── */}
      <div className="scroll" ref={scrollRef}>
        {mediaLoading ? (
          <div className="center-load">
            <div className="spinner" /> Scanning library...
          </div>
        ) : list.length === 0 ? (
          <div className="empty">
            <ImageIcon />
            <div className="t">
              {media.length === 0
                ? "No downloads yet. Grab some content from the Library tab."
                : "Nothing matches these filters."}
            </div>
          </div>
        ) : groups ? (
          groups.map(([creator, items]) => (
            <div key={creator} style={{ marginBottom: 22 }}>
              <div className="group-head">
                {creator} <span className="mono">{items.length}</span>
              </div>
              <div className="grid">{items.map(({ m, i }) => renderCell(m, i))}</div>
            </div>
          ))
        ) : (
          <div ref={gridWrapRef} style={{ position: "relative", height: rowVirtualizer.getTotalSize() }}>
            {rowVirtualizer.getVirtualItems().map((vr) => {
              const start = vr.index * cols;
              const rowItems = list.slice(start, start + cols);
              return (
                <div
                  key={vr.key}
                  className="vgrid-row"
                  style={{
                    transform: `translateY(${vr.start - scrollMargin}px)`,
                    gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                  }}
                >
                  {rowItems.map((m, k) => renderCell(m, start + k))}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {selMode && (
        <div className="selbar">
          <span className="ct">{selected.length} selected</span>
          <div className="sb" onClick={favoriteSelected}><Star size={13} /> Favorite</div>
          <div className="sb" onClick={tagSelected}><Tag size={13} /> Tag</div>
          <div className="sb" onClick={collectionSelected}><FolderPlus size={13} /> Collection</div>
          <div className="sb danger" onClick={deleteSelected}><Trash2 size={13} /> Delete</div>
        </div>
      )}
    </div>
  );
}
