import React, { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "../lib/tauri";
import { ArrowLeftIcon, ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon } from "../components/icons";
import LoadingIndicator from "../components/LoadingIndicator";
import {
  buildPaginationItems,
  buildPosterPresentationStyle,
  buildRangeLabel,
  extractSteamAppId,
  formatDurationLong,
  getInitials,
  preventPagerFocus,
  resolveBackdropMedia,
  resolveGenericMedia,
  resolvePosterMedia,
  resolveSteamSmallCapsuleMediaCandidates,
} from "../lib/game-helpers";

const steamCapsuleCache = {};

export function PlaytimeDetailArtwork({ game, artwork = "poster", steamCapsuleUrl = "" }) {
  const normalizedArtwork = artwork === "capsule" ? "capsule" : "poster";
  const steamAppId = extractSteamAppId(game?.steam_appid, game?.steam_header_url, game?.backdrop_url, game?.cover_url);

  const candidates = useMemo(() => {
    if (normalizedArtwork === "capsule") {
      const items = [];

      const resolvedSteamCapsule = resolveGenericMedia(steamCapsuleUrl);
      if (resolvedSteamCapsule) {
        items.push({ src: resolvedSteamCapsule, kind: "capsule" });
      }

      const capsuleUrls = resolveSteamSmallCapsuleMediaCandidates(steamAppId, game?.steam_header_url, game?.cover_url);
      for (const url of capsuleUrls) {
        if (url && !items.some((item) => item.src === url)) {
          items.push({ src: url, kind: "capsule" });
        }
      }
      const backdrop = resolveBackdropMedia(game?.backdrop_url);
      if (backdrop && !items.some((item) => item.src === backdrop)) {
        items.push({ src: backdrop, kind: "backdrop" });
      }
      const cover = resolvePosterMedia(game?.cover_url);
      if (cover && !items.some((item) => item.src === cover)) {
        items.push({ src: cover, kind: "poster" });
      }
      const genericCover = resolveGenericMedia(game?.cover_url);
      if (genericCover && !items.some((item) => item.src === genericCover)) {
        items.push({ src: genericCover, kind: "poster" });
      }
      return items;
    }

    const posterList = [];
    const cover = resolvePosterMedia(game?.cover_url);
    if (cover) posterList.push({ src: cover, kind: "poster" });
    const generic = resolveGenericMedia(game?.cover_url);
    if (generic && !posterList.some((item) => item.src === generic)) {
      posterList.push({ src: generic, kind: "poster" });
    }
    const backdrop = resolveBackdropMedia(game?.backdrop_url);
    if (backdrop && !posterList.some((item) => item.src === backdrop)) {
      posterList.push({ src: backdrop, kind: "poster" });
    }
    return posterList;
  }, [normalizedArtwork, steamCapsuleUrl, steamAppId, game?.steam_header_url, game?.backdrop_url, game?.cover_url]);

  const [sourceIndex, setSourceIndex] = useState(0);

  useEffect(() => {
    setSourceIndex(0);
  }, [normalizedArtwork, steamCapsuleUrl, game?.id, game?.name, candidates.map((c) => c.src).join("|")]);

  const currentCandidate = candidates[sourceIndex] || null;
  const currentSource = currentCandidate?.src || "";
  const posterStyle = normalizedArtwork !== "capsule"
    ? buildPosterPresentationStyle(game?.cover_position_x, game?.cover_position_y, game?.cover_zoom)
    : undefined;

  if (!currentSource) {
    return (
      <div className={`stats-topgame-fallback${normalizedArtwork === "capsule" ? " is-capsule" : ""}`} aria-hidden="true">
        {getInitials(game?.name)}
      </div>
    );
  }

  return (
    <img
      src={currentSource}
      alt={game?.name || "Game art"}
      loading="lazy"
      className={normalizedArtwork === "capsule"
        ? `is-capsule${currentCandidate?.kind === "capsule" ? " is-native-capsule" : " is-fallback-capsule"}`
        : ""}
      style={posterStyle}
      onError={() => {
        setSourceIndex((current) => (current < candidates.length ? current + 1 : current));
      }}
    />
  );
}

export function PlaytimeDetailSkeletonRow({ isCapsule = false }) {
  return (
    <div className={`stats-topgame-row playtime-detail-row is-skeleton-row${isCapsule ? " is-capsule" : ""}`} aria-hidden="true">
      <div className="stats-topgame-meta">
        <span className={`playtime-detail-skeleton-thumb is-skeleton${isCapsule ? " is-capsule" : " is-poster"}`} />
        <span className="playtime-detail-skeleton-title is-skeleton" />
      </div>

      <div className="playtime-detail-status">
        <span className="playtime-detail-skeleton-badge is-skeleton" />
      </div>

      <div className="stats-topgame-bar">
        <span className="playtime-detail-skeleton-bar is-skeleton" />
      </div>

      <span className="playtime-detail-skeleton-time is-skeleton" />
      <span className="playtime-detail-skeleton-share is-skeleton" />
    </div>
  );
}

const PLAYTIME_DETAIL_PAGE_SIZE = 15;

export default function PlaytimeDetailPage({ library, loading, onBack, topGameArtwork = "poster" }) {
  const [sortBy, setSortBy] = useState("name-asc");
  const [page, setPage] = useState(1);
  const [steamCapsuleMap, setSteamCapsuleMap] = useState(() => ({ ...steamCapsuleCache }));
  const [capsulesLoading, setCapsulesLoading] = useState(false);
  const sortOptions = [
    { value: "name-asc", label: "Alphabet: A-Z" },
    { value: "name-desc", label: "Alphabet: Z-A" },
    { value: "playtime-desc", label: "Playtime: Highest First" },
    { value: "playtime-asc", label: "Playtime: Lowest First" },
    { value: "last-played-desc", label: "Last Played" },
    { value: "last-added-desc", label: "Last Added" },
  ];
  const activeSortLabel = sortOptions.find((option) => option.value === sortBy)?.label || "Alphabet: A-Z";

  const games = useMemo(() => {
    return [...(Array.isArray(library) ? library : [])].sort((left, right) => {
      switch (sortBy) {
        case "name-desc":
          return compareText(right.name, left.name);
        case "playtime-desc":
          return compareNumber(right.total_seconds, left.total_seconds) || compareText(left.name, right.name);
        case "playtime-asc":
          return compareNumber(left.total_seconds, right.total_seconds) || compareText(left.name, right.name);
        case "last-played-desc":
          return compareNumber(right.last_played, left.last_played)
            || compareNumber(right.total_seconds, left.total_seconds)
            || compareText(left.name, right.name);
        case "last-added-desc":
          return compareNumber(right.created_at, left.created_at)
            || compareNumber(right.last_played, left.last_played)
            || compareText(left.name, right.name);
        case "name-asc":
        default:
          return compareText(left.name, right.name);
      }
    });
  }, [library, sortBy]);

  const totalPlaytimeSeconds = useMemo(
    () => games.reduce((sum, game) => sum + Math.max(0, Number(game.total_seconds || 0)), 0),
    [games]
  );
  const totalPages = Math.max(1, Math.ceil(games.length / PLAYTIME_DETAIL_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const visibleGames = games.slice((currentPage - 1) * PLAYTIME_DETAIL_PAGE_SIZE, currentPage * PLAYTIME_DETAIL_PAGE_SIZE);
  const paginationItems = buildPaginationItems(currentPage, totalPages);

  useEffect(() => {
    setPage(1);
  }, [sortBy]);

  useEffect(() => {
    setPage((current) => Math.min(current, totalPages));
  }, [totalPages]);

  useEffect(() => {
    if (topGameArtwork !== "capsule") {
      setCapsulesLoading(false);
      return undefined;
    }

    const appIds = visibleGames
      .map((game) => extractSteamAppId(game.steam_appid, game.steam_header_url, game.backdrop_url, game.cover_url))
      .filter((id) => id > 0);

    const missingAppIds = [...new Set(appIds)].filter((id) => !steamCapsuleMap[id]);

    if (!missingAppIds.length) {
      setCapsulesLoading(false);
      return undefined;
    }

    let cancelled = false;
    setCapsulesLoading(true);

    async function loadSteamCapsules() {
      try {
        const response = await invoke("get_steam_small_capsules", { appIds: missingAppIds });
        if (cancelled || !response || typeof response !== "object") {
          return;
        }

        Object.assign(steamCapsuleCache, response);
        setSteamCapsuleMap((current) => ({
          ...current,
          ...response,
        }));
      } catch {
      } finally {
        if (!cancelled) {
          setCapsulesLoading(false);
        }
      }
    }

    loadSteamCapsules();
    return () => {
      cancelled = true;
    };
  }, [topGameArtwork, visibleGames, steamCapsuleMap]);

  const isPageLoading = loading || (topGameArtwork === "capsule" && capsulesLoading);

  return (
    <div className="playtime-detail-page">
      <header className="page-header page-header-library playtime-detail-header">
        <div className="page-heading">
          <h1>Game Playtime</h1>
        </div>

        <div className="stats-profile-pill" aria-hidden="true" />
      </header>

      <section className="stats-section">
        <div className="playtime-detail-topbar">
          <div className="playtime-detail-topbar-left">
            <SortSelect
              options={sortOptions}
              value={sortBy}
              label={activeSortLabel}
              onChange={setSortBy}
            />
          </div>
          <div className="playtime-detail-topbar-meta">
            <span>{games.length} titles</span>
            <span aria-hidden="true" className="playtime-detail-topbar-separator">•</span>
            <span>Total playtime: {formatDurationLong(totalPlaytimeSeconds)}</span>
          </div>
        </div>

        <article className="stats-panel playtime-detail-panel">
          <div className={`stats-topgames-list playtime-detail-list ${topGameArtwork === "capsule" ? "is-capsule" : "is-poster"}`}>
            {isPageLoading ? (
              Array.from({ length: PLAYTIME_DETAIL_PAGE_SIZE }, (_, idx) => (
                <PlaytimeDetailSkeletonRow key={`skeleton-row-${idx}`} isCapsule={topGameArtwork === "capsule"} />
              ))
            ) : (
              visibleGames.map((game) => {
                const totalSeconds = Math.max(0, Number(game.total_seconds || 0));
                const isPlayed = totalSeconds > 0;
                const share = totalPlaytimeSeconds > 0 ? (totalSeconds / totalPlaytimeSeconds) * 100 : 0;
                const isCapsule = topGameArtwork === "capsule";
                const steamAppId = extractSteamAppId(game.steam_appid, game.steam_header_url, game.backdrop_url, game.cover_url);
                const steamCapsuleUrl = steamCapsuleMap[steamAppId] || "";

                return (
                  <div key={game.id} className={`stats-topgame-row playtime-detail-row${isCapsule ? " is-capsule" : ""}${isPlayed ? "" : " is-unplayed"}`}>
                    <div className="stats-topgame-meta">
                      <PlaytimeDetailArtwork game={game} artwork={topGameArtwork} steamCapsuleUrl={steamCapsuleUrl} />
                      <span>{game.name}</span>
                    </div>

                  <div className="playtime-detail-status">
                    <span className={`playtime-detail-badge${isPlayed ? " is-played" : ""}`}>
                      <span className="playtime-detail-badge-label">
                        {isPlayed ? "Played" : "Not Played"}
                      </span>
                    </span>
                  </div>

                  <div className="stats-topgame-bar">
                    <div className="stats-topgame-bar-track">
                      <div style={{ width: isPlayed ? `${Math.max(share, 4)}%` : "0%" }} />
                    </div>
                  </div>

                  <strong>{isPlayed ? formatDurationLong(totalSeconds) : "-"}</strong>
                  <small>{isPlayed ? `${Math.round(share)}%` : "-"}</small>
                </div>
              );
            })
          )}
          </div>

          {!games.length && !loading ? (
            <div className="stats-empty">
              <strong>No games in library.</strong>
              <span>Add a game to populate this panel.</span>
            </div>
          ) : null}
        </article>

        {!loading && games.length > PLAYTIME_DETAIL_PAGE_SIZE ? (
          <footer className="playtime-detail-footer">
            <span>{buildRangeLabel(games.length, currentPage, PLAYTIME_DETAIL_PAGE_SIZE)} of {games.length} games</span>
            <div className="pager" role="navigation" aria-label="Playtime detail pagination">
              <button
                type="button"
                aria-label="Previous playtime page"
                disabled={currentPage <= 1}
                onMouseDown={preventPagerFocus}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
              >
                <ChevronLeftIcon />
              </button>
              {paginationItems.map((item) => (
                item.type === "ellipsis" ? (
                  <span key={`playtime-page-${item.key}`} className="pager-ellipsis" aria-hidden="true">...</span>
                ) : (
                  <button
                    key={`playtime-page-${item.value}`}
                    type="button"
                    className={currentPage === item.value ? "is-active" : ""}
                    aria-label={`Playtime page ${item.value}`}
                    aria-pressed={currentPage === item.value}
                    onMouseDown={preventPagerFocus}
                    onClick={() => setPage(item.value)}
                  >
                    {item.value}
                  </button>
                )
              ))}
              <button
                type="button"
                aria-label="Next playtime page"
                disabled={currentPage >= totalPages}
                onMouseDown={preventPagerFocus}
                onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
              >
                <ChevronRightIcon />
              </button>
            </div>
          </footer>
        ) : null}
      </section>
    </div>
  );
}

function SortSelect({ options, value, label, onChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    function handlePointerDown(event) {
      if (!rootRef.current?.contains(event.target)) {
        setIsOpen(false);
      }
    }

    function handleEscape(event) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  return (
    <div ref={rootRef} className={`sort-select${isOpen ? " is-open" : ""}`}>
      <button
        type="button"
        className="sort-select-trigger"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
      >
        <span>Sort by:</span>
        <strong>{label}</strong>
        <ChevronDownIcon />
      </button>

      {isOpen ? (
        <div className="sort-select-panel">
          <div className="sort-select-option-list" role="listbox" aria-label="Sort playtime detail">
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={value === option.value}
                className={`sort-select-option${value === option.value ? " is-selected" : ""}`}
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function compareText(left, right) {
  return String(left || "").localeCompare(String(right || ""), undefined, { sensitivity: "base" });
}

function compareNumber(left, right) {
  return Number(left || 0) - Number(right || 0);
}
