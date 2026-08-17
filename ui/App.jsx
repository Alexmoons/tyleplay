import { useEffect, useMemo, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  closeWindow,
  getWindowMaximized,
  invoke,
  minimizeWindow,
  toggleWindowFullscreen,
  toggleWindowMaximize,
} from "./lib/tauri";
import {
  formatDurationLong,
  PAGE_SIZE,
  setPlaytimeDisplayMode,
  sortLibrary,
} from "./lib/game-helpers";
import WindowTitlebar from "./components/WindowTitlebar";
import Sidebar from "./components/Sidebar";
import AddGameModal from "./components/AddGameModal";
import AutoScanModal from "./components/AutoScanModal";
import LoadingIndicator from "./components/LoadingIndicator";
import { CheckCircleIcon, CloseIcon, InfoCircleIcon, RefreshIcon, WarningTriangleIcon } from "./components/icons";
import ArchivePage from "./pages/ArchivePage";
import DashboardPage from "./pages/DashboardPage";
import EditGamePage from "./pages/EditGamePage";
import GameDetailPage from "./pages/GameDetailPage";
import LibraryPage, { clearSteamHeaderCache } from "./pages/LibraryPage";
import DailyPlaytimePage from "./pages/DailyPlaytimePage";
import DailyPlaytimeDetailPage from "./pages/DailyPlaytimeDetailPage";
import NotificationsPage from "./pages/NotificationsPage";
import PlaytimeDetailPage from "./pages/PlaytimeDetailPage";
import PlaceholderPage from "./pages/PlaceholderPage";
import StatsPage from "./pages/StatsPage";
import SettingsPage from "./pages/SettingsPage";
import { clearSteamCapsuleCache } from "./pages/DashboardPage";
import WeeklyPlaytimePage from "./pages/WeeklyPlaytimePage";
import WeeklyPlaytimeDetailPage from "./pages/WeeklyPlaytimeDetailPage";


const REFRESH_INTERVAL_MS = 5000;
const CONTENT_BASE_WIDTH = 1248;
const LIVE_REFRESH_VIEWS = new Set(["dashboard", "notifications"]);
const INITIAL_APP_BOOT_MIN_MS = 5000;
const INITIAL_VIEW_LOADING_MIN_MS = 900;
const DEFAULT_SECTION_LOCATIONS = {
  dashboard: { activeView: "dashboard", selectedGameId: null, detailOriginView: "dashboard", statsSubView: null },
  library: { activeView: "library", selectedGameId: null, detailOriginView: "library", statsSubView: null },
  archive: { activeView: "archive", selectedGameId: null, detailOriginView: "library", statsSubView: null },
  stats: { activeView: "stats", selectedGameId: null, detailOriginView: "library", statsSubView: null },
  achievements: { activeView: "achievements", selectedGameId: null, detailOriginView: "library", statsSubView: null },
  settings: { activeView: "settings", selectedGameId: null, detailOriginView: "library", statsSubView: null },
};

function readInitialViewState() {
  if (typeof window === "undefined") {
    return DEFAULT_SECTION_LOCATIONS.dashboard;
  }

  const params = new URLSearchParams(window.location.search);
  const activeView = String(params.get("view") || "").trim();
  const selectedGameId = Number(params.get("selectedGameId") || "");
  const detailOriginView = String(params.get("originView") || "library").trim() || "library";

  if ((activeView === "game-detail" || activeView === "game-edit") && Number.isFinite(selectedGameId) && selectedGameId > 0) {
    return {
      activeView,
      selectedGameId,
      detailOriginView,
      statsSubView: null,
    };
  }

  return DEFAULT_SECTION_LOCATIONS.dashboard;
}

function normalizeLibraryStoreLabel(value) {
  const label = String(value || "").trim();
  return label || "Other";
}

function buildLibraryStoreTabId(label) {
  return `store:${String(label || "").trim().toLowerCase()}`;
}

function compareLibraryStoreTabs(left, right) {
  const leftLabel = String(left?.[0] || "");
  const rightLabel = String(right?.[0] || "");
  const leftCount = Number(left?.[1] || 0);
  const rightCount = Number(right?.[1] || 0);
  const leftKey = leftLabel.toLowerCase();
  const rightKey = rightLabel.toLowerCase();

  if (leftKey === "steam" && rightKey !== "steam") {
    return -1;
  }
  if (rightKey === "steam" && leftKey !== "steam") {
    return 1;
  }
  if (leftKey === "other" && rightKey !== "other") {
    return 1;
  }
  if (rightKey === "other" && leftKey !== "other") {
    return -1;
  }

  return rightCount - leftCount || leftLabel.localeCompare(rightLabel);
}

function shouldLoadLibrary(view) {
  return view === "dashboard"
    || view === "library"
    || view === "stats"
    || view === "dashboard-today-detail"
    || view === "dashboard-week-detail"
    || view === "game-detail"
    || view === "game-edit";
}

function shouldLoadArchive(view) {
  return view === "archive";
}

function shouldLoadDashboard(view) {
  return view === "dashboard";
}

function shouldLoadNotifications(view) {
  return view === "dashboard" || view === "notifications";
}

function resolveSectionView(view, originView = "library") {
  const normalizedView = String(view || "");
  if (normalizedView === "dashboard" || normalizedView === "dashboard-today-detail" || normalizedView === "dashboard-week-detail" || normalizedView === "notifications") {
    return "dashboard";
  }
  if (normalizedView === "library" || normalizedView === "archive" || normalizedView === "stats" || normalizedView === "achievements" || normalizedView === "settings") {
    return normalizedView;
  }
  if (normalizedView === "game-detail" || normalizedView === "game-edit") {
    return resolveSectionView(originView, "library");
  }
  return null;
}

function isSectionAtRoot(section, location) {
  const normalizedSection = String(section || "");
  const normalizedView = String(location?.activeView || "");

  if (normalizedSection === "stats") {
    return normalizedView === "stats" && !location?.statsSubView;
  }

  return normalizedView === normalizedSection;
}

function createInitialStartupData() {
  return {
    dashboardDayOverview: null,
    dashboardWeekOverview: null,
    dashboardMonthOverview: null,
    dailyPlaytimeOverview: null,
    weeklyPlaytimeOverview: null,
    statsSnapshot: null,
    igdbSettings: null,
    systemInfo: null,
    selectedGameDetail: null,
  };
}

function App() {
  const initialViewState = useMemo(() => readInitialViewState(), []);
  const hasInitialDeepLink = initialViewState.activeView !== "dashboard" || initialViewState.selectedGameId !== null;
  const [activeView, setActiveView] = useState(initialViewState.activeView);
  const [appSettings, setAppSettings] = useState({
    start_on_system_startup: true,
    close_to_system_tray: true,
    default_page: "dashboard",
    language: "English",
    app_theme: "dark",
    top_game_artwork: "capsule",
    playtime_display_mode: "standard",
  });
  const [library, setLibrary] = useState([]);
  const [dashboard, setDashboard] = useState(null);
  const [archiveGames, setArchiveGames] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [initialBootLoading, setInitialBootLoading] = useState(true);
  const [bootMessage, setBootMessage] = useState("Preparing application...");
  const [startupData, setStartupData] = useState(() => createInitialStartupData());
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [sortBy, setSortBy] = useState("last_played");
  const [viewMode, setViewMode] = useState("poster");
  const [page, setPage] = useState(1);
  const [isWindowMaximized, setIsWindowMaximized] = useState(false);
  const [contentScale, setContentScale] = useState(1);
  const [selectedGameId, setSelectedGameId] = useState(initialViewState.selectedGameId);
  const [detailOriginView, setDetailOriginView] = useState(initialViewState.detailOriginView);
  const [statsSubView, setStatsSubView] = useState(initialViewState.statsSubView);

  const previousActiveGamesRef = useRef([]);
  const [historyStack, setHistoryStack] = useState(() => [
    {
      activeView: initialViewState.activeView,
      selectedGameId: initialViewState.selectedGameId,
      detailOriginView: initialViewState.detailOriginView,
      statsSubView: initialViewState.statsSubView,
    },
  ]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const isNavigatingHistoryRef = useRef(false);

  useEffect(() => {
    if (isNavigatingHistoryRef.current) {
      isNavigatingHistoryRef.current = false;
      return;
    }

    const currentLoc = { activeView, selectedGameId, detailOriginView, statsSubView };

    setHistoryStack((prevStack) => {
      const top = prevStack[historyIndex];
      if (
        top &&
        top.activeView === currentLoc.activeView &&
        top.selectedGameId === currentLoc.selectedGameId &&
        top.detailOriginView === currentLoc.detailOriginView &&
        top.statsSubView === currentLoc.statsSubView
      ) {
        return prevStack;
      }

      const nextStack = [...prevStack.slice(0, historyIndex + 1), currentLoc];
      setHistoryIndex(nextStack.length - 1);
      return nextStack;
    });
  }, [activeView, selectedGameId, detailOriginView, statsSubView]);

  function handleGoBack() {
    if (historyIndex > 0) {
      const targetIndex = historyIndex - 1;
      const target = historyStack[targetIndex];
      if (target) {
        isNavigatingHistoryRef.current = true;
        setHistoryIndex(targetIndex);
        setSelectedGameId(target.selectedGameId);
        setDetailOriginView(target.detailOriginView);
        setStatsSubView(target.statsSubView);
        setActiveView(target.activeView);
      }
    }
  }

  function handleGoForward() {
    if (historyIndex < historyStack.length - 1) {
      const targetIndex = historyIndex + 1;
      const target = historyStack[targetIndex];
      if (target) {
        isNavigatingHistoryRef.current = true;
        setHistoryIndex(targetIndex);
        setSelectedGameId(target.selectedGameId);
        setDetailOriginView(target.detailOriginView);
        setStatsSubView(target.statsSubView);
        setActiveView(target.activeView);
      }
    }
  }

  const canGoUp = useMemo(() => {
    if (activeView === "game-edit" || activeView === "game-detail") {
      return true;
    }
    if (activeView === "dashboard-today-detail" || activeView === "dashboard-week-detail" || activeView === "notifications") {
      return true;
    }
    if (activeView === "stats" && Boolean(statsSubView)) {
      return true;
    }
    return false;
  }, [activeView, statsSubView]);

  function handleGoUp() {
    if (activeView === "game-edit") {
      if (selectedGameId) {
        setActiveView("game-detail");
      } else {
        navigateToView(detailOriginView || "library");
      }
      return;
    }

    if (activeView === "game-detail") {
      navigateToView(detailOriginView || "library");
      return;
    }

    if (activeView === "dashboard-today-detail" || activeView === "dashboard-week-detail" || activeView === "notifications") {
      navigateToView("dashboard");
      return;
    }

    if (activeView === "stats" && statsSubView) {
      if (statsSubView === "daily-playtime-table") {
        setStatsSubView("daily-playtime-detail");
      } else if (statsSubView === "weekly-playtime-table") {
        setStatsSubView("weekly-playtime-detail");
      } else {
        closeStatsSubView();
      }
      return;
    }
  }

  function handleRefreshTopBar() {
    setViewRefreshNonce((prev) => prev + 1);
    refreshLibraryData();
  }

  const [isAddGameOpen, setIsAddGameOpen] = useState(false);
  const [isAutoScanOpen, setIsAutoScanOpen] = useState(false);
  const [appNotices, setAppNotices] = useState([]);
  const [restoringArchiveId, setRestoringArchiveId] = useState(null);
  const [deletingArchiveId, setDeletingArchiveId] = useState(null);
  const [isResettingLibraryMetadata, setIsResettingLibraryMetadata] = useState(false);
  const [confirmState, setConfirmState] = useState(null);
  const [contextMenuState, setContextMenuState] = useState(null);
  const [hasUnsavedUserSettings, setHasUnsavedUserSettings] = useState(false);
  const [viewRefreshNonce, setViewRefreshNonce] = useState(0);
  const contentScrollRef = useRef(null);
  const contentViewportRef = useRef(null);
  const hasInitializedViewRef = useRef(false);
  const appNoticeIdRef = useRef(0);
  const contextMenuRef = useRef(null);
  const skipNextViewLoadRef = useRef(false);
  const sectionLocationsRef = useRef({
    ...DEFAULT_SECTION_LOCATIONS,
  });
  const hasCompletedInitialViewLoadRef = useRef(false);
  const statsScrollTopRef = useRef(0);
  const pendingStatsScrollRestoreRef = useRef(false);

  function pushAppNotice(notice) {
    if (!notice || typeof notice !== "object") {
      return;
    }

    const id = appNoticeIdRef.current + 1;
    appNoticeIdRef.current = id;
    setAppNotices((current) => [
      ...current.slice(-2),
      { id, tone: String(notice.tone || "info"), titleBold: true, ...notice },
    ]);
  }

  function dismissAppNotice(noticeId) {
    setAppNotices((current) => current.filter((notice) => notice.id !== noticeId));
  }

  function notifyAppError(title, nextError, tone = "danger") {
    pushAppNotice({
      tone,
      title,
      message: nextError?.message || String(nextError),
    });
  }

  function requestAppConfirm(confirmConfig) {
    if (!confirmConfig || typeof confirmConfig !== "object") {
      return;
    }
    setConfirmState({
      cancelLabel: "Cancel",
      confirmLabel: "Confirm",
      tone: "primary",
      ...confirmConfig,
    });
  }

  function navigateToView(nextView) {
    const normalizedNextView = String(nextView || "");
    const targetSection = resolveSectionView(normalizedNextView, normalizedNextView);

    if (!targetSection) {
      return;
    }

    if (targetSection === getCurrentSection()) {
      if (!isSectionAtRoot(targetSection, { activeView, selectedGameId, detailOriginView, statsSubView })) {
        applySectionLocation(DEFAULT_SECTION_LOCATIONS[targetSection] || DEFAULT_SECTION_LOCATIONS.dashboard);
      }
      return;
    }

    const applyTopLevelNavigation = () => {
      applySectionLocation(sectionLocationsRef.current[targetSection] || DEFAULT_SECTION_LOCATIONS[targetSection]);
    };

    if (activeView === "settings" && hasUnsavedUserSettings) {
      requestAppConfirm({
        title: "Leave Settings",
        message: "You have unsaved changes in User settings. Leave Settings anyway?",
        confirmLabel: "Leave Settings",
        cancelLabel: "Stay Here",
        tone: "danger",
        onConfirm: applyTopLevelNavigation,
      });
      return;
    }

    applyTopLevelNavigation();
  }

  function getCurrentSection() {
    return resolveSectionView(activeView, detailOriginView);
  }

  function applySectionLocation(location) {
    const nextLocation = location || DEFAULT_SECTION_LOCATIONS.dashboard;
    setSelectedGameId(Number.isFinite(Number(nextLocation.selectedGameId)) ? Number(nextLocation.selectedGameId) : null);
    setDetailOriginView(String(nextLocation.detailOriginView || "library"));
    setStatsSubView(String(nextLocation.activeView || "") === "stats" ? nextLocation.statsSubView || null : null);
    setActiveView(String(nextLocation.activeView || "dashboard"));
  }

  async function refreshLibraryData() {
    const [nextLibrary, nextDashboard, nextArchiveGames, nextNotifications] = await Promise.all([
      invoke("list_games"),
      invoke("get_dashboard"),
      invoke("list_archived_games"),
      invoke("get_notification_overview"),
    ]);
    setLibrary(Array.isArray(nextLibrary) ? nextLibrary : []);
    setDashboard(nextDashboard && typeof nextDashboard === "object" ? nextDashboard : null);
    setArchiveGames(Array.isArray(nextArchiveGames) ? nextArchiveGames : []);
    setNotifications(Array.isArray(nextNotifications?.items) ? nextNotifications.items : []);
    setUnreadNotificationCount(Number(nextNotifications?.unread_count || 0));
  }

  function openStatsSubView(nextSubView) {
    statsScrollTopRef.current = contentScrollRef.current?.scrollTop || 0;
    setStatsSubView(nextSubView);
  }

  function closeStatsSubView() {
    pendingStatsScrollRestoreRef.current = true;
    setStatsSubView(null);
  }

  useEffect(() => {
    let cancelled = false;

    async function bootstrapApplication() {
      const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
      const bootErrors = [];

      setInitialBootLoading(true);
      setLoading(true);

      try {
        setBootMessage("Preparing application...");
        const appSettingsResult = await invoke("get_app_settings");
        if (cancelled) {
          return;
        }

        if (appSettingsResult && typeof appSettingsResult === "object") {
          setAppSettings(appSettingsResult);
          applyTheme(appSettingsResult.app_theme);
          setPlaytimeDisplayMode(appSettingsResult.playtime_display_mode);
          if (!hasInitializedViewRef.current) {
            if (!hasInitialDeepLink) {
              setActiveView(String(appSettingsResult.default_page || "dashboard"));
            }
            hasInitializedViewRef.current = true;
          }
        }
      } catch (nextError) {
        bootErrors.push(nextError);
      }

      try {
        setBootMessage("Preparing application...");
        const coreResults = await Promise.allSettled([
          invoke("list_games"),
          invoke("get_dashboard"),
          invoke("list_archived_games"),
          invoke("get_notification_overview"),
        ]);
        if (cancelled) {
          return;
        }

        const [libraryResult, dashboardResult, archiveResult, notificationsResult] = coreResults;
        if (libraryResult.status === "fulfilled") {
          setLibrary(Array.isArray(libraryResult.value) ? libraryResult.value : []);
        } else {
          setLibrary([]);
          bootErrors.push(libraryResult.reason);
        }

        if (dashboardResult.status === "fulfilled") {
          setDashboard(dashboardResult.value && typeof dashboardResult.value === "object" ? dashboardResult.value : null);
        } else {
          setDashboard(null);
          bootErrors.push(dashboardResult.reason);
        }

        if (archiveResult.status === "fulfilled") {
          setArchiveGames(Array.isArray(archiveResult.value) ? archiveResult.value : []);
        } else {
          setArchiveGames([]);
          bootErrors.push(archiveResult.reason);
        }

        if (notificationsResult.status === "fulfilled") {
          setNotifications(Array.isArray(notificationsResult.value?.items) ? notificationsResult.value.items : []);
          setUnreadNotificationCount(Number(notificationsResult.value?.unread_count || 0));
        } else {
          setNotifications([]);
          setUnreadNotificationCount(0);
          bootErrors.push(notificationsResult.reason);
        }
      } catch (nextError) {
        bootErrors.push(nextError);
      }

      try {
        setBootMessage("Preparing application...");
        const secondaryResults = await Promise.allSettled([
          invoke("get_playtime_overview", { mode: "day" }),
          invoke("get_playtime_overview", { mode: "week" }),
          invoke("get_playtime_overview", { mode: "month" }),
          invoke("get_daily_playtime_overview"),
          invoke("get_weekly_playtime_overview"),
          invoke("get_stats_snapshot"),
          invoke("get_igdb_settings"),
          invoke("get_app_system_info"),
          initialViewState.selectedGameId
            ? invoke("get_game_detail", { gameId: initialViewState.selectedGameId })
            : Promise.resolve(null),
        ]);
        if (cancelled) {
          return;
        }

        const [
          dayOverviewResult,
          weekOverviewResult,
          monthOverviewResult,
          dailyOverviewResult,
          weeklyOverviewResult,
          statsSnapshotResult,
          igdbSettingsResult,
          systemInfoResult,
          selectedGameDetailResult,
        ] = secondaryResults;

        setStartupData({
          dashboardDayOverview: dayOverviewResult.status === "fulfilled" ? dayOverviewResult.value : null,
          dashboardWeekOverview: weekOverviewResult.status === "fulfilled" ? weekOverviewResult.value : null,
          dashboardMonthOverview: monthOverviewResult.status === "fulfilled" ? monthOverviewResult.value : null,
          dailyPlaytimeOverview: dailyOverviewResult.status === "fulfilled" ? dailyOverviewResult.value : null,
          weeklyPlaytimeOverview: weeklyOverviewResult.status === "fulfilled" ? weeklyOverviewResult.value : null,
          statsSnapshot: statsSnapshotResult.status === "fulfilled" ? statsSnapshotResult.value : null,
          igdbSettings: igdbSettingsResult.status === "fulfilled" ? igdbSettingsResult.value : null,
          systemInfo: systemInfoResult.status === "fulfilled" ? systemInfoResult.value : null,
          selectedGameDetail: selectedGameDetailResult.status === "fulfilled" ? selectedGameDetailResult.value : null,
        });

        secondaryResults.forEach((result) => {
          if (result.status === "rejected") {
            bootErrors.push(result.reason);
          }
        });
      } catch (nextError) {
        bootErrors.push(nextError);
      } finally {
        if (cancelled) {
          return;
        }

        const elapsed = (typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt;
        const remainingDelay = Math.max(INITIAL_APP_BOOT_MIN_MS - elapsed, 0);
        if (remainingDelay > 0) {
          await new Promise((resolve) => window.setTimeout(resolve, remainingDelay));
        }

        hasCompletedInitialViewLoadRef.current = true;
        skipNextViewLoadRef.current = true;
        setLoading(false);
        setInitialBootLoading(false);

        if (bootErrors.length) {
          const primaryError = bootErrors.find(Boolean);
          notifyAppError("Some startup data could not be loaded.", primaryError || new Error("Unknown startup error"), "warning");
        }
      }
    }

    bootstrapApplication();
    return () => {
      cancelled = true;
    };
  }, [hasInitialDeepLink, initialViewState.selectedGameId]);

  useEffect(() => {
    const section = getCurrentSection();
    if (!section) {
      return;
    }

    sectionLocationsRef.current[section] = {
      activeView,
      selectedGameId,
      detailOriginView,
      statsSubView,
    };
  }, [activeView, detailOriginView, selectedGameId, statsSubView]);

  async function loadDataForView(view) {
    const requests = [];

    if (shouldLoadLibrary(view)) {
      requests.push(invoke("list_games").then((value) => ({ key: "library", value })));
    }
    if (shouldLoadDashboard(view)) {
      requests.push(invoke("get_dashboard").then((value) => ({ key: "dashboard", value })));
    }
    if (shouldLoadArchive(view)) {
      requests.push(invoke("list_archived_games").then((value) => ({ key: "archive", value })));
    }
    if (shouldLoadNotifications(view)) {
      requests.push(invoke("get_notification_overview").then((value) => ({ key: "notifications", value })));
    }

    const results = await Promise.all(requests);
    results.forEach(({ key, value }) => {
      if (key === "library") {
        setLibrary(Array.isArray(value) ? value : []);
        return;
      }
      if (key === "dashboard") {
        const nextDashboard = value && typeof value === "object" ? value : null;
        const currentActive = Array.isArray(nextDashboard?.active_games) ? nextDashboard.active_games : [];
        const previousActive = previousActiveGamesRef.current || [];
        const ended = previousActive.filter((prev) => !currentActive.some((curr) => curr.game_id === prev.game_id));


        previousActiveGamesRef.current = currentActive;
        setDashboard(nextDashboard);
        return;
      }
      if (key === "archive") {
        setArchiveGames(Array.isArray(value) ? value : []);
        return;
      }
      if (key === "notifications") {
        setNotifications(Array.isArray(value?.items) ? value.items : []);
        setUnreadNotificationCount(Number(value?.unread_count || 0));
      }
    });
  }

  function applyTheme(theme) {
    const nextTheme = String(theme || "dark").toLowerCase() === "light" ? "light" : "dark";
    document.body.dataset.theme = nextTheme;
    document.documentElement.dataset.theme = nextTheme;
    document.documentElement.style.colorScheme = nextTheme;
  }

  useEffect(() => {
    let cancelled = false;

    if (initialBootLoading) {
      return () => {
        cancelled = true;
      };
    }

    const shouldPoll = LIVE_REFRESH_VIEWS.has(activeView);

    async function load(showLoader = false) {
      const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
      try {
        if (showLoader) {
          setLoading(true);
        }
        await loadDataForView(activeView);
        if (cancelled) {
          return;
        }
      } catch (nextError) {
        if (!cancelled) {
          notifyAppError("Unable to load app data.", nextError);
        }
      } finally {
        if (!cancelled && showLoader) {
          const elapsed = (typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt;
          const remainingDelay = Math.max(INITIAL_VIEW_LOADING_MIN_MS - elapsed, 0);
          if (remainingDelay > 0) {
            await new Promise((resolve) => window.setTimeout(resolve, remainingDelay));
          }
        }

        if (!cancelled && showLoader) {
          setLoading(false);
          hasCompletedInitialViewLoadRef.current = true;
        }
      }
    }

    if (skipNextViewLoadRef.current) {
      skipNextViewLoadRef.current = false;
    } else {
      load(!hasCompletedInitialViewLoadRef.current);
    }
    if (!shouldPoll) {
      return () => {
        cancelled = true;
      };
    }

    const intervalId = window.setInterval(() => {
      load(false);
    }, REFRESH_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [activeView, initialBootLoading]);

  useEffect(() => {
    applyTheme(appSettings.app_theme);
  }, [appSettings.app_theme]);

  useEffect(() => {
    setPlaytimeDisplayMode(appSettings.playtime_display_mode);
  }, [appSettings.playtime_display_mode]);

  useEffect(() => {
    let unlisten = null;
    let cancelled = false;

    async function attachTrayListener() {
      try {
        unlisten = await listen("tray-open-game-detail", (event) => {
          const gameId = Number(event?.payload);
          if (!Number.isFinite(gameId) || gameId <= 0) {
            return;
          }
          setSelectedGameId(gameId);
          setDetailOriginView("dashboard");
          setActiveView("game-detail");
        });
      } catch (nextError) {
        if (!cancelled) {
          console.warn("Failed to attach tray listener", nextError);
        }
      }
    }

    attachTrayListener();

    return () => {
      cancelled = true;
      if (typeof unlisten === "function") {
        unlisten();
      }
    };
  }, []);

  useEffect(() => {
    const viewport = contentViewportRef.current;
    if (!viewport) {
      return undefined;
    }

    function updateContentScale() {
      const availableWidth = viewport.clientWidth;
      if (!availableWidth) {
        return;
      }

      const nextScale = Math.min(1, availableWidth / CONTENT_BASE_WIDTH);
      setContentScale(nextScale < 0.999 ? Math.max(0.72, nextScale) : 1);
    }

    updateContentScale();
    const observer = new ResizeObserver(updateContentScale);
    observer.observe(viewport);
    window.addEventListener("resize", updateContentScale);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateContentScale);
    };
  }, []);

  useEffect(() => {
    if (activeView !== "stats" || statsSubView || !pendingStatsScrollRestoreRef.current) {
      return undefined;
    }

    let cancelled = false;
    const targetScrollTop = statsScrollTopRef.current;
    let timeoutId = 0;
    let rafTwo = 0;

    function restoreScroll() {
      if (cancelled || !contentScrollRef.current) {
        return;
      }
      contentScrollRef.current.scrollTop = targetScrollTop;
    }

    const rafOne = window.requestAnimationFrame(() => {
      restoreScroll();
      rafTwo = window.requestAnimationFrame(() => {
        restoreScroll();
        timeoutId = window.setTimeout(() => {
          restoreScroll();
          pendingStatsScrollRestoreRef.current = false;
        }, 0);
      });
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(rafOne);
      if (rafTwo) {
        window.cancelAnimationFrame(rafTwo);
      }
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [activeView, statsSubView]);

  useEffect(() => {
    function handleContextMenu(event) {
      if (event.target instanceof Element && event.target.closest(".window-titlebar")) {
        setContextMenuState(null);
        return;
      }

      event.preventDefault();
      setContextMenuState({
        x: event.clientX,
        y: event.clientY,
      });
    }

    function handlePointerDown(event) {
      if (!contextMenuRef.current?.contains(event.target)) {
        setContextMenuState(null);
      }
    }

    function handleWindowBlur() {
      setContextMenuState(null);
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setContextMenuState(null);
      }
      if (event.key === "F11") {
        event.preventDefault();
        toggleWindowFullscreen();
      }
    }

    function handleScroll() {
      setContextMenuState(null);
    }

    document.addEventListener("contextmenu", handleContextMenu);
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("blur", handleWindowBlur);
    window.addEventListener("scroll", handleScroll, true);

    return () => {
      document.removeEventListener("contextmenu", handleContextMenu);
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("blur", handleWindowBlur);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, []);

  useEffect(() => {
    if (!contextMenuState || !contextMenuRef.current) {
      return;
    }

    const menuRect = contextMenuRef.current.getBoundingClientRect();
    const maxX = Math.max(12, window.innerWidth - menuRect.width - 12);
    const maxY = Math.max(12, window.innerHeight - menuRect.height - 12);
    const nextX = Math.min(contextMenuState.x, maxX);
    const nextY = Math.min(contextMenuState.y, maxY);

    if (nextX !== contextMenuState.x || nextY !== contextMenuState.y) {
      setContextMenuState((current) => (
        current
          ? { ...current, x: nextX, y: nextY }
          : current
      ));
    }
  }, [contextMenuState]);

  useEffect(() => {
    let cancelled = false;

    getWindowMaximized().then((maximized) => {
      if (!cancelled) {
        setIsWindowMaximized(Boolean(maximized));
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const enrichedLibrary = useMemo(() => {
    return library.map((game, index) => ({
      ...game,
      isFavorite: Boolean(game.is_favorite),
    }));
  }, [library]);

  const libraryStoreTabs = useMemo(() => {
    const counts = new Map();

    enrichedLibrary.forEach((game) => {
      const label = normalizeLibraryStoreLabel(game.store);
      counts.set(label, (counts.get(label) || 0) + 1);
    });

    return Array.from(counts.entries())
      .sort(compareLibraryStoreTabs)
      .map(([label, count]) => ({
        id: buildLibraryStoreTabId(label),
        label,
        count,
      }));
  }, [enrichedLibrary]);

  const filteredLibrary = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return enrichedLibrary
      .filter((game) => {
        if (activeTab === "recent" && !game.last_played) {
          return false;
        }
        if (activeTab === "installed" && Number(game.executable_count || 0) <= 0 && !game.executable_path && !game.executable_name) {
          return false;
        }
        if (activeTab === "unplayed" && Number(game.total_seconds || 0) > 0) {
          return false;
        }
        if (activeTab === "favorites" && !game.isFavorite) {
          return false;
        }
        if (activeTab.startsWith("status:")) {
          const targetStatus = activeTab.slice("status:".length);
          const gameStatus = game.completion_status || "Backlog";
          if (gameStatus.toLowerCase() !== targetStatus.toLowerCase()) {
            return false;
          }
        }
        if (activeTab.startsWith("store:")) {
          const gameStoreTabId = buildLibraryStoreTabId(normalizeLibraryStoreLabel(game.store));
          if (gameStoreTabId !== activeTab) {
            return false;
          }
        }
        if (!normalizedQuery) {
          return true;
        }
        return String(game.name || "").toLowerCase().includes(normalizedQuery);
      })
      .sort((left, right) => sortLibrary(left, right, sortBy));
  }, [activeTab, enrichedLibrary, query, sortBy]);

  useEffect(() => {
    setPage(1);
  }, [activeTab, query, sortBy, viewMode]);

  useEffect(() => {
    if (activeTab.startsWith("store:") && !libraryStoreTabs.some((tab) => tab.id === activeTab)) {
      setActiveTab("all");
    }
  }, [activeTab, libraryStoreTabs]);

  useEffect(() => {
    if (viewMode === "poster") {
      setViewMode("compact");
    }
  }, [viewMode]);

  const totalPages = Math.max(1, Math.ceil(filteredLibrary.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const visibleGames = filteredLibrary.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const totalPlaytimeSeconds = useMemo(
    () => enrichedLibrary.reduce((sum, game) => sum + Number(game.total_seconds || 0), 0),
    [enrichedLibrary]
  );
  const installedGamesCount = useMemo(
    () => enrichedLibrary.filter((game) => Number(game.executable_count || 0) > 0 || Boolean(game.executable_path || game.executable_name)).length,
    [enrichedLibrary]
  );
  const favoritedGamesCount = useMemo(
    () => enrichedLibrary.filter((game) => Boolean(game.is_favorite)).length,
    [enrichedLibrary]
  );
  const unplayedGamesCount = useMemo(
    () => enrichedLibrary.filter((game) => Number(game.total_seconds || 0) <= 0).length,
    [enrichedLibrary]
  );

  const summaryCards = [
    {
      id: "games",
      icon: "gamepad",
      tone: "neutral",
      label: "Total Games",
      value: String(enrichedLibrary.length),
      caption: "games owned",
    },
    {
      id: "installed",
      icon: "download",
      tone: "green",
      label: "Installed Games",
      value: String(installedGamesCount),
      caption: "installed & ready",
    },
    {
      id: "favorites",
      icon: "star",
      tone: "gold",
      label: "Favorited Games",
      value: String(favoritedGamesCount),
      caption: "marked favorite",
    },
    {
      id: "unplayed",
      icon: "clock",
      tone: "purple",
      label: "Unplayed Games",
      value: String(unplayedGamesCount),
      caption: "never played",
    },
  ];

  const dashboardCards = [
    {
      id: "today",
      icon: "clock",
      tone: "accent",
      id: "today",
      icon: "clock",
      tone: "accent",
      label: "Today's Playtime",
      value: formatDurationLong(dashboard?.today_seconds || 0),
      caption: "played today",
    },
    {
      id: "week",
      icon: "chart",
      tone: "purple",
      label: "This Week",
      value: formatDurationLong(dashboard?.week_seconds || 0),
      caption: "tracked this week",
    },
    {
      id: "active",
      icon: "gamepad",
      tone: "gold",
      label: "Running Games",
      value: String(dashboard?.active_games?.length || 0),
      caption: "currently active",
    },
    {
      id: "recent",
      icon: "grid",
      tone: "neutral",
      label: "Recently Played",
      value: String(dashboard?.recent_games?.length || 0),
      caption: "latest sessions",
    },
  ];

  function openGameDetail(gameId, originView = activeView) {
    setSelectedGameId(Number(gameId));
    setDetailOriginView(originView);
    setActiveView("game-detail");
  }

  function closeGameDetail() {
    setActiveView(detailOriginView || "library");
    setSelectedGameId(null);
  }

  function openGameEdit(gameId) {
    setSelectedGameId(Number(gameId));
    setActiveView("game-edit");
  }

  function closeGameEdit() {
    setActiveView("game-detail");
  }

  async function handleToggleFavorite(gameId, isFavorite) {
    try {
      await invoke("set_game_favorite", { gameId: Number(gameId), isFavorite: Boolean(isFavorite) });
      setLibrary((current) => current.map((game) => (
        Number(game.id) === Number(gameId)
          ? { ...game, is_favorite: Boolean(isFavorite) }
          : game
      )));
      return true;
    } catch (nextError) {
      notifyAppError("Unable to update favorite.", nextError);
      return false;
    }
  }

  async function handleUpdateStatus(gameId, nextStatus) {
    try {
      const numericGameId = Number(gameId);
      const targetGame = enrichedLibrary.find((g) => Number(g.id) === numericGameId);
      if (!targetGame) {
        return false;
      }

      await invoke("update_game_metadata", {
        input: {
          gameId: numericGameId,
          name: targetGame.name,
          store: targetGame.store || null,
          coverUrl: targetGame.cover_url || null,
          coverPositionX: targetGame.cover_position_x,
          coverPositionY: targetGame.cover_position_y,
          coverZoom: targetGame.cover_zoom,
          backdropUrl: targetGame.backdrop_url || null,
          backdropPositionX: targetGame.backdrop_position_x,
          backdropPositionY: targetGame.backdrop_position_y,
          backdropZoom: targetGame.backdrop_zoom,
          titleLogoUrl: targetGame.title_logo_url || null,
          useTitleLogo: targetGame.use_title_logo,
          titleLogoPositionX: targetGame.title_logo_position_x,
          titleLogoPositionY: targetGame.title_logo_position_y,
          titleLogoZoom: targetGame.title_logo_zoom,
          summary: targetGame.summary || null,
          releaseYear: targetGame.release_year || null,
          genres: targetGame.genres || [],
          platforms: targetGame.platforms || [],
          developers: targetGame.developers || [],
          publishers: targetGame.publishers || [],
          ageRatingLabel: targetGame.age_rating?.label || null,
          completionStatus: nextStatus,
        },
      });

      setLibrary((current) =>
        current.map((game) => (Number(game.id) === numericGameId ? { ...game, completion_status: nextStatus } : game))
      );
      pushAppNotice({
        tone: "success",
        title: "Status updated.",
        message: `Completion status changed to "${nextStatus}".`,
      });
      return true;
    } catch (nextError) {
      notifyAppError("Unable to update status.", nextError);
      return false;
    }
  }

  async function handleDeleteGame(gameId) {
    const numericGameId = Number(gameId || 0);
    if (!numericGameId) return false;

    const targetGame = library.find((g) => Number(g.id) === numericGameId) || (Number(selectedGameId) === numericGameId ? selectedGame : null);
    const label = targetGame?.name || "this game";

    setConfirmState({
      title: "Delete Game",
      messagePrefix: "Delete ",
      messageHighlight: label,
      messageSuffix: "? This cannot be undone.",
      confirmLabel: "Delete Game",
      cancelLabel: "Cancel",
      tone: "danger",
      onConfirm: async () => {
        try {
          await invoke("delete_game", { gameId: numericGameId });
          await refreshLibraryData();
          pushAppNotice({
            tone: "success",
            titleBold: false,
            title: "Game deleted.",
            messageStrong: label,
            messageText: " was removed from your library.",
          });

          if (Number(selectedGameId) === numericGameId) {
            setSelectedGameId(null);
            setActiveView(detailOriginView || "library");
          }

          return true;
        } catch (nextError) {
          notifyAppError("Unable to delete game.", nextError);
          return false;
        }
      },
    });
    return false;
  }

  async function handleAddGameAdded(result) {
    await refreshLibraryData();

    const gameName = String(result?.game_name || "").trim();
    if (result?.status === "restored") {
      pushAppNotice({
        tone: "success",
        titleBold: false,
        title: "Game restored from archive.",
        ...(gameName
          ? { messageStrong: gameName, messageText: " was restored from the backup database." }
          : { message: "The game was restored from the backup database." }),
      });
      return;
    }

    pushAppNotice({
      tone: "success",
      titleBold: false,
      title: "Game added.",
      ...(gameName
        ? { messageStrong: gameName, messageText: " was added to your library." }
        : { message: "The game was added to your library." }),
    });
  }

  async function handleResetLibraryMetadata() {
    if (isResettingLibraryMetadata) {
      return false;
    }

    setConfirmState({
      title: "Reset Library Metadata",
      message:
        "Reset metadata layout for all games and resync from IGDB where available? Custom crop, zoom, and title logo positioning will be removed.",
      confirmLabel: "Reset Metadata",
      cancelLabel: "Cancel",
      tone: "danger",
      onConfirm: async () => {
        try {
          setIsResettingLibraryMetadata(true);
          clearSteamHeaderCache();
          clearSteamCapsuleCache();
          const result = await invoke("reset_library_metadata_to_igdb");
          await refreshLibraryData();
          setViewRefreshNonce((current) => current + 1);

          const resetCount = Number(result?.reset || 0);
          const skippedCount = Number(result?.skipped || 0);
          const failedCount = Number(result?.failed || 0);
          const messageParts = [`${resetCount} game reset`];
          if (skippedCount > 0) {
            messageParts.push(`${skippedCount} skipped`);
          }
          if (failedCount > 0) {
            messageParts.push(`${failedCount} failed`);
          }

          pushAppNotice({
            tone: failedCount > 0 ? "warning" : "success",
            titleBold: false,
            title: failedCount > 0 ? "Library metadata reset finished with issues." : "Library metadata reset complete.",
            message: messageParts.join(" • "),
          });
          return true;
        } catch (nextError) {
          notifyAppError("Unable to reset library metadata.", nextError);
          return false;
        } finally {
          setIsResettingLibraryMetadata(false);
        }
      },
    });

    return false;
  }

  async function handleRestoreArchivedGame(game) {
    if (!game?.archive_id) {
      return;
    }

    try {
      setRestoringArchiveId(game.archive_id);
      const exePath = await invoke("pick_exe_path");
      if (!exePath) {
        return;
      }

      const result = await invoke("restore_archived_game_entry", {
        archiveId: Number(game.archive_id),
        exePath,
      });

      await refreshLibraryData();
      pushAppNotice({
        tone: "success",
        titleBold: false,
        title: "Game restored from archive.",
        messageStrong: String(result?.game_name || game.name || "The game"),
        messageText: " was restored to your library.",
      });
      setActiveView("library");
    } catch (nextError) {
      notifyAppError("Unable to restore archived game.", nextError);
    } finally {
      setRestoringArchiveId(null);
    }
  }

  async function handleDeleteArchivedGame(game) {
    if (!game?.archive_id) {
      return;
    }

    const label = game.name || "this archived game";
    setConfirmState({
      title: "Delete Permanently",
      messagePrefix: "Delete ",
      messageHighlight: label,
      messageSuffix: " permanently from archive? This cannot be undone.",
      confirmLabel: "Delete Permanently",
      cancelLabel: "Cancel",
      tone: "danger",
      onConfirm: async () => {
        try {
          setDeletingArchiveId(game.archive_id);
          await invoke("delete_archived_game_entry", { archiveId: Number(game.archive_id) });
          await refreshLibraryData();
          pushAppNotice({
            tone: "success",
            titleBold: false,
            title: "Archive entry deleted.",
            messageStrong: label,
            messageText: " was removed permanently from the backup database.",
          });
        } catch (nextError) {
          notifyAppError("Unable to delete archive entry.", nextError);
        } finally {
          setDeletingArchiveId(null);
        }
      },
    });
  }

  async function handleNotificationsOpened() {
    try {
      await invoke("mark_all_notifications_read");
      setUnreadNotificationCount(0);
      setNotifications((current) => current.map((item) => ({ ...item, read_at: item.read_at || Math.floor(Date.now() / 1000) })));
    } catch (nextError) {
      notifyAppError("Unable to update notifications.", nextError);
    }
  }

  async function handleConfirmAction() {
    const action = confirmState?.onConfirm;
    setConfirmState(null);
    await action?.();
  }

  const selectedGame = enrichedLibrary.find((game) => Number(game.id) === Number(selectedGameId)) || null;

  return (
    <div className={`app-frame${contentScale < 0.999 ? " is-window-scaled" : ""} bg-[#000000] text-white h-screen w-full flex flex-col overflow-hidden font-sans`}>
      <WindowTitlebar
        isMaximized={isWindowMaximized}
        onMinimize={() => minimizeWindow()}
        onToggleMaximize={async () => {
          const maximized = await toggleWindowMaximize();
          setIsWindowMaximized(Boolean(maximized));
        }}
        onClose={() => closeWindow()}
        canGoBack={historyIndex > 0}
        canGoForward={historyIndex < historyStack.length - 1}
        canGoUp={canGoUp}
        onGoBack={handleGoBack}
        onGoForward={handleGoForward}
        onGoUp={handleGoUp}
        onRefresh={handleRefreshTopBar}
      />
      <div className="shell flex flex-1 overflow-hidden relative">
        <Sidebar
          activeView={
            activeView === "game-detail"
              ? detailOriginView
              : activeView === "dashboard-today-detail"
                  ? "dashboard"
                : activeView === "dashboard-week-detail"
                  ? "dashboard"
                : activeView === "notifications"
                  ? "dashboard"
                : activeView
          }
          onNavigate={navigateToView}
        />
        <main ref={contentScrollRef} className={`content${activeView === "game-detail" ? " is-game-detail" : ""}`}>
          <div ref={contentViewportRef} className="content-viewport">
            <div className={`content-stage${activeView === "game-detail" ? " is-game-detail" : ""}`}>
              <div className={`content-inner${loading ? " is-loading" : ""}${activeView === "game-detail" ? " is-game-detail" : ""}`} style={{ zoom: activeView === "game-detail" ? 1 : contentScale }}>
                {activeView === "dashboard" ? (
                  <DashboardPage
                    key={`dashboard-${viewRefreshNonce}`}
                    dashboard={dashboard}
                    library={enrichedLibrary}
                    topGameArtwork={appSettings.top_game_artwork || "capsule"}
                    notifications={notifications}
                    unreadNotificationCount={unreadNotificationCount}
                    loading={loading}
                    initialDayOverview={startupData.dashboardDayOverview}
                    initialWeekOverview={startupData.dashboardWeekOverview}
                    initialDailyOverview={startupData.dailyPlaytimeOverview}
                    initialChartModeOverview={startupData.dashboardWeekOverview}
                    onOpenGameDetail={(gameId) => openGameDetail(gameId, "dashboard")}
                    onOpenTodayDetail={() => setActiveView("dashboard-today-detail")}
                    onOpenWeekDetail={() => setActiveView("dashboard-week-detail")}
                    onNotificationsOpened={handleNotificationsOpened}
                    onOpenAllNotifications={() => setActiveView("notifications")}
                  />
                ) : null}

                {activeView === "library" ? (
                  <LibraryPage
                    activeTab={activeTab}
                    currentPage={currentPage}
                    filteredLibrary={filteredLibrary}
                    loading={loading}
                    page={page}
                    query={query}
                    setActiveTab={setActiveTab}
                    setPage={setPage}
                    setQuery={setQuery}
                    setSortBy={setSortBy}
                    setViewMode={setViewMode}
                    sortBy={sortBy}
                    summaryCards={summaryCards}
                    totalPages={totalPages}
                    viewMode={viewMode}
                    visibleGames={visibleGames}
                    onOpenGameDetail={(gameId) => openGameDetail(gameId, "library")}
                    onOpenGameEdit={openGameEdit}
                    onDeleteGame={handleDeleteGame}
                    onToggleFavorite={handleToggleFavorite}
                    onUpdateStatus={handleUpdateStatus}
                    onOpenAddGame={() => setIsAddGameOpen(true)}
                    onResetAllMetadata={handleResetLibraryMetadata}
                    isResettingAllMetadata={isResettingLibraryMetadata}
                    storeTabs={libraryStoreTabs}
                  />
                ) : null}

                {activeView === "archive" ? (
                  <ArchivePage
                    archiveGames={archiveGames}
                    loading={loading}
                    restoringArchiveId={restoringArchiveId}
                    deletingArchiveId={deletingArchiveId}
                    onNotify={pushAppNotice}
                    onRestore={handleRestoreArchivedGame}
                    onDeletePermanently={handleDeleteArchivedGame}
                  />
                ) : null}

                {activeView === "stats" ? (
                  statsSubView === "playtime-detail" ? (
                    <PlaytimeDetailPage
                      library={enrichedLibrary}
                      loading={loading}
                      topGameArtwork={appSettings.top_game_artwork || "capsule"}
                      onBack={closeStatsSubView}
                    />
                  ) : statsSubView === "daily-playtime-detail" ? (
                    <DailyPlaytimeDetailPage
                      library={enrichedLibrary}
                      loading={loading}
                      topGameArtwork={appSettings.top_game_artwork || "capsule"}
                      onBack={closeStatsSubView}
                      onOpenTable={() => setStatsSubView("daily-playtime-table")}
                      onNotify={pushAppNotice}
                    />
                  ) : statsSubView === "daily-playtime-table" ? (
                    <DailyPlaytimePage
                      library={enrichedLibrary}
                      initialOverview={startupData.dailyPlaytimeOverview}
                      onBack={() => setStatsSubView("daily-playtime-detail")}
                      onNotify={pushAppNotice}
                    />
                  ) : statsSubView === "weekly-playtime-detail" ? (
                    <WeeklyPlaytimeDetailPage
                      library={enrichedLibrary}
                      loading={loading}
                      topGameArtwork={appSettings.top_game_artwork || "capsule"}
                      onBack={closeStatsSubView}
                      onOpenTable={() => setStatsSubView("weekly-playtime-table")}
                      onNotify={pushAppNotice}
                    />
                  ) : statsSubView === "weekly-playtime-table" ? (
                    <WeeklyPlaytimePage
                      library={enrichedLibrary}
                      initialOverview={startupData.weeklyPlaytimeOverview}
                      onBack={() => setStatsSubView("weekly-playtime-detail")}
                      onNotify={pushAppNotice}
                    />
                  ) : (
                    <StatsPage
                      key={`stats-${viewRefreshNonce}`}
                      library={enrichedLibrary}
                      loading={loading}
                      topGameArtwork={appSettings.top_game_artwork || "capsule"}
                      initialStatsSnapshot={startupData.statsSnapshot}
                      onNotify={pushAppNotice}
                      onOpenPlaytimeDetail={() => openStatsSubView("playtime-detail")}
                      onOpenDailyPlaytime={() => openStatsSubView("daily-playtime-detail")}
                      onOpenWeeklyPlaytime={() => openStatsSubView("weekly-playtime-detail")}
                    />
                  )
                ) : null}

                {activeView === "dashboard-today-detail" ? (
                  <DailyPlaytimePage
                    library={enrichedLibrary}
                    initialOverview={startupData.dailyPlaytimeOverview}
                    onBack={() => setActiveView("dashboard")}
                    onNotify={pushAppNotice}
                  />
                ) : null}

                {activeView === "dashboard-week-detail" ? (
                  <WeeklyPlaytimePage
                    library={enrichedLibrary}
                    initialOverview={startupData.weeklyPlaytimeOverview}
                    onBack={() => setActiveView("dashboard")}
                    onNotify={pushAppNotice}
                  />
                ) : null}

                {activeView === "notifications" ? (
                  <NotificationsPage
                    notifications={notifications}
                    unreadCount={unreadNotificationCount}
                    onBack={() => setActiveView("dashboard")}
                  />
                ) : null}

                {activeView === "game-detail" && selectedGameId ? (
                  <GameDetailPage
                    key={`game-detail-${selectedGameId}-${viewRefreshNonce}`}
                    gameId={selectedGameId}
                    fallbackGame={selectedGame}
                    initialDetail={
                      Number(startupData.selectedGameDetail?.id || 0) === Number(selectedGameId)
                        ? startupData.selectedGameDetail
                        : null
                    }
                    backLabel="Back"
                    onBack={closeGameDetail}
                    onEdit={() => openGameEdit(selectedGameId)}
                    onDelete={() => handleDeleteGame(selectedGameId)}
                    onToggleFavorite={handleToggleFavorite}
                    onNotify={pushAppNotice}
                    onRefreshLibrary={async () => {
                      try {
                        await refreshLibraryData();
                      } catch (nextError) {
                        notifyAppError("Unable to refresh library data.", nextError);
                      }
                    }}
                  />
                ) : null}

                {activeView === "game-edit" && selectedGameId ? (
                  <EditGamePage
                    key={`game-edit-${selectedGameId}-${viewRefreshNonce}`}
                    gameId={selectedGameId}
                    fallbackGame={selectedGame}
                    initialDetail={
                      Number(startupData.selectedGameDetail?.id || 0) === Number(selectedGameId)
                        ? startupData.selectedGameDetail
                        : null
                    }
                    backLabel="Back"
                    onBack={closeGameEdit}
                    onNotify={pushAppNotice}
                    onSaved={closeGameEdit}
                    onRefreshLibrary={async () => {
                      try {
                        await refreshLibraryData();
                      } catch (nextError) {
                        notifyAppError("Unable to refresh library data.", nextError);
                      }
                    }}
                  />
                ) : null}

                {activeView === "settings" ? (
                  <SettingsPage
                    key={`settings-${viewRefreshNonce}`}
                    appSettings={appSettings}
                    initialIgdbSettings={startupData.igdbSettings}
                    initialSystemInfo={startupData.systemInfo}
                    onAppSettingsCommitted={setAppSettings}
                    onThemePreview={applyTheme}
                    onNotify={pushAppNotice}
                    onUserSettingsDirtyChange={setHasUnsavedUserSettings}
                    onRequestConfirm={requestAppConfirm}
                    onRefreshLibrary={async () => {
                      try {
                        await refreshLibraryData();
                      } catch (nextError) {
                        notifyAppError("Unable to refresh library data.", nextError);
                      }
                    }}
                  />
                ) : null}

                {activeView !== "dashboard" && activeView !== "library" && activeView !== "archive" && activeView !== "stats" && activeView !== "dashboard-today-detail" && activeView !== "dashboard-week-detail" && activeView !== "notifications" && activeView !== "game-detail" && activeView !== "game-edit" && activeView !== "settings" ? (
                  <PlaceholderPage activeView={activeView} />
                ) : null}

                <AddGameModal
                  open={isAddGameOpen}
                  onClose={() => setIsAddGameOpen(false)}
                  onAdded={handleAddGameAdded}
                  onNotify={pushAppNotice}
                  onOpenAutoScan={() => {
                    setIsAddGameOpen(false);
                    setIsAutoScanOpen(true);
                  }}
                />

                <AutoScanModal
                  open={isAutoScanOpen}
                  onClose={() => setIsAutoScanOpen(false)}
                  onImported={handleAddGameAdded}
                  onNotify={pushAppNotice}
                />
              </div>

              {loading ? (
                <div className={`content-loading-overlay${initialBootLoading ? " is-booting" : ""}`} aria-hidden="true">
                  <LoadingIndicator label={initialBootLoading ? bootMessage : "Preparing application..."} />
                </div>
              ) : null}

              {isResettingLibraryMetadata ? (
                <div className="confirm-modal-overlay edit-game-loading-overlay" aria-hidden="true">
                  <LoadingIndicator label="Resetting library metadata..." />
                </div>
              ) : null}
            </div>
          </div>
        </main>
      </div>

      <AppNoticeStack notices={appNotices} onDismiss={dismissAppNotice} />

      {confirmState ? (
        <div className="confirm-modal-overlay" role="presentation" onClick={() => setConfirmState(null)}>
          <section
            className="confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="app-confirm-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="confirm-modal-head">
              <strong id="app-confirm-title">{confirmState.title}</strong>
            </div>
            <p>
              {confirmState.messagePrefix || ""}
              {confirmState.messageHighlight ? <strong>{confirmState.messageHighlight}</strong> : null}
              {confirmState.messageSuffix || confirmState.message || ""}
            </p>
            <div className="confirm-modal-actions">
              <button type="button" className="action-button action-button-browse" onClick={() => setConfirmState(null)}>
                {confirmState.cancelLabel || "Cancel"}
              </button>
              <button
                type="button"
                className={`action-button ${resolveConfirmButtonClass(confirmState.tone)}`}
                onClick={handleConfirmAction}
              >
                {confirmState.confirmLabel}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {contextMenuState ? (
        <div
          ref={contextMenuRef}
          className="app-context-menu"
          role="menu"
          style={{ left: contextMenuState.x, top: contextMenuState.y }}
        >
          <button
            type="button"
            className="app-context-menu-item"
            role="menuitem"
            onClick={async () => {
              setContextMenuState(null);
              try {
                await loadDataForView(activeView);
                if (
                  activeView === "dashboard"
                  || activeView === "stats"
                  || activeView === "game-detail"
                  || activeView === "game-edit"
                  || activeView === "settings"
                ) {
                  setViewRefreshNonce((current) => current + 1);
                }
              } catch (nextError) {
                notifyAppError("Unable to refresh view.", nextError);
              }
            }}
          >
            <RefreshIcon />
            <span>Refresh</span>
          </button>
        </div>
      ) : null}


    </div>
  );
}

function AppNoticeStack({ notices, onDismiss }) {
  if (!Array.isArray(notices) || !notices.length) {
    return null;
  }

  return (
    <div className="app-notice-stack" aria-live="polite" aria-atomic="true">
      {notices.map((notice) => (
        <AppNoticeToast key={notice.id} notice={notice} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function AppNoticeToast({ notice, onDismiss }) {
  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      onDismiss?.(notice.id);
    }, 3600);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [notice.id, onDismiss]);

  const tone = String(notice.tone || "info").toLowerCase();
  const toneClassName = tone === "danger" ? "error" : tone === "success" ? "success" : tone === "warning" ? "warning" : "info";
  const Icon = tone === "danger"
    ? WarningTriangleIcon
    : tone === "success"
      ? CheckCircleIcon
      : InfoCircleIcon;

  return (
    <section className={`app-notice-toast ${toneClassName}`} role="status">
      <div className="app-notice-toast-content">
        <div className="app-notice-toast-icon">
          <Icon />
        </div>
        <div className="app-notice-toast-copy">
          {notice.title ? (
            notice.titleBold === false
              ? <span className="app-notice-toast-title">{notice.title}</span>
              : <strong>{notice.title}</strong>
          ) : null}
          {notice.messagePrefix || notice.messageStrong || notice.messageText ? (
            <span>
              {notice.messagePrefix || ""}
              {notice.messageStrong ? <strong className="app-notice-toast-emphasis">{notice.messageStrong}</strong> : null}
              {notice.messageText || ""}
            </span>
          ) : notice.message ? <span>{notice.message}</span> : null}
        </div>
      </div>
      <button
        type="button"
        className="app-notice-toast-close"
        aria-label="Dismiss notification"
        onClick={() => onDismiss?.(notice.id)}
      >
        <CloseIcon />
      </button>
      <span className="app-notice-toast-progress" aria-hidden="true" />
    </section>
  );
}

function resolveConfirmButtonClass(tone) {
  if (tone === "danger") {
    return "action-button-danger";
  }
  if (tone === "igdb") {
    return "action-button-igdb-reset";
  }
  if (tone === "primary") {
    return "action-button-primary";
  }
  return "action-button-primary";
}

export default App;
