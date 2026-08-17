import React, { useEffect, useRef, useState } from "react";
import {
  buildBackdropPresentationStyle,
  buildBackdropStyle,
  extractSteamAppId,
  formatDurationDetailed,
  formatDurationLong,
  getInitials,
  resolveBackdropMedia,
  resolveCoverMedia,
  resolveGenericMedia,
  resolvePosterMedia,
  resolveSteamSmallCapsuleMediaCandidates,
} from "../lib/game-helpers";
import { DASHBOARD_NOTIFICATION_LIMIT, formatNotificationDetail, resolveNotificationTone } from "../lib/notifications";
import {
  BellIcon,
  CalendarIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  GamepadOutlineIcon,
  PlaySolidIcon,
  PlayTriangleIcon,
  StopwatchIcon,
} from "../components/icons";
import { invoke } from "../lib/tauri";

const steamCapsuleCache = {};
const POSTER_TOP_GAMES_COUNT = 4;
const CAPSULE_TOP_GAMES_COUNT = 5;

export function clearSteamCapsuleCache() {
  Object.keys(steamCapsuleCache).forEach((key) => {
    delete steamCapsuleCache[key];
  });
}

export default function DashboardPage({
  dashboard,
  library,
  loading = false,
  topGameArtwork = "poster",
  notifications,
  unreadNotificationCount,
  initialDayOverview = null,
  initialWeekOverview = null,
  initialDailyOverview = null,
  initialChartModeOverview = null,
  onOpenGameDetail,
  onOpenTodayDetail,
  onOpenWeekDetail,
  onOpenAllNotifications,
  onNotificationsOpened,
}) {
  const activeGames = Array.isArray(dashboard?.active_games) ? dashboard.active_games : [];
  const [activeGameIndex, setActiveGameIndex] = useState(0);
  const [dayOverview, setDayOverview] = useState(() => Array.isArray(initialDayOverview?.buckets) ? initialDayOverview.buckets : []);
  const [weekOverview, setWeekOverview] = useState(() => Array.isArray(initialWeekOverview?.buckets) ? initialWeekOverview.buckets : []);
  const [chartMode, setChartMode] = useState("week");
  const [playtimeOverview, setPlaytimeOverview] = useState(() => Array.isArray(initialChartModeOverview?.buckets) ? initialChartModeOverview.buckets : []);
  const [dailyOverview, setDailyOverview] = useState(() => Array.isArray(initialDailyOverview?.days) ? initialDailyOverview.days : []);
  const [hoveredChartItemKey, setHoveredChartItemKey] = useState("");
  const [showPlaytimeTimeLabels, setShowPlaytimeTimeLabels] = useState(false);
  const [recentPageIndex, setRecentPageIndex] = useState(0);
  const [previousRecentPageIndex, setPreviousRecentPageIndex] = useState(0);
  const [isRecentAnimating, setIsRecentAnimating] = useState(false);
  const [dragState, setDragState] = useState({ active: false, startX: 0, deltaX: 0 });
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [steamCapsuleMap, setSteamCapsuleMap] = useState(() => ({ ...steamCapsuleCache }));
  const notificationRef = useRef(null);
  const hasConsumedInitialDetailsRef = useRef(
    Array.isArray(initialDayOverview?.buckets)
    || Array.isArray(initialWeekOverview?.buckets)
    || Array.isArray(initialDailyOverview?.days)
  );
  const hasConsumedInitialChartRef = useRef(Array.isArray(initialChartModeOverview?.buckets));
  const activeGameIds = new Set(activeGames.map((game) => Number(game.game_id || 0)).filter(Boolean));
  const activeGameNames = new Set(activeGames.map((game) => String(game.name || "").trim().toLowerCase()).filter(Boolean));

  useEffect(() => {
    setActiveGameIndex((value) => {
      if (!activeGames.length) {
        return 0;
      }
      return value % activeGames.length;
    });
  }, [activeGames.length]);

  useEffect(() => {
    if (activeGames.length <= 1) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setActiveGameIndex((current) => (current + 1) % activeGames.length);
    }, 8000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [activeGameIndex, activeGames.length]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setShowPlaytimeTimeLabels((current) => !current);
    }, 8000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [showPlaytimeTimeLabels]);

  useEffect(() => {
    let cancelled = false;

    if (hasConsumedInitialDetailsRef.current) {
      hasConsumedInitialDetailsRef.current = false;
      return () => {
        cancelled = true;
      };
    }

    async function loadDashboardDetails() {
      try {
        const [nextDayOverview, nextWeekOverview, nextDailyOverview] = await Promise.all([
          invoke("get_playtime_overview", { mode: "day" }),
          invoke("get_playtime_overview", { mode: "week" }),
          invoke("get_daily_playtime_overview"),
        ]);
        if (cancelled) {
          return;
        }

        setDayOverview(Array.isArray(nextDayOverview?.buckets) ? nextDayOverview.buckets : []);
        setWeekOverview(Array.isArray(nextWeekOverview?.buckets) ? nextWeekOverview.buckets : []);
        setDailyOverview(Array.isArray(nextDailyOverview?.days) ? nextDailyOverview.days : []);
      } catch {
        if (!cancelled) {
          setDayOverview([]);
          setWeekOverview([]);
          setDailyOverview([]);
        }
      }
    }

    loadDashboardDetails();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (chartMode === "week" && hasConsumedInitialChartRef.current) {
      hasConsumedInitialChartRef.current = false;
      return () => {
        cancelled = true;
      };
    }

    async function loadChartOverview() {
      try {
        const nextOverview = await invoke("get_playtime_overview", { mode: chartMode });
        if (cancelled) {
          return;
        }

        setPlaytimeOverview(Array.isArray(nextOverview?.buckets) ? nextOverview.buckets : []);
      } catch {
        if (!cancelled) {
          setPlaytimeOverview([]);
        }
      }
    }

    loadChartOverview();
    return () => {
      cancelled = true;
    };
  }, [chartMode]);

  const activeGame = activeGames[activeGameIndex] || null;
  const recentPlayedGames = [...(Array.isArray(library) ? library : [])]
    .filter((game) => {
      const gameId = Number(game.id || 0);
      const gameName = String(game.name || "").trim().toLowerCase();
      const finishedLastPlayed = Number(game.finished_last_played || 0);
      if (!activeGameIds.has(gameId) && !activeGameNames.has(gameName)) {
        return true;
      }
      return finishedLastPlayed > 0;
    })
    .filter((game) => Number(game.finished_last_played || game.last_played || 0) > 0)
    .sort(
      (left, right) =>
        Number(right.finished_last_played || right.last_played || 0)
        - Number(left.finished_last_played || left.last_played || 0)
    )
    .slice(0, 8);
  const recentPageCount = Math.max(1, Math.ceil(recentPlayedGames.length / 2));
  const currentSpotlightGames = sliceRecentPage(recentPlayedGames, recentPageIndex);
  const previousSpotlightGames = sliceRecentPage(recentPlayedGames, previousRecentPageIndex);
  const todaySparklineValues = buildChartValues(dayOverview, "day");
  const weekSparklineValues = buildChartValues(weekOverview, "week");
  const chartValues = buildChartValues(playtimeOverview, chartMode);
  const chartMaxHours = getChartMaxHours(chartMode, chartValues);
  const chartAxisLabels = buildChartAxisLabels(chartMaxHours);
  const hoveredChartItem = chartValues.find((item) => item.key === hoveredChartItemKey) || null;
  const todaySeconds = Number(dashboard?.today_seconds || 0);
  const weekSeconds = Number(dashboard?.week_seconds || 0);
  const todayLabel = showPlaytimeTimeLabels ? formatTodayPanelDateLabel() : "Playtime Today";
  const weekLabel = showPlaytimeTimeLabels ? formatCurrentWeekRangeLabel() : "Playtime This Week";
  const yesterdaySeconds = Number(dailyOverview[1]?.total_seconds || 0);
  const previousWeekSeconds = getPreviousWeekTotalSeconds(dailyOverview);
  const topGamesLimit = topGameArtwork === "poster" ? POSTER_TOP_GAMES_COUNT : CAPSULE_TOP_GAMES_COUNT;
  const weeklyGames = Array.from(
    dailyOverview
      .slice(0, 7)
      .flatMap((day) => Array.isArray(day.all_games) ? day.all_games : [])
      .reduce((map, game) => {
        const current = map.get(game.name) || 0;
        map.set(game.name, current + Number(game.total_seconds || 0));
        return map;
      }, new Map())
      .entries()
  )
    .map(([name, totalSeconds]) => {
      const match = Array.isArray(library) ? library.find((game) => game.name === name) : null;
      const steamAppId = extractSteamAppId(
        match?.steam_appid,
        match?.title_logo_url,
        match?.backdrop_url,
        match?.cover_url
      );
      const steamCandidates = resolveSteamSmallCapsuleMediaCandidates(
        steamAppId,
        match?.title_logo_url,
        match?.backdrop_url,
        match?.cover_url
      );
      const capsuleCandidates = [...new Set([
        ...steamCandidates,
        resolveBackdropMedia(match?.backdrop_url),
      ].filter(Boolean))].map((src, index) => ({
        src,
        kind: index < steamCandidates.length ? "capsule" : "backdrop",
      }));
      const posterCandidates = [...new Set([
        resolvePosterMedia(match?.cover_url),
        resolveCoverMedia(match?.cover_url),
        resolveGenericMedia(match?.steam_header_url),
        resolveBackdropMedia(match?.backdrop_url),
      ].filter(Boolean))].map((src) => ({
        src,
        kind: "poster",
      }));
      return {
        name,
        totalSeconds,
        steamAppId,
        coverUrl: match?.cover_url || "",
        backdropUrl: match?.backdrop_url || "",
        steamHeaderUrl: match?.steam_header_url || "",
        capsuleCandidates,
        posterCandidates,
      };
    })
    .sort((left, right) => right.totalSeconds - left.totalSeconds || left.name.localeCompare(right.name))
    .slice(0, topGamesLimit);
  const notificationItems = Array.isArray(notifications) ? notifications.slice(0, DASHBOARD_NOTIFICATION_LIMIT) : [];
  const notificationCount = Number(unreadNotificationCount || 0);

  useEffect(() => {
    const appIds = weeklyGames
      .map((game) => Number(game.steamAppId || 0))
      .filter((appid) => appid > 0);
    const missingAppIds = appIds.filter((appid) => !steamCapsuleMap[appid]);

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
      } catch { }
    }

    loadSteamCapsules();
    return () => {
      cancelled = true;
    };
  }, [steamCapsuleMap, weeklyGames]);

  useEffect(() => {
    if (recentPageCount <= 1) {
      setRecentPageIndex(0);
      setPreviousRecentPageIndex(0);
      setIsRecentAnimating(false);
      return;
    }

    if (isRecentAnimating || dragState.active) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setPreviousRecentPageIndex(recentPageIndex);
      setRecentPageIndex((current) => (current + 1) % recentPageCount);
      setIsRecentAnimating(true);
    }, 8000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [dragState.active, isRecentAnimating, recentPageCount, recentPageIndex]);

  useEffect(() => {
    if (!isRecentAnimating) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setIsRecentAnimating(false);
      setPreviousRecentPageIndex(recentPageIndex);
    }, 1050);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [isRecentAnimating, recentPageIndex]);

  useEffect(() => {
    if (recentPageIndex >= recentPageCount) {
      setRecentPageIndex(0);
      setPreviousRecentPageIndex(0);
    }
  }, [recentPageCount, recentPageIndex]);

  useEffect(() => {
    setHoveredChartItemKey("");
  }, [chartMode, playtimeOverview]);

  useEffect(() => {
    if (!isNotificationOpen) {
      return undefined;
    }

    function handlePointerDown(event) {
      if (!notificationRef.current?.contains(event.target)) {
        setIsNotificationOpen(false);
      }
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setIsNotificationOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isNotificationOpen]);

  function changeRecentPage(nextIndex) {
    if (recentPageCount <= 1) {
      return;
    }

    const normalizedIndex = ((nextIndex % recentPageCount) + recentPageCount) % recentPageCount;
    if (normalizedIndex === recentPageIndex) {
      return;
    }

    setPreviousRecentPageIndex(recentPageIndex);
    setRecentPageIndex(normalizedIndex);
    setIsRecentAnimating(true);
  }

  function handleRecentPointerDown(event) {
    if (recentPageCount <= 1) {
      return;
    }

    setDragState({
      active: true,
      startX: event.clientX,
      deltaX: 0,
    });
  }

  function handleRecentPointerMove(event) {
    if (!dragState.active) {
      return;
    }

    setDragState((current) => ({
      ...current,
      deltaX: event.clientX - current.startX,
    }));
  }

  function handleRecentPointerEnd() {
    if (!dragState.active) {
      return;
    }

    const threshold = 72;
    const deltaX = dragState.deltaX;
    setDragState({ active: false, startX: 0, deltaX: 0 });

    if (Math.abs(deltaX) < threshold) {
      return;
    }

    if (deltaX < 0) {
      changeRecentPage(recentPageIndex + 1);
      return;
    }

    changeRecentPage(recentPageIndex - 1);
  }

  function changeActiveGame(nextIndex) {
    if (!activeGames.length) {
      return;
    }

    const normalizedIndex = ((nextIndex % activeGames.length) + activeGames.length) % activeGames.length;
    setActiveGameIndex(normalizedIndex);
  }

  return (
    <div className="dashboard-shell">
      <header className="page-header page-header-library dashboard-page-header">
        <div className="page-heading">
          <h1>Dashboard</h1>
        </div>

        <div className="dashboard-notification-wrap" ref={notificationRef}>
          <button
            type="button"
            className="dashboard-notification"
            aria-label="Notifications"
            aria-expanded={isNotificationOpen}
            aria-haspopup="dialog"
            onClick={async () => {
              const nextOpen = !isNotificationOpen;
              setIsNotificationOpen(nextOpen);
              if (nextOpen) {
                await onNotificationsOpened?.();
              }
            }}
          >
            <BellIcon />
            {notificationCount > 0 ? <span>{notificationCount}</span> : null}
          </button>
          {isNotificationOpen ? (
            <section className="dashboard-notification-popover" role="dialog" aria-label="Notifications">
              <div className="dashboard-notification-popover-head">
                <strong>Notifications</strong>
                <small>{notificationItems.length} items</small>
              </div>
              <div className="dashboard-notification-list">
                {notificationItems.length ? notificationItems.map((item) => (
                  <article key={item.id} className="dashboard-notification-item">
                    <i className={`dashboard-notification-dot is-${resolveNotificationTone(item.kind)}`} aria-hidden="true" />
                    <div>
                      <strong>{item.game_name || "Unknown game"}</strong>
                      <span>{formatNotificationDetail(item.kind, item.created_at)}</span>
                    </div>
                  </article>
                )) : (
                  <div className="dashboard-notification-empty">
                    <strong>No notifications</strong>
                    <span>Nothing new right now.</span>
                  </div>
                )}
              </div>
              <div className="dashboard-notification-popover-foot">
                <button
                  type="button"
                  className="dashboard-notification-viewall"
                  onClick={() => {
                    setIsNotificationOpen(false);
                    onOpenAllNotifications?.();
                  }}
                >
                  View all
                </button>
              </div>
            </section>
          ) : null}
        </div>
      </header>

      <section className="dashboard-metrics">
        <div className="dashboard-playtime-stack">
          <article className="dashboard-metric-card dashboard-playtime-metric">
            <div className="dashboard-metric-copy">
              <div className={`dashboard-metric-label${showPlaytimeTimeLabels ? " is-time-info" : ""}`}>
                <span className="dashboard-metric-icon is-stopwatch"><StopwatchIcon /></span>
                <span>{todayLabel}</span>
              </div>
              <strong>{formatDurationLong(todaySeconds)}</strong>
              <span className={`dashboard-metric-trend${todaySeconds >= yesterdaySeconds ? " is-positive" : " is-negative"}`}>
                {formatDelta(todaySeconds - yesterdaySeconds)} <em>from yesterday</em>
              </span>
            </div>
            <div className="dashboard-sparkline">
              <svg viewBox="0 0 160 84" aria-hidden="true">
                <defs>
                  <linearGradient id="dashboardSparklineFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#7b70ff" stopOpacity="0.38" />
                    <stop offset="55%" stopColor="#7b70ff" stopOpacity="0.14" />
                    <stop offset="100%" stopColor="#7b70ff" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path className="dashboard-sparkline-area" d={buildSparklineAreaPath(todaySparklineValues)} />
                <path d={buildSparklinePath(todaySparklineValues)} />
              </svg>
            </div>
          </article>

          <article className="dashboard-metric-card dashboard-playtime-metric">
            <div className="dashboard-metric-copy">
              <div className={`dashboard-metric-label${showPlaytimeTimeLabels ? " is-time-info" : ""}`}>
                <span className="dashboard-metric-icon is-calendar"><CalendarIcon /></span>
                <span>{weekLabel}</span>
              </div>
              <strong>{formatDurationLong(weekSeconds)}</strong>
              <span className={`dashboard-metric-trend${weekSeconds >= previousWeekSeconds ? " is-positive" : " is-negative"}`}>
                {formatDelta(weekSeconds - previousWeekSeconds)} <em>from last week</em>
              </span>
            </div>
            <div className="dashboard-sparkline dashboard-sparkline-week">
              <svg viewBox="0 0 160 84" aria-hidden="true">
                <defs>
                  <linearGradient id="dashboardSparklineFillWeek" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#7b70ff" stopOpacity="0.32" />
                    <stop offset="55%" stopColor="#7b70ff" stopOpacity="0.12" />
                    <stop offset="100%" stopColor="#7b70ff" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path className="dashboard-sparkline-area dashboard-sparkline-area-week" d={buildSparklineAreaPath(weekSparklineValues)} />
                <path d={buildSparklinePath(weekSparklineValues)} />
              </svg>
            </div>
          </article>
        </div>

        <article
          className={`dashboard-metric-card dashboard-running-hero${activeGame ? " is-active" : " is-idle"}`}
          style={activeGame ? buildBackdropStyle(activeGame.backdrop_url || activeGame.cover_url) : undefined}
        >
          <div className="dashboard-running-hero-overlay" />
          <div className="dashboard-running-hero-content">
            <div className="dashboard-running-hero-copy">
              <div className="dashboard-running-label">
                <span className="dashboard-metric-icon dashboard-running-title-icon is-gamepad"><GamepadOutlineIcon /></span>
                <span>Running Game</span>
                <i className={activeGame ? "is-active" : ""} />
              </div>
              <div className="dashboard-running-title-row">
                <strong className={activeGame ? "" : "is-idle"}>{activeGame?.name || "No active game"}</strong>
                {activeGame ? (
                  <div className="dashboard-running-hero-meta">
                    <span className="dashboard-running-hero-time">
                      {formatActiveDuration(activeGame.elapsed_seconds || 0)}
                    </span>
                  </div>
                ) : null}
              </div>
              <span className="dashboard-running-subline">
                {activeGame ? formatExecutablePath(activeGame.exe_path || activeGame.exe_name || "Session active") : ""}
              </span>
            </div>
          </div>
          <div className="dashboard-running-hero-footer">
            <div className="dashboard-running-hero-pagination">
              <span className="dashboard-running-hero-count">
                {activeGames.length ? `${activeGameIndex + 1} / ${activeGames.length}` : "0 / 0"}
              </span>
              <div className="dashboard-running-hero-dots">
                {activeGames.length ? activeGames.map((game, index) => (
                  <button
                    key={`${game.game_id || game.name}-${index}`}
                    type="button"
                    className={index === activeGameIndex ? "is-active" : ""}
                    aria-label={`Show running game ${index + 1}`}
                    onClick={() => changeActiveGame(index)}
                  />
                )) : (
                  <button type="button" className="is-active" aria-label="No active game" disabled />
                )}
              </div>
            </div>
            <div className="dashboard-running-hero-controls">
              <button
                type="button"
                aria-label="Previous running game"
                onClick={() => changeActiveGame(activeGameIndex - 1)}
                disabled={activeGames.length <= 1}
              >
                <ChevronLeftIcon />
              </button>
              <button
                type="button"
                aria-label="Next running game"
                onClick={() => changeActiveGame(activeGameIndex + 1)}
                disabled={activeGames.length <= 1}
              >
                <ChevronRightIcon />
              </button>
            </div>
          </div>
        </article>
      </section>

      <section className="dashboard-panel dashboard-recent-showcase">
        <div className="dashboard-section-bar">
          <strong>Recently Played</strong>
          {recentPlayedGames.length > 0 && !loading ? (
            <div className="dashboard-carousel-dots">
              {Array.from({ length: recentPageCount }, (_, index) => (
                <button
                  key={`recent-dot-${index}`}
                  type="button"
                  className={index === recentPageIndex ? "is-active" : ""}
                  aria-label={`Show recent slide ${index + 1}`}
                  onClick={() => changeRecentPage(index)}
                />
              ))}
            </div>
          ) : null}
        </div>
        <div
          className={`dashboard-spotlight-viewport${dragState.active ? " is-dragging" : ""}`}
          onMouseLeave={handleRecentPointerEnd}
          onPointerDown={recentPlayedGames.length > 0 && !loading ? handleRecentPointerDown : undefined}
          onPointerMove={recentPlayedGames.length > 0 && !loading ? handleRecentPointerMove : undefined}
          onPointerUp={recentPlayedGames.length > 0 && !loading ? handleRecentPointerEnd : undefined}
          onPointerCancel={recentPlayedGames.length > 0 && !loading ? handleRecentPointerEnd : undefined}
          onPointerLeave={recentPlayedGames.length > 0 && !loading ? handleRecentPointerEnd : undefined}
        >
          {isRecentAnimating && recentPlayedGames.length > 0 && !loading ? (
            <div className="dashboard-spotlight-grid dashboard-spotlight-grid-previous">
              {previousSpotlightGames.map((game, index) => (
                <RecentPlayedCard
                  key={`previous-${game.id || index}`}
                  game={game}
                  onOpenGameDetail={onOpenGameDetail}
                />
              ))}
            </div>
          ) : null}
          <div
            className={`dashboard-spotlight-grid${isRecentAnimating && recentPlayedGames.length > 0 && !loading ? " is-entering" : ""}${dragState.active ? " is-dragging" : ""}`}
            style={dragState.active ? { transform: `translateX(${dragState.deltaX}px)` } : undefined}
          >
            {recentPlayedGames.length > 0 && !loading ? (
              currentSpotlightGames.map((game, index) => (
                <RecentPlayedCard
                  key={`current-${game.id || index}`}
                  game={game}
                  onOpenGameDetail={onOpenGameDetail}
                />
              ))
            ) : (
              <>
                <RecentPlayedSkeletonCard />
                <RecentPlayedSkeletonCard />
              </>
            )}
          </div>
        </div>
      </section>

      <section className="dashboard-bottom-grid">
        <article className="dashboard-panel dashboard-chart-panel">
          <div className="dashboard-section-bar">
            <strong>Playtime Overview</strong>
            <div className="dashboard-tabs">
              <button type="button" className={chartMode === "day" ? "is-active" : ""} onClick={() => setChartMode("day")}>Day</button>
              <button type="button" className={chartMode === "week" ? "is-active" : ""} onClick={() => setChartMode("week")}>Week</button>
              <button type="button" className={chartMode === "month" ? "is-active" : ""} onClick={() => setChartMode("month")}>Month</button>
            </div>
          </div>
          <div className="dashboard-chart">
            <div className="dashboard-chart-axis">
              {chartAxisLabels.map((label) => (
                <span key={`axis-${label}`}>{label}</span>
              ))}
            </div>
            <div className={`dashboard-chart-bars dashboard-chart-bars-${chartMode}`} style={{ "--chart-count": chartValues.length }}>
              {chartValues.map((item) => (
                <div
                  key={item.key}
                  className={`dashboard-chart-col${hoveredChartItem?.key === item.key ? " is-hovered" : ""}`}
                  onMouseEnter={() => setHoveredChartItemKey(item.key)}
                  onMouseLeave={() => setHoveredChartItemKey("")}
                >
                  <div className="dashboard-chart-bar-slot">
                    <div
                      className={`dashboard-chart-bar${item.active ? " is-active" : ""}`}
                      style={{ height: `${Math.max((item.value / chartMaxHours) * 100, 0)}%` }}
                    >
                      {hoveredChartItem?.key === item.key ? (
                        <div className="dashboard-chart-tooltip" role="status" aria-live="polite">
                          <strong>{item.tooltipLabel}</strong>
                          <span>{item.tooltipValue}</span>
                        </div>
                      ) : null}
                    </div>
                  </div>
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        </article>

        <article className="dashboard-panel dashboard-topgames-panel">
          <div className="dashboard-section-bar">
            <strong>Top Games This Week</strong>
          </div>
          <div className={`dashboard-topgames-list ${topGameArtwork === "poster" ? "is-poster" : "is-capsule"}`}>
            {renderDashboardTopGameRows(weeklyGames, {
              loading,
              artwork: topGameArtwork,
              steamCapsuleMap,
            })}
          </div>
        </article>

        <article className="dashboard-panel dashboard-achievements-panel">
          <div className="dashboard-section-bar">
            <strong>Achievements</strong>
          </div>
          <div className="dashboard-achievement-card">
            <div className="dashboard-achievement-ring">
              <div className="dashboard-achievement-ring-inner" />
            </div>
            <div className="dashboard-achievement-copy">
              <span>Recent Achievement</span>
              <strong>-</strong>
              <p>-</p>
              <em>-</em>
            </div>
          </div>
          <div className="dashboard-achievement-icons">
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
        </article>

      </section>
    </div>
  );
}

function RecentPlayedCard({ game, onOpenGameDetail }) {
  return (
    <article
      className="dashboard-spotlight-card is-clickable"
      role="button"
      tabIndex={0}
      aria-label={`Open ${game.name} details`}
      onClick={() => onOpenGameDetail?.(game.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpenGameDetail?.(game.id);
        }
      }}
    >
      <div
        className="dashboard-spotlight-backdrop"
        style={buildBackdropPresentationStyle(
          game.backdrop_url || game.cover_url,
          game.backdrop_position_x,
          game.backdrop_position_y,
          game.backdrop_zoom
        )}
      />
      <div className="dashboard-spotlight-overlay" />
      <div className="dashboard-spotlight-content">
        <strong>{game.name}</strong>
        <div className="dashboard-spotlight-meta">
          <span className="dashboard-spotlight-meta-item is-clock">
            <ClockIcon />
            <span>{formatRecentPlayedMeta(game.finished_last_played || game.last_played)}</span>
          </span>
          <span className="dashboard-spotlight-meta-separator" aria-hidden="true" />
          <span className="dashboard-spotlight-meta-item is-play">
            <PlaySolidIcon />
            <span>{formatDurationLong(game.total_seconds || 0)}</span>
          </span>
        </div>
      </div>
    </article>
  );
}

function RecentPlayedSkeletonCard() {
  return (
    <article className="dashboard-spotlight-card is-skeleton-card" aria-hidden="true">
      <div className="dashboard-spotlight-skeleton-backdrop">
        <GamepadOutlineIcon />
      </div>
      <div className="dashboard-spotlight-skeleton-content">
        <div className="dashboard-spotlight-skeleton-title" />
        <div className="dashboard-spotlight-skeleton-meta-row">
          <div className="dashboard-spotlight-skeleton-meta-pill" style={{ width: "110px" }} />
          <div className="dashboard-spotlight-skeleton-meta-dot" />
          <div className="dashboard-spotlight-skeleton-meta-pill" style={{ width: "75px" }} />
        </div>
      </div>
    </article>
  );
}

function TopGameThumb({ game, artwork = "poster", steamCapsuleUrl = "" }) {
  const normalizedArtwork = artwork === "capsule" ? "capsule" : "poster";
  const explicitSteamCapsule = resolveGenericMedia(steamCapsuleUrl);
  const candidates = normalizedArtwork === "capsule"
    ? [
      explicitSteamCapsule ? { src: explicitSteamCapsule, kind: "capsule" } : null,
      ...(Array.isArray(game?.capsuleCandidates) ? game.capsuleCandidates : []),
    ].filter(Boolean)
    : [
      ...(Array.isArray(game?.posterCandidates) ? game.posterCandidates : []),
    ].filter(Boolean);
  const [sourceIndex, setSourceIndex] = useState(0);
  const currentCandidate = candidates[sourceIndex] || null;
  const currentSource = currentCandidate?.src || "";

  useEffect(() => {
    setSourceIndex(0);
  }, [game?.name, normalizedArtwork, candidates.join("|")]);

  if (!currentSource) {
    return (
      <div className={`dashboard-topgame-thumb-fallback${normalizedArtwork === "poster" ? " is-poster" : ""}`} aria-hidden="true">
        {getInitials(game?.name)}
      </div>
    );
  }

  return (
    <img
      src={currentSource}
      alt={game?.name || "Game art"}
      loading="lazy"
      className={normalizedArtwork === "poster"
        ? "is-poster"
        : currentCandidate?.kind === "capsule"
          ? "is-native-capsule"
          : "is-fallback-capsule"}
      onError={() => {
        setSourceIndex((current) => (current < candidates.length ? current + 1 : current));
      }}
    />
  );
}

function renderDashboardTopGameRows(items, options = {}) {
  const rows = Array.isArray(items) ? items : [];
  const artwork = options.artwork === "capsule" ? "capsule" : "poster";
  const steamCapsuleMap = options.steamCapsuleMap || {};
  const targetCount = artwork === "capsule" ? CAPSULE_TOP_GAMES_COUNT : POSTER_TOP_GAMES_COUNT;
  const placeholders = Math.max(0, targetCount - rows.length);

  return (
    <>
      {rows.map((game) => (
        <div key={game.name} className="dashboard-topgame-row">
          <div className="dashboard-topgame-meta">
            <TopGameThumb
              game={game}
              artwork={artwork}
              steamCapsuleUrl={steamCapsuleMap[game.steamAppId] || ""}
            />
            <span>{game.name}</span>
          </div>
          <strong>{formatDurationLong(game.totalSeconds)}</strong>
        </div>
      ))}
      {Array.from({ length: placeholders }, (_, index) => (
        <div key={`dashboard-topgame-placeholder-${index}`} className="dashboard-topgame-row is-placeholder" aria-hidden="true">
          <div className="dashboard-topgame-meta">
            <span
              className={`dashboard-topgame-skeleton-thumb${artwork === "poster" ? " is-poster" : ""} is-skeleton`}
            />
            <span
              className={`dashboard-topgame-skeleton-title${artwork === "poster" ? " is-poster" : ""} is-skeleton`}
            >
              <span className="stats-placeholder-nodata-text">No data</span>
            </span>
          </div>
          <span className="dashboard-topgame-skeleton-time is-skeleton" />
        </div>
      ))}
    </>
  );
}

function formatDelta(seconds) {
  const sign = seconds >= 0 ? "+" : "-";
  return `${sign}${formatDurationLong(Math.abs(seconds))}`;
}

function formatRecentPlayedMeta(timestamp) {
  return formatNotificationDetail("played", timestamp).replace(/^Played\s+/i, "");
}

function formatActiveDuration(totalSeconds) {
  return formatDurationDetailed(totalSeconds);
}

function formatExecutablePath(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }

  const normalized = raw.replace(/\//g, "\\");
  const segments = normalized.split("\\");

  return segments
    .map((segment, index) => {
      if (!segment) {
        return segment;
      }

      if (index === 0 && /^[a-z]:$/i.test(segment)) {
        return `${segment[0].toUpperCase()}:`;
      }

      if (segment.includes(".")) {
        return segment;
      }

      if (/^[a-z]/.test(segment)) {
        return segment[0].toUpperCase() + segment.slice(1);
      }

      return segment;
    })
    .join("\\");
}

function formatTodayPanelDateLabel() {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());
}

function formatCurrentWeekRangeLabel() {
  const today = new Date();
  const currentWeekday = today.getDay();
  const daysFromMonday = (currentWeekday + 6) % 7;
  const monday = new Date(today);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(today.getDate() - daysFromMonday);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const formatter = new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return `${formatter.format(monday)} - ${formatter.format(sunday)}`;
}

function getPreviousWeekTotalSeconds(days) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const currentWeekday = today.getDay();
  const daysFromMonday = (currentWeekday + 6) % 7;

  const currentMonday = new Date(today);
  currentMonday.setDate(today.getDate() - daysFromMonday);

  const previousMonday = new Date(currentMonday);
  previousMonday.setDate(currentMonday.getDate() - 7);

  const currentMondayTs = Math.floor(currentMonday.getTime() / 1000);
  const previousMondayTs = Math.floor(previousMonday.getTime() / 1000);

  return (Array.isArray(days) ? days : []).reduce((sum, day) => {
    const dayStart = Number(day?.day_start || 0);
    if (dayStart < previousMondayTs || dayStart >= currentMondayTs) {
      return sum;
    }
    return sum + Number(day?.total_seconds || 0);
  }, 0);
}

function buildSparklinePath(values) {
  if (!values.length) {
    return "M8 67 L152 67";
  }

  const points = buildSparklinePoints(values);
  if (points.length === 1) {
    return `M${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  }

  let path = `M${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;

  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    const controlOffset = (next.x - current.x) * 0.42;
    const cp1x = current.x + controlOffset;
    const cp1y = current.y;
    const cp2x = next.x - controlOffset;
    const cp2y = next.y;
    path += ` C${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${next.x.toFixed(2)} ${next.y.toFixed(2)}`;
  }

  return path;
}

function buildSparklineAreaPath(values) {
  if (!values.length) {
    return "M8 67 L152 67 L152 84 L8 84 Z";
  }

  const points = buildSparklinePoints(values);
  const linePath = buildSparklinePath(values);
  const lastPoint = points[points.length - 1];
  const firstPoint = points[0];
  return `${linePath} L${lastPoint.x.toFixed(2)} 84 L${firstPoint.x.toFixed(2)} 84 Z`;
}

function buildSparklinePoints(values) {
  const maxValue = Math.max(...values.map((item) => Number(item.value || 0)), 1);
  const startX = 8;
  const endX = 152;
  const startY = 67;
  const endY = 8;
  const step = values.length > 1 ? (endX - startX) / (values.length - 1) : 0;

  return values.map((item, index) => ({
    x: startX + step * index,
    y: startY - ((Number(item.value || 0) / maxValue) * (startY - endY)),
  }));
}

function buildChartValues(buckets, mode) {
  const normalizedMode = String(mode || "week").toLowerCase();
  const values = Array.isArray(buckets) ? buckets : [];

  if (normalizedMode === "week") {
    const weekdayOrder = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const bucketMap = new Map(
      values.map((item) => [
        normalizeWeekdayLabel(item.short_label || item.label),
        {
          seconds: Number(item.total_seconds || 0),
          fullLabel: String(item.label || item.short_label || ""),
        },
      ])
    );
    const maxValue = Math.max(...Array.from(bucketMap.values(), (item) => item.seconds / 3600), 0);

    return weekdayOrder
      .filter((label) => bucketMap.has(label))
      .map((label) => {
        const bucket = bucketMap.get(label) || { seconds: 0, fullLabel: label };
        const value = bucket.seconds / 3600;
        return {
          key: `${normalizedMode}-${label}`,
          label,
          value,
          totalSeconds: bucket.seconds,
          tooltipLabel: bucket.fullLabel || label,
          tooltipValue: formatDurationLong(bucket.seconds),
          active: value === maxValue && maxValue > 0,
        };
      });
  }

  const maxValue = Math.max(...values.map((item) => Number(item.total_seconds || 0) / 3600), 0);
  return values.map((item, index) => {
    const totalSeconds = Number(item.total_seconds || 0);
    const value = totalSeconds / 3600;
    const shortLabel = String(item.short_label || item.label || "");
    const fullLabel = String(item.label || item.short_label || "");
    return {
      key: `${normalizedMode}-${shortLabel}-${index}`,
      label: shortLabel,
      value,
      totalSeconds,
      tooltipLabel: fullLabel,
      tooltipValue: formatDurationLong(totalSeconds),
      active: value === maxValue && maxValue > 0,
    };
  });
}

function normalizeWeekdayLabel(label) {
  const value = String(label || "").trim().slice(0, 3).toLowerCase();
  const map = {
    mon: "Mon",
    tue: "Tue",
    wed: "Wed",
    thu: "Thu",
    fri: "Fri",
    sat: "Sat",
    sun: "Sun",
  };
  return map[value] || String(label || "").trim();
}

function buildChartAxisLabels(maxHours) {
  const top = Math.max(1, maxHours);
  const upperMiddle = Math.round((top * 2) / 3);
  const lowerMiddle = Math.round(top / 3);
  return [`${top}h+`, `${upperMiddle}h`, `${lowerMiddle}h`, "0h"];
}

function getChartMaxHours(mode, values) {
  const normalizedMode = String(mode || "week").toLowerCase();
  const highestValue = Math.max(...values.map((item) => Number(item.value || 0)), 0);

  if (normalizedMode === "week") {
    return Math.max(12, Math.ceil(highestValue / 4) * 4);
  }

  if (normalizedMode === "month") {
    return Math.max(120, Math.ceil(highestValue / 40) * 40);
  }

  return Math.max(6, Math.ceil(highestValue / 2) * 2);
}

function sliceRecentPage(games, pageIndex) {
  const safeIndex = Math.max(0, pageIndex);
  return games.slice(safeIndex * 2, safeIndex * 2 + 2);
}
