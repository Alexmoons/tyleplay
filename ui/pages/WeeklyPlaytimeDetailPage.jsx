import React, { useEffect, useMemo, useState } from "react";
import { ChevronDownIcon } from "../components/icons";
import {
  extractSteamAppId,
  formatCurrentWeekRangeLabel,
  formatDurationLong,
} from "../lib/game-helpers";
import { invoke } from "../lib/tauri";
import { PlaytimeDetailArtwork, PlaytimeDetailSkeletonRow } from "./PlaytimeDetailPage";

function compareText(left, right) {
  return String(left || "").localeCompare(String(right || ""), undefined, { numeric: true, sensitivity: "base" });
}

function compareNumber(left, right) {
  return Number(right || 0) - Number(left || 0);
}

function localMidnightTimestamp(timestampSec) {
  const date = new Date(Number(timestampSec || 0) * 1000);
  date.setHours(0, 0, 0, 0);
  return Math.floor(date.getTime() / 1000);
}

function startOfWeekMonday(timestampSec) {
  const date = new Date(Number(timestampSec || 0) * 1000);
  date.setHours(0, 0, 0, 0);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return Math.floor(date.getTime() / 1000);
}

function splitSessionAcrossDays(session) {
  const start = Number(session?.started_at || 0);
  const effectiveEnd = Number(session?.ended_at || Math.floor(Date.now() / 1000));
  const totalDuration = Math.max(0, Number(session?.duration_seconds || 0));
  if (start <= 0 || effectiveEnd <= start || totalDuration <= 0) {
    return [];
  }

  const segments = [];
  let currentStart = start;
  let remaining = totalDuration;

  while (remaining > 0 && currentStart < effectiveEnd) {
    const nextMidnight = localMidnightTimestamp(currentStart) + 86400;
    const segmentEnd = Math.min(effectiveEnd, nextMidnight);
    const duration = Math.min(remaining, Math.max(0, segmentEnd - currentStart));
    if (duration <= 0) {
      break;
    }

    segments.push({
      started_at: currentStart,
      ended_at: currentStart + duration,
      duration_seconds: duration,
    });

    currentStart = segmentEnd;
    remaining -= duration;
  }

  return segments;
}

function buildMostPlayedPeriodGamesThisWeek(sessionEntries, games, library) {
  const entries = Array.isArray(sessionEntries) ? sessionEntries : [];
  const gameList = Array.isArray(games) ? games : [];
  const libraryList = Array.isArray(library) ? library : [];
  const gameById = new Map(gameList.map((game) => [Number(game.id), game]));
  const libraryById = new Map(libraryList.map((game) => [Number(game.id), game]));
  const totals = new Map();
  const nowSec = Math.floor(Date.now() / 1000);
  const periodStart = startOfWeekMonday(nowSec);
  const periodEnd = periodStart + 7 * 86400;

  entries.forEach((session) => {
    const startedAt = Number(session.started_at || 0);
    if (startedAt < periodStart || startedAt >= periodEnd) {
      return;
    }

    const gameId = Number(session.gameId || 0);
    const gameName = String(session.gameName || "Unknown Game");
    const durationSeconds = Math.max(0, Number(session.duration_seconds || 0));
    const key = `${gameId}:${gameName}`;
    const current = totals.get(key) || {
      id: gameId,
      name: gameName,
      total_seconds: 0,
      session_count: 0,
    };
    current.total_seconds += durationSeconds;
    current.session_count += 1;
    totals.set(key, current);
  });

  const items = [...totals.values()]
    .filter((game) => game.total_seconds > 0)
    .sort((left, right) => right.total_seconds - left.total_seconds || left.name.localeCompare(right.name));
  const totalSeconds = items.reduce((sum, game) => sum + game.total_seconds, 0);

  return items.map((game) => {
    const libGame = libraryById.get(game.id) || gameById.get(game.id) || {};
    const coverUrl = libGame.cover_url || "";
    const backdropUrl = libGame.backdrop_url || "";
    const steamHeaderUrl = libGame.steam_header_url || "";
    const steamAppId = extractSteamAppId(libGame.steam_appid, steamHeaderUrl, backdropUrl, coverUrl);

    return {
      ...libGame,
      id: game.id,
      name: game.name,
      total_seconds: game.total_seconds,
      session_count: game.session_count,
      share: totalSeconds > 0 ? (game.total_seconds / totalSeconds) * 100 : 0,
      cover_url: coverUrl,
      backdrop_url: backdropUrl,
      steam_header_url: steamHeaderUrl,
      steam_appid: steamAppId,
    };
  });
}

const steamCapsuleCache = {};
const WEEKLY_PLAYTIME_DETAIL_PAGE_SIZE = 15;

function SortSelect({ options, value, label, onChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = React.useRef(null);

  useEffect(() => {
    function handlePointerDown(event) {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
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
          <div className="sort-select-option-list" role="listbox" aria-label="Sort weekly playtime detail">
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

function getSessionBadgeClass(count) {
  const c = Number(count || 1);
  if (c === 1) return "is-session-green";
  if (c <= 10) return "is-session-orange";
  return "is-session-purple";
}

export default function WeeklyPlaytimeDetailPage({
  library,
  loading: parentLoading = false,
  onBack,
  onOpenTable,
  topGameArtwork = "poster",
  onNotify,
}) {
  const [statsSnapshot, setStatsSnapshot] = useState({ games: [] });
  const [loadingSnapshot, setLoadingSnapshot] = useState(true);
  const [sortBy, setSortBy] = useState("playtime-desc");
  const [page, setPage] = useState(1);
  const [steamCapsuleMap, setSteamCapsuleMap] = useState(() => ({ ...steamCapsuleCache }));
  const [capsulesLoading, setCapsulesLoading] = useState(false);

  const sortOptions = [
    { value: "playtime-desc", label: "Playtime: Highest First" },
    { value: "playtime-asc", label: "Playtime: Lowest First" },
    { value: "name-asc", label: "Alphabet: A-Z" },
    { value: "name-desc", label: "Alphabet: Z-A" },
  ];
  const activeSortLabel = sortOptions.find((option) => option.value === sortBy)?.label || "Playtime: Highest First";

  useEffect(() => {
    let cancelled = false;
    async function fetchStatsSnapshot() {
      setLoadingSnapshot(true);
      try {
        const result = await invoke("get_stats_snapshot");
        if (cancelled) return;
        setStatsSnapshot({
          games: Array.isArray(result?.games) ? result.games : [],
        });
      } catch (err) {
        if (!cancelled) {
          setStatsSnapshot({ games: [] });
        }
      } finally {
        if (!cancelled) setLoadingSnapshot(false);
      }
    }
    fetchStatsSnapshot();
    return () => {
      cancelled = true;
    };
  }, []);

  const sessionEntries = useMemo(() => {
    return (Array.isArray(statsSnapshot?.games) ? statsSnapshot.games : []).flatMap((game) => {
      const sessions = Array.isArray(game?.play_sessions) ? game.play_sessions : [];
      return sessions.flatMap((session) =>
        splitSessionAcrossDays(session).map((segment) => ({
          ...segment,
          gameId: Number(game.id),
          gameName: String(game.name || "Unknown Game"),
          coverUrl: game.cover_url || "",
          backdropUrl: game.backdrop_url || "",
          steamHeaderUrl: game.steam_header_url || "",
          steamAppId: extractSteamAppId(game.steam_appid, game.steam_header_url, game.backdrop_url, game.cover_url),
        }))
      );
    });
  }, [statsSnapshot]);

  const weekRawGames = useMemo(() => {
    return buildMostPlayedPeriodGamesThisWeek(sessionEntries, statsSnapshot?.games, library);
  }, [sessionEntries, statsSnapshot, library]);

  const sortedGames = useMemo(() => {
    return [...weekRawGames].sort((left, right) => {
      switch (sortBy) {
        case "name-asc":
          return compareText(left.name, right.name);
        case "name-desc":
          return compareText(right.name, left.name);
        case "playtime-asc":
          return compareNumber(left.total_seconds, right.total_seconds) || compareText(left.name, right.name);
        case "playtime-desc":
        default:
          return compareNumber(right.total_seconds, left.total_seconds) || compareText(left.name, right.name);
      }
    });
  }, [weekRawGames, sortBy]);

  const totalWeekSeconds = useMemo(
    () => weekRawGames.reduce((sum, g) => sum + Math.max(0, Number(g.total_seconds || 0)), 0),
    [weekRawGames]
  );

  const totalPages = Math.max(1, Math.ceil(sortedGames.length / WEEKLY_PLAYTIME_DETAIL_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const visibleGames = sortedGames.slice((currentPage - 1) * WEEKLY_PLAYTIME_DETAIL_PAGE_SIZE, currentPage * WEEKLY_PLAYTIME_DETAIL_PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [sortBy]);

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
        if (cancelled || !response || typeof response !== "object") return;
        Object.assign(steamCapsuleCache, response);
        setSteamCapsuleMap((curr) => ({ ...curr, ...response }));
      } catch {
      } finally {
        if (!cancelled) setCapsulesLoading(false);
      }
    }

    loadSteamCapsules();
    return () => {
      cancelled = true;
    };
  }, [topGameArtwork, visibleGames, steamCapsuleMap]);

  const isPageLoading = parentLoading || loadingSnapshot || (topGameArtwork === "capsule" && capsulesLoading);
  const weekRangeLabel = useMemo(() => formatCurrentWeekRangeLabel(), []);

  return (
    <div className="playtime-detail-page weekly-playtime-detail-page">
      <header className="page-header page-header-library playtime-detail-header">
        <div className="page-heading">
          <h1>This Week's Playtime</h1>
          <p className="text-xs text-gray-400 mt-1 font-medium">{weekRangeLabel}</p>
        </div>

        <div className="daily-playtime-view-table-wrap">
          <button
            type="button"
            className="daily-playtime-view-table-btn"
            onClick={onOpenTable}
            title="View Weekly Playtime History Table"
          >
            <span>View Table</span>
          </button>
        </div>
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
            <span>{weekRawGames.length} titles</span>
            <span aria-hidden="true" className="playtime-detail-topbar-separator">•</span>
            <span>Total playtime this week: {formatDurationLong(totalWeekSeconds)}</span>
          </div>
        </div>

        <article className="stats-panel playtime-detail-panel">
          <div className={`stats-topgames-list playtime-detail-list ${topGameArtwork === "capsule" ? "is-capsule" : "is-poster"}`}>
            {isPageLoading ? (
              Array.from({ length: WEEKLY_PLAYTIME_DETAIL_PAGE_SIZE }, (_, idx) => (
                <PlaytimeDetailSkeletonRow key={`skeleton-row-${idx}`} isCapsule={topGameArtwork === "capsule"} />
              ))
            ) : (
              visibleGames.map((game) => {
                const totalSeconds = Math.max(0, Number(game.total_seconds || 0));
                const isPlayed = totalSeconds > 0;
                const share = totalWeekSeconds > 0 ? (totalSeconds / totalWeekSeconds) * 100 : 0;
                const isCapsule = topGameArtwork === "capsule";
                const steamAppId = extractSteamAppId(game.steam_appid, game.steam_header_url, game.backdrop_url, game.cover_url);
                const steamCapsuleUrl = steamCapsuleMap[steamAppId] || "";

                return (
                  <div key={`${game.id}-${game.name}`} className={`stats-topgame-row playtime-detail-row${isCapsule ? " is-capsule" : ""}${isPlayed ? "" : " is-unplayed"}`}>
                    <div className="stats-topgame-meta">
                      <PlaytimeDetailArtwork game={game} artwork={topGameArtwork} steamCapsuleUrl={steamCapsuleUrl} />
                      <span>{game.name}</span>
                    </div>

                    <div className="playtime-detail-status">
                      <span className={`playtime-detail-badge is-session-badge ${getSessionBadgeClass(game.session_count)}`}>
                        <span className="playtime-detail-badge-label">
                          {game.session_count || 1} {game.session_count === 1 ? "session" : "sessions"}
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

          {!sortedGames.length && !isPageLoading ? (
            <div className="stats-empty">
              <strong>No games played this week.</strong>
              <span>Play a game this week to populate this activity list.</span>
            </div>
          ) : null}
        </article>
      </section>
    </div>
  );
}
