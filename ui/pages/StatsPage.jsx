import React, { useEffect, useMemo, useRef, useState } from "react";
import SummaryCard from "../components/SummaryCard";
import {
  extractSteamAppId,
  formatDurationLong,
  getInitials,
  resolveBackdropMedia,
  resolveCoverMedia,
  resolveGenericMedia,
  resolvePosterMedia,
  resolveSteamSmallCapsuleMediaCandidates,
} from "../lib/game-helpers";
import { invoke } from "../lib/tauri";
import {
  CalendarIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  GamepadOutlineIcon,
  TrophyIcon,
} from "../components/icons";

const KNOWN_STORES = ["Steam", "Epic Games", "GOG", "Microsoft Store", "PlayStation", "Rockstar", "EA App", "Ubisoft Connect"];
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const CHART_MODE_OPTIONS = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
];
const steamCapsuleCache = {};
const STATS_POSTER_TOP_GAMES_COUNT = 5;
const STATS_CAPSULE_TOP_GAMES_COUNT = 6;
const HEATMAP_HOUR_LABELS = [
  { hour: 0, label: "12 AM" },
  { hour: 4, label: "4 AM" },
  { hour: 8, label: "8 AM" },
  { hour: 12, label: "12 PM" },
  { hour: 16, label: "4 PM" },
  { hour: 20, label: "8 PM" },
];

export default function StatsPage({
  library,
  loading,
  topGameArtwork = "poster",
  initialStatsSnapshot = null,
  onOpenPlaytimeDetail,
  onOpenDailyPlaytime,
  onOpenWeeklyPlaytime,
  onNotify,
}) {
  const [statsSnapshot, setStatsSnapshot] = useState(() => (
    initialStatsSnapshot && typeof initialStatsSnapshot === "object"
      ? { games: Array.isArray(initialStatsSnapshot.games) ? initialStatsSnapshot.games : [] }
      : { games: [] }
  ));
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [chartMode, setChartMode] = useState("year");
  const [selectedPeriod, setSelectedPeriod] = useState("");
  const [selectedHeatmapWeek, setSelectedHeatmapWeek] = useState("");
  const [steamCapsuleMap, setSteamCapsuleMap] = useState(() => ({ ...steamCapsuleCache }));
  const hasConsumedInitialSnapshotRef = useRef(
    Boolean(initialStatsSnapshot && Array.isArray(initialStatsSnapshot.games) && initialStatsSnapshot.games.length)
  );

  function notifyStats(notice) {
    onNotify?.(notice);
  }

  function notifyStatsError(title, nextError, tone = "danger") {
    notifyStats({
      tone,
      title,
      message: nextError?.message || String(nextError),
    });
  }

  useEffect(() => {
    let cancelled = false;

    async function loadDetails() {
      if (!Array.isArray(library) || !library.length) {
        setStatsSnapshot({ games: [] });
        return;
      }

      if (hasConsumedInitialSnapshotRef.current) {
        hasConsumedInitialSnapshotRef.current = false;
        return;
      }

      setDetailsLoading(true);

      try {
        const result = await invoke("get_stats_snapshot");
        if (!cancelled) {
          setStatsSnapshot({
            games: Array.isArray(result?.games) ? result.games : [],
          });
        }
      } catch (error) {
        if (!cancelled) {
          setStatsSnapshot({ games: [] });
          notifyStatsError("Unable to load stats detail.", error);
        }
      } finally {
        if (!cancelled) {
          setDetailsLoading(false);
        }
      }
    }

    loadDetails();
    return () => {
      cancelled = true;
    };
  }, [library]);

  const sessionEntries = useMemo(() => {
    return (Array.isArray(statsSnapshot?.games) ? statsSnapshot.games : []).flatMap((game) => {
      const sessions = Array.isArray(game?.play_sessions) ? game.play_sessions : [];
      return sessions.flatMap((session) =>
        splitSessionAcrossDays(session).map((segment) => ({
          ...segment,
          gameId: Number(game.id),
          gameName: String(game.name || "Unknown Game"),
          store: normalizeStoreLabel(game.store),
          coverUrl: game.cover_url || "",
        }))
      );
    });
  }, [statsSnapshot]);

  const rawSessions = useMemo(() => {
    return (Array.isArray(statsSnapshot?.games) ? statsSnapshot.games : []).flatMap((game) => {
      const sessions = Array.isArray(game?.play_sessions) ? game.play_sessions : [];
      return sessions.map((session) => ({
        ...session,
        gameId: Number(game.id),
        gameName: String(game.name || "Unknown Game"),
      }));
    });
  }, [statsSnapshot]);

  const totalPlaytimeSeconds = useMemo(
    () => (Array.isArray(statsSnapshot?.games) ? statsSnapshot.games : []).reduce((sum, game) => sum + Number(game.total_seconds || 0), 0),
    [statsSnapshot]
  );
  const gamesPlayedCount = useMemo(
    () => (Array.isArray(statsSnapshot?.games) ? statsSnapshot.games : []).filter((game) => Number(game.total_seconds || 0) > 0).length,
    [statsSnapshot]
  );
  const weeklyComparison = useMemo(() => buildWeeklyComparison(rawSessions), [rawSessions]);
  const avgSessionDurationSeconds = useMemo(() => {
    if (!rawSessions.length) return 0;
    const totalSessionSeconds = rawSessions.reduce((sum, session) => sum + Number(session.duration_seconds || 0), 0);
    return Math.round(totalSessionSeconds / rawSessions.length);
  }, [rawSessions]);

  const summaryCards = [
    {
      id: "playtime",
      label: "TOTAL PLAYTIME",
      value: formatDurationLong(totalPlaytimeSeconds),
      caption: `${formatPercentDelta(weeklyComparison.playtimeDeltaRatio)} from last week`,
      icon: "clock",
      tone: "purple",
    },
    {
      id: "games",
      label: "GAMES PLAYED",
      value: String(gamesPlayedCount),
      caption: `${formatSignedCount(weeklyComparison.gamesDelta)} from last week`,
      icon: "gamepad",
      tone: "accent",
    },
    {
      id: "sessions",
      label: "SESSIONS",
      value: String(rawSessions.length),
      caption: `${formatSignedCount(weeklyComparison.sessionsDelta)} from last week`,
      icon: "chart",
      tone: "green",
    },
    {
      id: "avgSession",
      label: "AVG SESSION",
      value: formatDurationLong(avgSessionDurationSeconds),
      caption: "per play session",
      icon: "clock",
      tone: "gold",
    },
  ];

  const periodOptions = useMemo(
    () => buildPeriodOptions(chartMode, sessionEntries),
    [chartMode, sessionEntries]
  );

  useEffect(() => {
    if (!periodOptions.length) {
      setSelectedPeriod("");
      return;
    }

    if (!periodOptions.some((option) => option.value === selectedPeriod)) {
      setSelectedPeriod(periodOptions[0].value);
    }
  }, [periodOptions, selectedPeriod]);

  const selectedPeriodLabel = useMemo(
    () => periodOptions.find((option) => option.value === selectedPeriod)?.label || "",
    [periodOptions, selectedPeriod]
  );

  const chartData = useMemo(
    () => buildChartData(chartMode, selectedPeriod, sessionEntries),
    [chartMode, selectedPeriod, sessionEntries]
  );
  const heatmapWeekOptions = useMemo(
    () => buildPeriodOptions("week", sessionEntries),
    [sessionEntries]
  );

  useEffect(() => {
    if (!heatmapWeekOptions.length) {
      setSelectedHeatmapWeek("");
      return;
    }

    if (!heatmapWeekOptions.some((option) => option.value === selectedHeatmapWeek)) {
      setSelectedHeatmapWeek(heatmapWeekOptions[0].value);
    }
  }, [heatmapWeekOptions, selectedHeatmapWeek]);

  const storeBreakdown = useMemo(() => {
    const totals = new Map();

    (Array.isArray(statsSnapshot?.games) ? statsSnapshot.games : []).forEach((game) => {
      const key = normalizeStoreLabel(game.store);
      totals.set(key, (totals.get(key) || 0) + Number(game.total_seconds || 0));
    });

    return [...totals.entries()]
      .map(([label, totalSeconds], index) => ({
        label,
        totalSeconds,
        percent: totalPlaytimeSeconds > 0 ? (totalSeconds / totalPlaytimeSeconds) * 100 : 0,
        color: resolveStoreColor(index),
      }))
      .sort((left, right) => right.totalSeconds - left.totalSeconds || left.label.localeCompare(right.label));
  }, [statsSnapshot, totalPlaytimeSeconds]);
  const statsTopGamesLimit = topGameArtwork === "capsule" ? STATS_CAPSULE_TOP_GAMES_COUNT : STATS_POSTER_TOP_GAMES_COUNT;
  const topGames = useMemo(() => {
    const libraryMap = new Map((Array.isArray(library) ? library : []).map((game) => [Number(game.id), game]));
    return [...(Array.isArray(statsSnapshot?.games) ? statsSnapshot.games : [])]
      .filter((game) => Number(game.total_seconds || 0) > 0)
      .sort((left, right) => Number(right.total_seconds || 0) - Number(left.total_seconds || 0))
      .slice(0, statsTopGamesLimit)
      .map((game) => buildTopGameDisplayGame(game, libraryMap.get(Number(game.id)), totalPlaytimeSeconds));
  }, [library, statsSnapshot, statsTopGamesLimit, totalPlaytimeSeconds]);
  const todayTopGames = useMemo(
    () => buildMostPlayedPeriodGames(sessionEntries, statsSnapshot?.games, library, "day", statsTopGamesLimit),
    [library, sessionEntries, statsSnapshot, statsTopGamesLimit]
  );
  const weekTopGames = useMemo(
    () => buildMostPlayedPeriodGames(sessionEntries, statsSnapshot?.games, library, "week", statsTopGamesLimit),
    [library, sessionEntries, statsSnapshot, statsTopGamesLimit]
  );

  const heatmapData = useMemo(
    () => buildHeatmap(sessionEntries, selectedHeatmapWeek),
    [sessionEntries, selectedHeatmapWeek]
  );
  const combinedLoading = loading || detailsLoading;

  useEffect(() => {
    if (topGameArtwork !== "capsule") {
      return undefined;
    }

    const appIds = [...topGames, ...todayTopGames, ...weekTopGames]
      .map((game) => Number(game.steamAppId || 0))
      .filter((appid) => appid > 0);
    const missingAppIds = [...new Set(appIds)].filter((appid) => !steamCapsuleMap[appid]);

    if (!missingAppIds.length) {
      return undefined;
    }

    let cancelled = false;

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
      } catch {}
    }

    loadSteamCapsules();
    return () => {
      cancelled = true;
    };
  }, [steamCapsuleMap, todayTopGames, topGameArtwork, topGames, weekTopGames]);

  return (
    <div className="stats-page">
      <header className="page-header page-header-library stats-page-header">
        <div className="page-heading">
          <h1>Stats</h1>
        </div>
      </header>

      <section className="library-stat-grid">
        {summaryCards.map((card) => (
          <SummaryCard key={card.id} {...card} loading={combinedLoading} />
        ))}
      </section>

      <hr className="stats-section-divider" aria-hidden="true" />

      <section className="stats-main-grid">
        <article className="stats-panel stats-chart-panel">
          <div className="stats-panel-head">
            <strong>Playtime Over Time</strong>
            <div className="stats-chart-controls">
              <StatsDropdown
                options={CHART_MODE_OPTIONS}
                value={chartMode}
                onChange={setChartMode}
                ariaLabel="Select chart granularity"
              />
              <StatsPeriodPicker
                mode={chartMode}
                options={periodOptions}
                value={selectedPeriod}
                onChange={setSelectedPeriod}
                ariaLabel="Select chart period"
              />
            </div>
          </div>
          <StatsLineChart
            data={chartData}
            loading={combinedLoading}
            mode={chartMode}
            emptyLabel={selectedPeriodLabel || chartMode}
          />
        </article>

        <article className="stats-panel stats-donut-panel">
          <div className="stats-panel-head">
            <strong>Playtime by Store</strong>
          </div>
          <div className="stats-donut-layout">
            <StatsDonutChart items={storeBreakdown} totalSeconds={totalPlaytimeSeconds} loading={combinedLoading} />
            <div className="stats-donut-legend">
              {storeBreakdown.map((item) => (
                <div key={item.label} className="stats-donut-legend-row">
                  <div className="stats-donut-legend-main">
                    <i style={{ background: item.color }} aria-hidden="true" />
                    <span>{item.label}</span>
                  </div>
                  <span>{formatStorePercent(item.percent, item.totalSeconds)}</span>
                  <strong>{formatDurationLong(item.totalSeconds)}</strong>
                </div>
              ))}
            </div>
          </div>
        </article>
      </section>

      <section className="stats-bottom-grid">
        <article className="stats-panel stats-topgames-panel">
          <div className="stats-panel-head">
            <strong>Most Played Games</strong>
            <button type="button" className="stats-panel-link" onClick={onOpenPlaytimeDetail}>
              View all
            </button>
          </div>
          <div className="stats-topgames-list">
            {renderTopGameRows(topGames, "all", { artwork: topGameArtwork, steamCapsuleMap })}
          </div>
        </article>

        <article className="stats-panel stats-heatmap-panel">
          <div className="stats-panel-head">
            <strong>Playtime Heatmap</strong>
            <StatsPeriodPicker
              mode="week"
              options={heatmapWeekOptions}
              value={selectedHeatmapWeek}
              onChange={setSelectedHeatmapWeek}
              ariaLabel="Select heatmap week"
            />
          </div>
          <StatsHeatmap data={heatmapData} loading={combinedLoading} />
        </article>
      </section>

      <section className="stats-extra-grid">
        <article className="stats-panel stats-topgames-panel">
          <div className="stats-panel-head">
            <strong>Today's Playtime</strong>
            <button type="button" className="stats-panel-link" onClick={onOpenDailyPlaytime}>
              View all
            </button>
          </div>
          <div className="stats-topgames-list">
            {renderTopGameRows(todayTopGames, "today", { showEmptyPlaceholders: true, artwork: topGameArtwork, steamCapsuleMap })}
          </div>
        </article>

        <article className="stats-panel stats-topgames-panel">
          <div className="stats-panel-head">
            <strong>This Week's Playtime</strong>
            <button type="button" className="stats-panel-link" onClick={onOpenWeeklyPlaytime}>
              View all
            </button>
          </div>
          <div className="stats-topgames-list">
            {renderTopGameRows(weekTopGames, "week", { showEmptyPlaceholders: true, artwork: topGameArtwork, steamCapsuleMap })}
          </div>
        </article>
      </section>
    </div>
  );
}

function StatsLineChart({ data, loading, mode, emptyLabel }) {
  const chartData = Array.isArray(data) ? data : [];
  const maxValue = Math.max(...chartData.map((item) => Number(item.value || 0)), 1);
  const axisTop = Math.max(10, Math.ceil(maxValue / 2) * 2);
  const axisLabels = [axisTop, Math.round(axisTop * 0.75), Math.round(axisTop * 0.5), Math.round(axisTop * 0.25), 0];
  const gridStops = axisLabels.map((_, index) => (
    axisLabels.length > 1 ? (index / (axisLabels.length - 1)) * 100 : 0
  ));
  const plotLeft = 3.9;
  const plotRight = 96.5;
  const plotWidth = plotRight - plotLeft;
  const [hoveredPointKey, setHoveredPointKey] = useState("");
  const points = chartData.map((item, index) => {
    const x = chartData.length > 1
      ? plotLeft + ((index / (chartData.length - 1)) * plotWidth)
      : 50;
    const y = 100 - ((Number(item.value || 0) / axisTop) * 100);
    return {
      x,
      y,
      key: `${mode}-${item.label}-${index}`,
      ...item,
    };
  });
  const hoveredPoint = points.find((point) => point.key === hoveredPointKey) || null;
  const path = buildSmoothPath(points);
  const areaPath = path && points.length
    ? `${path} L${points[points.length - 1].x} 100 L${points[0].x} 100 Z`
    : "";

  return (
    <div className="stats-line-chart">
      <div className="stats-line-chart-axis">
        {axisLabels.map((label, index) => (
          <span key={`axis-${label}`} style={{ top: `${gridStops[index]}%` }}>{label}h</span>
        ))}
      </div>
      <div className="stats-line-chart-stage">
        <div className="stats-line-chart-grid" aria-hidden="true">
          {gridStops.map((top, index) => (
            <i key={`grid-${axisLabels[index]}-${index}`} style={{ top: `${top}%` }} />
          ))}
        </div>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id="statsChartFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#7a68ff" stopOpacity="0.42" />
              <stop offset="55%" stopColor="#7a68ff" stopOpacity="0.16" />
              <stop offset="100%" stopColor="#7a68ff" stopOpacity="0" />
            </linearGradient>
          </defs>
          {path ? <path d={areaPath} fill="url(#statsChartFill)" /> : null}
          {path ? <path d={path} fill="none" stroke="#7f6dff" strokeWidth="0.45" strokeLinecap="round" strokeLinejoin="round" /> : null}
        </svg>
        <div className="stats-line-chart-points" aria-hidden="true">
          {points.map((point) => (
            <button
              key={point.key}
              type="button"
              className={`stats-line-chart-point${hoveredPoint?.key === point.key ? " is-active" : ""}`}
              style={{ left: `${point.x}%`, top: `${point.y}%` }}
              onPointerEnter={() => setHoveredPointKey(point.key)}
              onPointerLeave={() => setHoveredPointKey("")}
            />
          ))}
        </div>
        {hoveredPoint ? (
          <div
            className="stats-chart-tooltip stats-line-chart-tooltip"
            style={{ left: `${hoveredPoint.x}%`, top: `${hoveredPoint.y}%` }}
          >
            <strong>{hoveredPoint.tooltipLabel || hoveredPoint.label}</strong>
            <span>{formatDurationLong(hoveredPoint.totalSeconds || 0)}</span>
          </div>
        ) : null}
      </div>
      <div className={`stats-line-chart-labels is-${mode}`}>
        {chartData.map((item, index) => (
          <span
            key={`label-${mode}-${item.label}`}
            style={{ left: `${points[index]?.x ?? 50}%` }}
          >
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function renderTopGameRows(items, keyPrefix, options = {}) {
  const rows = Array.isArray(items) ? items : [];
  const artwork = options.artwork === "capsule" ? "capsule" : "poster";
  const steamCapsuleMap = options.steamCapsuleMap || {};
  const targetCount = artwork === "capsule" ? STATS_CAPSULE_TOP_GAMES_COUNT : STATS_POSTER_TOP_GAMES_COUNT;
  const placeholders = Math.max(0, targetCount - rows.length);

  return (
    <>
      {rows.map((game) => (
        <div key={`${keyPrefix}-${game.id}-${game.name}`} className={`stats-topgame-row${artwork === "capsule" ? " is-capsule" : ""}`}>
          <div className="stats-topgame-meta">
            <TopGameArtwork game={game} artwork={artwork} steamCapsuleUrl={steamCapsuleMap[game.steamAppId] || ""} />
            <span>{game.name}</span>
          </div>
          <div className="stats-topgame-bar">
            <div className="stats-topgame-bar-track">
              <div style={{ width: `${Math.max(game.share, 6)}%` }} />
            </div>
          </div>
          <strong>{formatDurationLong(game.totalSeconds)}</strong>
          <small>{Math.round(game.share)}%</small>
        </div>
      ))}
      {Array.from({ length: placeholders }, (_, index) => (
        <div
          key={`${keyPrefix}-placeholder-${index}`}
          className={`stats-topgame-row is-placeholder${artwork === "capsule" ? " is-capsule" : ""}`}
          aria-hidden="true"
        >
          <div className="stats-topgame-meta is-placeholder">
            <span className={`stats-topgame-placeholder-poster${artwork === "capsule" ? " is-capsule" : ""}`} />
            <span className={`stats-topgame-placeholder-title${artwork === "capsule" ? " is-capsule" : ""}`}>
              <span className="stats-placeholder-nodata-text">No data</span>
            </span>
          </div>
          <div className="stats-topgame-bar">
            <div className="stats-topgame-bar-track">
              <div className="stats-topgame-placeholder-bar" style={{ width: `${Math.max(24, 58 - (index * 10))}%` }} />
            </div>
          </div>
          <span className="stats-topgame-placeholder-time" />
          <span className="stats-topgame-placeholder-share" />
        </div>
      ))}
    </>
  );
}

function StatsDonutChart({ items, totalSeconds, loading }) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const normalizedItems = buildVisibleDonutSegments(items, totalSeconds, circumference);
  const [hoverState, setHoverState] = useState(null);
  const hoveredItem = hoverState ? normalizedItems[hoverState.index] || null : null;

  function handlePointerMove(event) {
    if (!normalizedItems.length || totalSeconds <= 0) {
      if (hoverState !== null) {
        setHoverState(null);
      }
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const x = event.clientX - centerX;
    const y = event.clientY - centerY;
    const distance = Math.hypot(x, y);
    const outerRadius = (rect.width / 2) * 0.82;
    const innerRadius = outerRadius - 34;

    if (distance < innerRadius || distance > outerRadius + 8) {
      if (hoverState !== null) {
        setHoverState(null);
      }
      return;
    }

    const rawAngle = ((Math.atan2(y, x) * 180) / Math.PI + 90 + 360) % 360;
    const angleRatio = rawAngle / 360;
    const dashAtAngle = angleRatio * circumference;
    let cumulative = 0;
    let matchedIndex = -1;

    for (let index = 0; index < normalizedItems.length; index += 1) {
      cumulative += normalizedItems[index].visibleDash;
      if (dashAtAngle <= cumulative) {
        matchedIndex = index;
        break;
      }
    }

    if (matchedIndex === -1) {
      matchedIndex = normalizedItems.length - 1;
    }

    const nextState = {
      index: matchedIndex,
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };

    setHoverState((current) => (
      current &&
      current.index === nextState.index &&
      Math.abs(current.x - nextState.x) < 1 &&
      Math.abs(current.y - nextState.y) < 1
        ? current
        : nextState
    ));
  }

  let offset = 0;

  return (
    <div
      className="stats-donut-chart"
      onPointerMove={handlePointerMove}
      onPointerLeave={() => setHoverState(null)}
    >
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle cx="60" cy="60" r={radius} className="stats-donut-track" />
        {normalizedItems.map((item, index) => {
          const dash = item.visibleDash;
          const isActive = hoveredItem ? hoveredItem.label === item.label : false;
          const isDimmed = hoveredItem && !isActive;
          const midDash = offset + dash / 2;
          const midAngle = (midDash / circumference) * Math.PI * 2;
          const liftX = Math.cos(midAngle - Math.PI / 2) * 3.25;
          const liftY = Math.sin(midAngle - Math.PI / 2) * 3.25;
          const segment = (
            <circle
              key={item.label}
              cx="60"
              cy="60"
              r={radius}
              className="stats-donut-segment"
              style={{
                stroke: item.color,
                strokeDasharray: `${dash} ${circumference - dash}`,
                strokeDashoffset: -offset,
                opacity: isDimmed ? 0.22 : 1,
                filter: isActive ? "brightness(1.18)" : "none",
                transform: isActive ? `translate(${liftX}px, ${liftY}px)` : "translate(0, 0)",
              }}
            />
          );
          offset += dash;
          return segment;
        })}
      </svg>
      <div className="stats-donut-center">
        <strong>{hoveredItem ? formatDurationLong(hoveredItem.totalSeconds) : formatDurationLong(totalSeconds)}</strong>
        <span>{hoveredItem ? hoveredItem.label : "Total"}</span>
      </div>
      {hoveredItem && hoverState ? (
        <div
          className="stats-donut-tooltip"
          style={{
            left: `${Math.max(24, Math.min(hoverState.x, 172))}px`,
            top: `${Math.max(18, Math.min(hoverState.y - 18, 164))}px`,
          }}
        >
          <strong>{hoveredItem.label}</strong>
          <span>{formatDurationLong(hoveredItem.totalSeconds)} • {formatStorePercent(hoveredItem.percent)}</span>
        </div>
      ) : null}
    </div>
  );
}

function StatsHeatmap({ data, loading }) {
  const maxValue = Math.max(...data.flatMap((column) => column.values), 0);
  const [hoverState, setHoverState] = useState(null);

  return (
    <div className="stats-heatmap">
      <div className="stats-heatmap-head">
        <span />
        {WEEKDAY_LABELS.map((label) => <strong key={label}>{label}</strong>)}
      </div>

      <div className="stats-heatmap-grid">
        {Array.from({ length: 6 }, (_, rowIndex) => {
          const hour = rowIndex * 4;
          return (
          <React.Fragment key={`hour-${hour}`}>
            <span className="stats-heatmap-hour">
              {HEATMAP_HOUR_LABELS.find((item) => item.hour === hour)?.label || ""}
            </span>
            {data.map((column) => {
              const startSlot = rowIndex * 4;
              const slotValues = [
                column.values[startSlot] || 0,
                column.values[startSlot + 1] || 0,
                column.values[startSlot + 2] || 0,
                column.values[startSlot + 3] || 0,
              ];
              return (
                <div key={`${column.label}-${hour}`} className="stats-heatmap-day-pair">
                  <button
                    type="button"
                    className="stats-heatmap-cell"
                    style={{ "--heat": String(resolveHeatOpacity(slotValues[0], maxValue)) }}
                    onPointerEnter={(event) => {
                      const rect = event.currentTarget.getBoundingClientRect();
                      const gridRect = event.currentTarget.closest(".stats-heatmap-grid")?.getBoundingClientRect();
                      setHoverState({
                        title: formatHeatmapSlotLabel(column.label, hour),
                        value: formatDurationLong(slotValues[0]),
                        x: gridRect ? rect.left - gridRect.left + rect.width / 2 : 0,
                        y: gridRect ? rect.top - gridRect.top : 0,
                      });
                    }}
                    onPointerLeave={() => setHoverState(null)}
                  />
                  <button
                    type="button"
                    className="stats-heatmap-cell"
                    style={{ "--heat": String(resolveHeatOpacity(slotValues[1], maxValue)) }}
                    onPointerEnter={(event) => {
                      const rect = event.currentTarget.getBoundingClientRect();
                      const gridRect = event.currentTarget.closest(".stats-heatmap-grid")?.getBoundingClientRect();
                      setHoverState({
                        title: formatHeatmapSlotLabel(column.label, hour + 1),
                        value: formatDurationLong(slotValues[1]),
                        x: gridRect ? rect.left - gridRect.left + rect.width / 2 : 0,
                        y: gridRect ? rect.top - gridRect.top : 0,
                      });
                    }}
                    onPointerLeave={() => setHoverState(null)}
                  />
                  <button
                    type="button"
                    className="stats-heatmap-cell"
                    style={{ "--heat": String(resolveHeatOpacity(slotValues[2], maxValue)) }}
                    onPointerEnter={(event) => {
                      const rect = event.currentTarget.getBoundingClientRect();
                      const gridRect = event.currentTarget.closest(".stats-heatmap-grid")?.getBoundingClientRect();
                      setHoverState({
                        title: formatHeatmapSlotLabel(column.label, hour + 2),
                        value: formatDurationLong(slotValues[2]),
                        x: gridRect ? rect.left - gridRect.left + rect.width / 2 : 0,
                        y: gridRect ? rect.top - gridRect.top : 0,
                      });
                    }}
                    onPointerLeave={() => setHoverState(null)}
                  />
                  <button
                    type="button"
                    className="stats-heatmap-cell"
                    style={{ "--heat": String(resolveHeatOpacity(slotValues[3], maxValue)) }}
                    onPointerEnter={(event) => {
                      const rect = event.currentTarget.getBoundingClientRect();
                      const gridRect = event.currentTarget.closest(".stats-heatmap-grid")?.getBoundingClientRect();
                      setHoverState({
                        title: formatHeatmapSlotLabel(column.label, hour + 3),
                        value: formatDurationLong(slotValues[3]),
                        x: gridRect ? rect.left - gridRect.left + rect.width / 2 : 0,
                        y: gridRect ? rect.top - gridRect.top : 0,
                      });
                    }}
                    onPointerLeave={() => setHoverState(null)}
                  />
                </div>
              );
            })}
          </React.Fragment>
        )})}
        {hoverState ? (
          <div
            className="stats-chart-tooltip stats-heatmap-tooltip"
            style={{
              left: `${hoverState.x}px`,
              top: `${hoverState.y}px`,
            }}
          >
            <strong>{hoverState.title}</strong>
            <span>{hoverState.value}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function StatsDropdown({ options, value, onChange, ariaLabel }) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef(null);
  const activeLabel = options.find((option) => option.value === value)?.label || options[0]?.label || "No data";

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
    <div ref={rootRef} className={`stats-year-select${isOpen ? " is-open" : ""}`}>
      <button
        type="button"
        className="stats-year-trigger"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => options.length && setIsOpen((current) => !current)}
        disabled={!options.length}
      >
        <strong>{activeLabel}</strong>
        <ChevronDownIcon />
      </button>

      {isOpen ? (
        <div className="stats-year-panel">
          <div className="stats-year-option-list" role="listbox" aria-label={ariaLabel}>
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={option.value === value}
                className={`stats-year-option${option.value === value ? " is-selected" : ""}`}
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

function StatsPeriodPicker({ mode, options, value, onChange, ariaLabel }) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef(null);
  const selectedOption = options.find((option) => option.value === value) || null;
  const defaultAnchor = selectedOption?.anchor ?? options[0]?.anchor ?? null;
  const [viewAnchor, setViewAnchor] = useState(defaultAnchor);

  useEffect(() => {
    setViewAnchor(defaultAnchor);
  }, [defaultAnchor, mode]);

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

  const optionMap = useMemo(() => new Map(options.map((option) => [option.value, option])), [options]);
  const availableValues = useMemo(() => new Set(options.map((option) => option.value)), [options]);
  const anchor = viewAnchor ?? defaultAnchor ?? startOfMonthTimestamp(Math.floor(Date.now() / 1000));

  return (
    <div ref={rootRef} className={`stats-year-select stats-period-picker${isOpen ? " is-open" : ""}`}>
      <button
        type="button"
        className="stats-year-trigger"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={() => options.length && setIsOpen((current) => !current)}
        disabled={!options.length}
      >
        <strong>{selectedOption?.label || options[0]?.label || "No data"}</strong>
        <ChevronDownIcon />
      </button>

      {isOpen ? (
        <div className="stats-year-panel stats-period-panel" role="dialog" aria-label={ariaLabel}>
          {mode === "day" ? (
            <PeriodDayCalendar
              anchor={anchor}
              selectedValue={value}
              optionMap={optionMap}
              onNavigate={setViewAnchor}
              onSelect={(nextValue) => {
                onChange(nextValue);
                setIsOpen(false);
              }}
            />
          ) : null}

          {mode === "week" ? (
            <PeriodWeekCalendar
              anchor={anchor}
              selectedValue={value}
              optionMap={optionMap}
              availableValues={availableValues}
              onNavigate={setViewAnchor}
              onSelect={(nextValue) => {
                onChange(nextValue);
                setIsOpen(false);
              }}
            />
          ) : null}

          {mode === "month" ? (
            <PeriodMonthGrid
              anchor={anchor}
              selectedValue={value}
              optionMap={optionMap}
              onNavigate={setViewAnchor}
              onSelect={(nextValue) => {
                onChange(nextValue);
                setIsOpen(false);
              }}
            />
          ) : null}

          {mode === "year" ? (
            <PeriodYearGrid
              anchor={anchor}
              selectedValue={value}
              optionMap={optionMap}
              onNavigate={setViewAnchor}
              onSelect={(nextValue) => {
                onChange(nextValue);
                setIsOpen(false);
              }}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function PeriodDayCalendar({ anchor, selectedValue, optionMap, onNavigate, onSelect }) {
  const [isYearPickerOpen, setIsYearPickerOpen] = useState(false);
  const monthDays = buildMonthCalendarDays(anchor);
  const title = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(new Date(anchor * 1000));
  const anchorYear = new Date(anchor * 1000).getFullYear();
  const startYear = anchorYear - (anchorYear % 12);

  if (isYearPickerOpen) {
    return (
      <div className="stats-period-grid">
        <div className="stats-calendar-head">
          <button type="button" className="stats-calendar-nav" onClick={() => onNavigate(shiftYear(anchor, -12))}>
            <ChevronLeftIcon />
          </button>
          <strong>{startYear} - {startYear + 11}</strong>
          <button type="button" className="stats-calendar-nav" onClick={() => onNavigate(shiftYear(anchor, 12))}>
            <ChevronRightIcon />
          </button>
        </div>
        <div className="stats-year-grid">
          {Array.from({ length: 12 }, (_, index) => startYear + index).map((year) => (
            <button
              key={year}
              type="button"
              className={`stats-month-tile${year === anchorYear ? " is-selected" : ""}`}
              onClick={() => {
                onNavigate(setAnchorYear(anchor, year));
                setIsYearPickerOpen(false);
              }}
            >
              {year}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="stats-calendar">
      <div className="stats-calendar-head">
        <button type="button" className="stats-calendar-nav" onClick={() => onNavigate(shiftMonth(anchor, -1))}>
          <ChevronLeftIcon />
        </button>
        <button type="button" className="stats-calendar-title-button" onClick={() => setIsYearPickerOpen(true)}>
          <strong>{title}</strong>
        </button>
        <button type="button" className="stats-calendar-nav" onClick={() => onNavigate(shiftMonth(anchor, 1))}>
          <ChevronRightIcon />
        </button>
      </div>
      <div className="stats-calendar-weekdays">
        {WEEKDAY_LABELS.map((label) => <span key={label}>{label}</span>)}
      </div>
      <div className="stats-calendar-grid">
        {monthDays.map((day) => {
          const option = optionMap.get(day.key);
          const isSelected = selectedValue === day.key;
          return (
            <button
              key={day.key}
              type="button"
              className={`stats-calendar-day${day.isCurrentMonth ? "" : " is-outside"}${option ? "" : " is-disabled"}${isSelected ? " is-selected" : ""}`}
              disabled={!option}
              onClick={() => option && onSelect(option.value)}
            >
              {day.dayOfMonth}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PeriodWeekCalendar({ anchor, selectedValue, optionMap, availableValues, onNavigate, onSelect }) {
  const [isYearPickerOpen, setIsYearPickerOpen] = useState(false);
  const weeks = buildMonthWeeks(anchor);
  const title = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(new Date(anchor * 1000));
  const anchorYear = new Date(anchor * 1000).getFullYear();
  const startYear = anchorYear - (anchorYear % 12);

  if (isYearPickerOpen) {
    return (
      <div className="stats-period-grid">
        <div className="stats-calendar-head">
          <button type="button" className="stats-calendar-nav" onClick={() => onNavigate(shiftYear(anchor, -12))}>
            <ChevronLeftIcon />
          </button>
          <strong>{startYear} - {startYear + 11}</strong>
          <button type="button" className="stats-calendar-nav" onClick={() => onNavigate(shiftYear(anchor, 12))}>
            <ChevronRightIcon />
          </button>
        </div>
        <div className="stats-year-grid">
          {Array.from({ length: 12 }, (_, index) => startYear + index).map((year) => (
            <button
              key={year}
              type="button"
              className={`stats-month-tile${year === anchorYear ? " is-selected" : ""}`}
              onClick={() => {
                onNavigate(setAnchorYear(anchor, year));
                setIsYearPickerOpen(false);
              }}
            >
              {year}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="stats-calendar">
      <div className="stats-calendar-head">
        <button type="button" className="stats-calendar-nav" onClick={() => onNavigate(shiftMonth(anchor, -1))}>
          <ChevronLeftIcon />
        </button>
        <button type="button" className="stats-calendar-title-button" onClick={() => setIsYearPickerOpen(true)}>
          <strong>{title}</strong>
        </button>
        <button type="button" className="stats-calendar-nav" onClick={() => onNavigate(shiftMonth(anchor, 1))}>
          <ChevronRightIcon />
        </button>
      </div>
      <div className="stats-calendar-weekdays">
        {WEEKDAY_LABELS.map((label) => <span key={label}>{label}</span>)}
      </div>
      <div className="stats-calendar-week-list">
        {weeks.map((week) => {
          const weekKey = formatDayKey(week[0].timestamp);
          const option = optionMap.get(weekKey);
          const isSelected = selectedValue === weekKey;
          const isAvailable = availableValues.has(weekKey);
          return (
            <button
              key={weekKey}
              type="button"
              className={`stats-calendar-week-row${isSelected ? " is-selected" : ""}${isAvailable ? "" : " is-disabled"}`}
              disabled={!option}
              onClick={() => option && onSelect(option.value)}
            >
              {week.map((day) => (
                <span key={day.key} className={day.isCurrentMonth ? "" : "is-outside"}>
                  {day.dayOfMonth}
                </span>
              ))}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PeriodMonthGrid({ anchor, selectedValue, optionMap, onNavigate, onSelect }) {
  const year = new Date(anchor * 1000).getFullYear();
  const months = MONTH_LABELS.map((label, index) => {
    const timestamp = new Date(year, index, 1).getTime() / 1000;
    const key = formatMonthKey(timestamp);
    return { key, label, option: optionMap.get(key) || null };
  });

  return (
    <div className="stats-period-grid">
      <div className="stats-calendar-head">
        <button type="button" className="stats-calendar-nav" onClick={() => onNavigate(shiftYear(anchor, -1))}>
          <ChevronLeftIcon />
        </button>
        <strong>{year}</strong>
        <button type="button" className="stats-calendar-nav" onClick={() => onNavigate(shiftYear(anchor, 1))}>
          <ChevronRightIcon />
        </button>
      </div>
      <div className="stats-month-grid">
        {months.map((month) => (
          <button
            key={month.key}
            type="button"
            className={`stats-month-tile${selectedValue === month.key ? " is-selected" : ""}${month.option ? "" : " is-disabled"}`}
            disabled={!month.option}
            onClick={() => month.option && onSelect(month.option.value)}
          >
            {month.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function PeriodYearGrid({ anchor, selectedValue, optionMap, onNavigate, onSelect }) {
  const anchorYear = new Date(anchor * 1000).getFullYear();
  const startYear = anchorYear - (anchorYear % 12);
  const years = Array.from({ length: 12 }, (_, index) => startYear + index);

  return (
    <div className="stats-period-grid">
      <div className="stats-calendar-head">
        <button type="button" className="stats-calendar-nav" onClick={() => onNavigate(shiftYear(anchor, -12))}>
          <ChevronLeftIcon />
        </button>
        <strong>{startYear} - {startYear + 11}</strong>
        <button type="button" className="stats-calendar-nav" onClick={() => onNavigate(shiftYear(anchor, 12))}>
          <ChevronRightIcon />
        </button>
      </div>
      <div className="stats-year-grid">
        {years.map((year) => {
          const key = String(year);
          const option = optionMap.get(key) || null;
          return (
            <button
              key={key}
              type="button"
              className={`stats-month-tile${selectedValue === key ? " is-selected" : ""}${option ? "" : " is-disabled"}`}
              disabled={!option}
              onClick={() => option && onSelect(option.value)}
            >
              {year}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function buildWeeklyComparison(sessions) {
  const now = Math.floor(Date.now() / 1000);
  const currentStart = now - 7 * 86400;
  const previousStart = currentStart - 7 * 86400;
  const currentGames = new Set();
  const previousGames = new Set();
  let currentPlaytime = 0;
  let previousPlaytime = 0;
  let currentSessions = 0;
  let previousSessions = 0;

  sessions.forEach((session) => {
    const endedAt = Number(session.ended_at || now);
    const duration = Math.max(0, Number(session.duration_seconds || 0));
    const bucketKey = String(session.gameId || session.gameName || "");

    if (endedAt >= currentStart) {
      currentPlaytime += duration;
      currentSessions += 1;
      if (bucketKey) {
        currentGames.add(bucketKey);
      }
      return;
    }

    if (endedAt >= previousStart && endedAt < currentStart) {
      previousPlaytime += duration;
      previousSessions += 1;
      if (bucketKey) {
        previousGames.add(bucketKey);
      }
    }
  });

  return {
    playtimeDeltaRatio: previousPlaytime > 0 ? (currentPlaytime - previousPlaytime) / previousPlaytime : (currentPlaytime > 0 ? 1 : 0),
    gamesDelta: currentGames.size - previousGames.size,
    sessionsDelta: currentSessions - previousSessions,
  };
}

function TopGameArtwork({ game, artwork = "poster", steamCapsuleUrl = "" }) {
  const normalizedArtwork = artwork === "capsule" ? "capsule" : "poster";
  const candidates = normalizedArtwork === "capsule"
    ? [
        resolveGenericMedia(steamCapsuleUrl) ? { src: resolveGenericMedia(steamCapsuleUrl), kind: "capsule" } : null,
        ...(Array.isArray(game?.capsuleCandidates) ? game.capsuleCandidates : []),
      ].filter(Boolean)
    : Array.isArray(game?.posterCandidates) ? game.posterCandidates : [];
  const [sourceIndex, setSourceIndex] = useState(0);
  const currentCandidate = candidates[sourceIndex] || null;
  const currentSource = currentCandidate?.src || "";

  useEffect(() => {
    setSourceIndex(0);
  }, [normalizedArtwork, game?.id, game?.name, candidates.join("|")]);

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
      onError={() => {
        setSourceIndex((current) => (current < candidates.length ? current + 1 : current));
      }}
    />
  );
}

function buildTopGameDisplayGame(game, libraryGame, totalSecondsBase) {
  const gameId = Number(game?.id || 0);
  const gameName = String(game?.name || "Unknown Game");
  const totalSeconds = Number(game?.total_seconds ?? game?.totalSeconds ?? 0);
  const share = totalSecondsBase > 0 ? (totalSeconds / totalSecondsBase) * 100 : Number(game?.share || 0);
  const coverUrl = game?.cover_url || libraryGame?.cover_url || "";
  const backdropUrl = game?.backdrop_url || libraryGame?.backdrop_url || "";
  const steamHeaderUrl = game?.steam_header_url || libraryGame?.steam_header_url || "";
  const steamAppId = extractSteamAppId(
    game?.steam_appid,
    libraryGame?.steam_appid,
    steamHeaderUrl,
    backdropUrl,
    coverUrl
  );
  const capsuleCandidates = [...new Set([
    ...resolveSteamSmallCapsuleMediaCandidates(steamAppId, steamHeaderUrl, coverUrl),
    resolveBackdropMedia(backdropUrl),
  ].filter(Boolean))].map((src, index) => ({
    src,
    kind: index < 2 ? "capsule" : "backdrop",
  }));
  const posterCandidates = [...new Set([
    resolvePosterMedia(coverUrl),
    resolveCoverMedia(coverUrl),
    resolveGenericMedia(steamHeaderUrl),
  ].filter(Boolean))].map((src) => ({
    src,
    kind: "poster",
  }));

  return {
    id: gameId,
    name: gameName,
    steamAppId,
    totalSeconds,
    share,
    capsuleCandidates,
    posterCandidates,
  };
}

function buildMostPlayedPeriodGames(sessionEntries, games, library, mode, limit = STATS_POSTER_TOP_GAMES_COUNT) {
  const entries = Array.isArray(sessionEntries) ? sessionEntries : [];
  const gameList = Array.isArray(games) ? games : [];
  const gameById = new Map(gameList.map((game) => [Number(game.id), game]));
  const libraryById = new Map((Array.isArray(library) ? library : []).map((game) => [Number(game.id), game]));
  const totals = new Map();
  const now = new Date();
  const periodStart = mode === "week"
    ? startOfWeekMonday(Math.floor(now.getTime() / 1000))
    : localMidnightTimestamp(Math.floor(now.getTime() / 1000));
  const periodEnd = mode === "week"
    ? periodStart + 7 * 86400
    : periodStart + 86400;

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
      totalSeconds: 0,
    };
    current.totalSeconds += durationSeconds;
    totals.set(key, current);
  });

  const items = [...totals.values()]
    .filter((game) => game.totalSeconds > 0)
    .sort((left, right) => right.totalSeconds - left.totalSeconds || left.name.localeCompare(right.name))
    .slice(0, limit);
  const totalSeconds = items.reduce((sum, game) => sum + game.totalSeconds, 0);

  return items.map((game) => buildTopGameDisplayGame(
    {
      ...game,
      cover_url: gameById.get(game.id)?.cover_url || "",
      backdrop_url: gameById.get(game.id)?.backdrop_url || "",
      steam_header_url: gameById.get(game.id)?.steam_header_url || "",
      steam_appid: gameById.get(game.id)?.steam_appid || 0,
    },
    libraryById.get(game.id),
    totalSeconds
  ));
}

function buildPeriodOptions(mode, sessions) {
  if (mode === "day") {
    const dayKeys = new Map();

    sessions.forEach((session) => {
      const key = formatDayKey(session.started_at);
      if (!dayKeys.has(key)) {
        dayKeys.set(key, {
          value: key,
          label: formatDayLabel(session.started_at),
          anchor: startOfMonthTimestamp(session.started_at),
        });
      }
    });

    return [...dayKeys.values()].sort((left, right) => right.value.localeCompare(left.value));
  }

  if (mode === "week") {
    const weekKeys = new Map();

    sessions.forEach((session) => {
      const monday = startOfWeekMonday(Number(session.started_at || 0));
      const key = formatDayKey(monday);
      if (!weekKeys.has(key)) {
        weekKeys.set(key, {
          value: key,
          label: formatWeekLabel(monday),
          anchor: startOfMonthTimestamp(monday),
        });
      }
    });

    return [...weekKeys.values()].sort((left, right) => right.value.localeCompare(left.value));
  }

  if (mode === "month") {
    const monthKeys = new Map();

    sessions.forEach((session) => {
      const key = formatMonthKey(session.started_at);
      if (!monthKeys.has(key)) {
        monthKeys.set(key, {
          value: key,
          label: formatMonthLabel(session.started_at),
          anchor: startOfYearTimestamp(session.started_at),
        });
      }
    });

    return [...monthKeys.values()].sort((left, right) => right.value.localeCompare(left.value));
  }

  const yearKeys = new Map();
  sessions.forEach((session) => {
    const key = String(new Date(Number(session.started_at || 0) * 1000).getFullYear());
    if (!yearKeys.has(key)) {
      yearKeys.set(key, { value: key, label: key, anchor: startOfYearTimestamp(session.started_at) });
    }
  });

  return [...yearKeys.values()].sort((left, right) => Number(right.value) - Number(left.value));
}

function buildChartData(mode, selectedPeriod, sessions) {
  if (!selectedPeriod) {
    return [];
  }

  if (mode === "day") {
    const hourTotals = new Array(12).fill(0);

    sessions.forEach((session) => {
      if (formatDayKey(session.started_at) !== selectedPeriod) {
        return;
      }

      const bucketIndex = Math.floor(new Date(Number(session.started_at || 0) * 1000).getHours() / 2);
      hourTotals[bucketIndex] += Number(session.duration_seconds || 0);
    });

    return hourTotals.map((totalSeconds, index) => ({
      label: String(index * 2).padStart(2, "0"),
      tooltipLabel: formatDayRangeLabel(selectedPeriod, index * 2),
      value: totalSeconds / 3600,
      totalSeconds,
    }));
  }

  if (mode === "week") {
    const weekdayTotals = new Array(7).fill(0);

    sessions.forEach((session) => {
      if (formatDayKey(startOfWeekMonday(session.started_at)) !== selectedPeriod) {
        return;
      }

      const date = new Date(Number(session.started_at || 0) * 1000);
      weekdayTotals[normalizeWeekdayIndex(date.getDay())] += Number(session.duration_seconds || 0);
    });

    return WEEKDAY_LABELS.map((label, index) => ({
      label,
      tooltipLabel: formatWeekdayDateLabel(selectedPeriod, index),
      value: weekdayTotals[index] / 3600,
      totalSeconds: weekdayTotals[index],
    }));
  }

  if (mode === "month") {
    const [yearPart, monthPart] = String(selectedPeriod).split("-");
    const year = Number(yearPart);
    const monthIndex = Number(monthPart) - 1;
    if (!Number.isInteger(year) || !Number.isInteger(monthIndex) || monthIndex < 0 || monthIndex > 11) {
      return [];
    }
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    if (!Number.isInteger(daysInMonth) || daysInMonth <= 0) {
      return [];
    }
    const dayTotals = new Array(daysInMonth).fill(0);

    sessions.forEach((session) => {
      if (formatMonthKey(session.started_at) !== selectedPeriod) {
        return;
      }

      const dayIndex = new Date(Number(session.started_at || 0) * 1000).getDate() - 1;
      dayTotals[dayIndex] += Number(session.duration_seconds || 0);
    });

    return dayTotals.map((totalSeconds, index) => ({
      label: String(index + 1).padStart(2, "0"),
      tooltipLabel: formatMonthDayLabel(year, monthIndex, index + 1),
      value: totalSeconds / 3600,
      totalSeconds,
    }));
  }

  const monthTotals = new Array(12).fill(0);
  sessions.forEach((session) => {
    const date = new Date(Number(session.started_at || 0) * 1000);
    if (String(date.getFullYear()) !== selectedPeriod) {
      return;
    }
    monthTotals[date.getMonth()] += Number(session.duration_seconds || 0);
  });

  return MONTH_LABELS.map((label, index) => ({
    label,
    tooltipLabel: formatYearMonthLabel(selectedPeriod, index),
    value: monthTotals[index] / 3600,
    totalSeconds: monthTotals[index],
  }));
}

function buildHeatmap(sessions, selectedDay) {
  const columns = WEEKDAY_LABELS.map((label) => ({
    label,
    values: new Array(24).fill(0),
  }));
  if (!selectedDay) {
    return columns;
  }

  const selectedTimestamp = dayKeyToTimestamp(selectedDay);
  const weekStart = startOfWeekMonday(selectedTimestamp);
  const weekEnd = weekStart + 7 * 86400;

  sessions.forEach((session) => {
    splitSessionAcrossHours(session).forEach((segment) => {
      const date = new Date(Number(segment.started_at || 0) * 1000);
      const segmentTimestamp = Number(segment.started_at || 0);
      if (segmentTimestamp < weekStart || segmentTimestamp >= weekEnd) {
        return;
      }
      const weekdayIndex = normalizeWeekdayIndex(date.getDay());
      const slotIndex = date.getHours();
      columns[weekdayIndex].values[slotIndex] += Number(segment.duration_seconds || 0);
    });
  });

  return columns;
}

function formatDayRangeLabel(dayKey, startHour) {
  return `${String(startHour).padStart(2, "0")}:00-${String(startHour + 1).padStart(2, "0")}:59`;
}

function formatWeekdayDateLabel(weekKey, weekdayIndex) {
  const weekStart = dayKeyToTimestamp(weekKey);
  const date = new Date((weekStart + weekdayIndex * 86400) * 1000);
  if (Number.isNaN(date.getTime())) {
    return WEEKDAY_LABELS[weekdayIndex] || "";
  }

  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatMonthDayLabel(year, monthIndex, day) {
  const date = new Date(year, monthIndex, day);
  if (Number.isNaN(date.getTime())) {
    return String(day).padStart(2, "0");
  }

  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatYearMonthLabel(year, monthIndex) {
  const date = new Date(Number(year), monthIndex, 1);
  if (Number.isNaN(date.getTime())) {
    return MONTH_LABELS[monthIndex] || "";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "long",
  }).format(date);
}

function formatHeatmapSlotLabel(dayLabel, hour) {
  return `${dayLabel} ${String(hour).padStart(2, "0")}:00-${String(hour).padStart(2, "0")}:59`;
}

function splitSessionAcrossHours(session) {
  const start = Number(session?.started_at || 0);
  const end = Number(session?.ended_at || 0);
  const totalDuration = Math.max(0, Number(session?.duration_seconds || 0));
  if (start <= 0 || end <= start || totalDuration <= 0) {
    return [];
  }

  const segments = [];
  let currentStart = start;
  let remaining = totalDuration;

  while (remaining > 0 && currentStart < end) {
    const nextHour = localHourTimestamp(currentStart) + 3600;
    const segmentEnd = Math.min(end, nextHour);
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

function localMidnightTimestamp(timestamp) {
  const date = new Date(timestamp * 1000);
  date.setHours(0, 0, 0, 0);
  return Math.floor(date.getTime() / 1000);
}

function startOfWeekMonday(timestamp) {
  const date = new Date(Number(timestamp || 0) * 1000);
  date.setHours(0, 0, 0, 0);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return Math.floor(date.getTime() / 1000);
}

function startOfMonthTimestamp(timestamp) {
  const date = new Date(Number(timestamp || 0) * 1000);
  date.setHours(0, 0, 0, 0);
  date.setDate(1);
  return Math.floor(date.getTime() / 1000);
}

function startOfYearTimestamp(timestamp) {
  const date = new Date(Number(timestamp || 0) * 1000);
  date.setHours(0, 0, 0, 0);
  date.setMonth(0, 1);
  return Math.floor(date.getTime() / 1000);
}

function localHourTimestamp(timestamp) {
  const date = new Date(timestamp * 1000);
  date.setMinutes(0, 0, 0);
  return Math.floor(date.getTime() / 1000);
}

function normalizeWeekdayIndex(jsDay) {
  return jsDay === 0 ? 6 : jsDay - 1;
}

function formatDayKey(timestamp) {
  const date = new Date(Number(timestamp || 0) * 1000);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function dayKeyToTimestamp(value) {
  const [year, month, day] = String(value || "").split("-").map(Number);
  if (!year || !month || !day) {
    return 0;
  }
  return Math.floor(new Date(year, month - 1, day).getTime() / 1000);
}

function formatMonthKey(timestamp) {
  const date = new Date(Number(timestamp || 0) * 1000);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function formatDayLabel(timestamp) {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(Number(timestamp || 0) * 1000));
}

function formatMonthLabel(timestamp) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(new Date(Number(timestamp || 0) * 1000));
}

function shiftMonth(timestamp, offset) {
  const date = new Date(Number(timestamp || 0) * 1000);
  date.setHours(0, 0, 0, 0);
  date.setDate(1);
  date.setMonth(date.getMonth() + offset);
  return Math.floor(date.getTime() / 1000);
}

function shiftYear(timestamp, offset) {
  const date = new Date(Number(timestamp || 0) * 1000);
  date.setHours(0, 0, 0, 0);
  date.setMonth(0, 1);
  date.setFullYear(date.getFullYear() + offset);
  return Math.floor(date.getTime() / 1000);
}

function setAnchorYear(timestamp, year) {
  const date = new Date(Number(timestamp || 0) * 1000);
  date.setHours(0, 0, 0, 0);
  date.setFullYear(Number(year || date.getFullYear()));
  date.setDate(1);
  return Math.floor(date.getTime() / 1000);
}

function buildMonthCalendarDays(anchorTimestamp) {
  const anchorDate = new Date(Number(anchorTimestamp || 0) * 1000);
  const monthStart = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1);
  const gridStart = new Date(monthStart);
  gridStart.setDate(monthStart.getDate() - normalizeWeekdayIndex(monthStart.getDay()));

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    const timestamp = Math.floor(date.getTime() / 1000);
    return {
      timestamp,
      key: formatDayKey(timestamp),
      dayOfMonth: date.getDate(),
      isCurrentMonth: date.getMonth() === anchorDate.getMonth(),
    };
  });
}

function buildMonthWeeks(anchorTimestamp) {
  const days = buildMonthCalendarDays(anchorTimestamp);
  return Array.from({ length: 6 }, (_, index) => days.slice(index * 7, index * 7 + 7));
}

function formatWeekLabel(mondayTimestamp) {
  const start = new Date(Number(mondayTimestamp || 0) * 1000);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return `W${getIsoWeekNumber(start)} • ${new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(start)} - ${new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(end)}`;
}

function getIsoWeekNumber(dateInput) {
  const date = new Date(dateInput);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
  const firstThursday = new Date(date.getFullYear(), 0, 4);
  firstThursday.setDate(firstThursday.getDate() + 3 - ((firstThursday.getDay() + 6) % 7));
  return 1 + Math.round((date - firstThursday) / 604800000);
}

function normalizeStoreLabel(value) {
  const label = String(value || "").trim();
  if (!label) {
    return "Non-Store";
  }

  const normalized = label.toLowerCase().replace(/\s+/g, " ").trim();
  const aliasMap = new Map([
    ["steam", "Steam"],
    ["epic", "Epic Games"],
    ["epic games", "Epic Games"],
    ["epic games store", "Epic Games"],
    ["gog", "GOG"],
    ["gog.com", "GOG"],
    ["microsoft", "Microsoft Store"],
    ["microsoft store", "Microsoft Store"],
    ["ms store", "Microsoft Store"],
    ["xbox app", "Microsoft Store"],
    ["playstation", "PlayStation"],
    ["ps", "PlayStation"],
    ["rockstar", "Rockstar"],
    ["rockstar games", "Rockstar"],
    ["ea", "EA App"],
    ["ea app", "EA App"],
    ["origin", "EA App"],
    ["ubisoft", "Ubisoft Connect"],
    ["ubisoft connect", "Ubisoft Connect"],
    ["uplay", "Ubisoft Connect"],
    ["manual", "Non-Store"],
    ["pc", "Non-Store"],
    ["non-store", "Non-Store"],
    ["non store", "Non-Store"],
  ]);

  if (aliasMap.has(normalized)) {
    return aliasMap.get(normalized) || "Non-Store";
  }

  const matchedStore = KNOWN_STORES.find((item) => item.toLowerCase() === normalized);
  return matchedStore || label;
}

function buildVisibleDonutSegments(items, totalSeconds, circumference) {
  if (!items.length || totalSeconds <= 0) {
    return items.map((item) => ({ ...item, visibleDash: 0 }));
  }

  const raw = items.map((item) => ({
    ...item,
    rawDash: (item.totalSeconds / totalSeconds) * circumference,
  }));
  const positiveCount = raw.filter((item) => item.rawDash > 0).length;
  const minDash = positiveCount > 1 ? 3.5 : 0;

  const boosted = raw.map((item) => ({
    ...item,
    visibleDash: item.rawDash > 0 ? Math.max(item.rawDash, minDash) : 0,
  }));

  const totalVisible = boosted.reduce((sum, item) => sum + item.visibleDash, 0);
  if (totalVisible <= circumference) {
    return boosted;
  }

  const overflow = totalVisible - circumference;
  const largest = boosted.reduce((best, item, index, list) => (
    item.visibleDash > list[best].visibleDash ? index : best
  ), 0);

  return boosted.map((item, index) => (
    index === largest
      ? { ...item, visibleDash: Math.max(0, item.visibleDash - overflow) }
      : item
  ));
}

function resolveStoreColor(index) {
  const palette = ["#7068ff", "#4d86ff", "#67c784", "#f1b548", "#ff7f66", "#4fc9cf", "#d277ff", "#8792a8"];
  return palette[index % palette.length];
}

function resolveHeatOpacity(value, maxValue) {
  if (!value || !maxValue) {
    return 0.1;
  }
  return Math.max(0.18, Math.min(1, value / maxValue));
}

function formatPercentDelta(value) {
  const percent = Math.round(Math.abs(Number(value || 0)) * 100);
  const sign = Number(value || 0) >= 0 ? "+" : "-";
  return `${sign}${percent}%`;
}

function formatSignedCount(value) {
  const safeValue = Number(value || 0);
  return `${safeValue >= 0 ? "+" : ""}${safeValue}`;
}

function formatStorePercent(percent, totalSeconds) {
  if (totalSeconds > 0 && percent > 0 && percent < 1) {
    return "<1%";
  }
  return `${Math.round(percent)}%`;
}

function buildSmoothPath(points) {
  if (!points.length) {
    return "";
  }

  if (points.length === 1) {
    return `M${points[0].x} ${points[0].y}`;
  }

  let path = `M${points[0].x} ${points[0].y}`;

  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    const offset = (next.x - current.x) * 0.42;
    path += ` C${current.x + offset} ${current.y}, ${next.x - offset} ${next.y}, ${next.x} ${next.y}`;
  }

  return path;
}
