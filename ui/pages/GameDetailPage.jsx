import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  buildLogoPresentationStyle,
  buildPosterPresentationStyle,
  buildBackdropPresentationStyle,
  formatDurationDetailed,
  formatDurationLong,
  getInitials,
  resolveCoverMedia,
  resolveGenericMedia,
  resolveSteamLogoMedia,
} from "../lib/game-helpers";
import { invoke, toAssetUrl } from "../lib/tauri";
import {
  ArrowLeftIcon,
  CalendarIcon,
  CheckIcon,
  ChevronDownIcon,
  ClockIcon,
  ExportIcon,
  FileTextIcon,
  FolderIcon,
  GamepadOutlineIcon,
  MonitorIcon,
  MoonIcon,
  PencilIcon,
  PlaySolidIcon,
  RefreshIcon,
  ShieldIcon,
  StarIcon,
  StatusIcon,
  StopwatchIcon,
  TagIcon,
  TrashIcon,
  TrophyIcon,
  UsersIcon,
} from "../components/icons";
import LoadingIndicator from "../components/LoadingIndicator";
import StarRating from "../components/StarRating";
import PostSessionJournalModal from "../components/PostSessionJournalModal";
import { NotebookIcon } from "../components/icons";

function AboutTooltipSection({ summary }) {
  const [position, setPosition] = useState(null);
  const [isTruncated, setIsTruncated] = useState(false);
  const textRef = useRef(null);
  const delayRef = useRef(null);
  const pendingPositionRef = useRef(null);
  const isVisibleRef = useRef(false);

  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    const checkTruncated = () => {
      setIsTruncated(el.scrollHeight > el.clientHeight + 1);
    };
    checkTruncated();
    window.addEventListener("resize", checkTruncated);
    return () => window.removeEventListener("resize", checkTruncated);
  }, [summary]);

  function handlePointerMove(event) {
    if (!isTruncated) return;
    const nextPosition = {
      x: Math.min(event.clientX + 14, window.innerWidth - 530),
      y: Math.min(event.clientY + 14, window.innerHeight - 220),
    };
    pendingPositionRef.current = nextPosition;

    if (isVisibleRef.current) {
      setPosition(nextPosition);
      return;
    }

    if (delayRef.current) return;

    delayRef.current = window.setTimeout(() => {
      isVisibleRef.current = true;
      setPosition(pendingPositionRef.current || nextPosition);
      delayRef.current = null;
    }, 1000);
  }

  function handlePointerLeave() {
    if (delayRef.current) {
      window.clearTimeout(delayRef.current);
      delayRef.current = null;
    }
    pendingPositionRef.current = null;
    isVisibleRef.current = false;
    setPosition(null);
  }

  return (
    <div className="mb-5 w-full">
      <h3 className="text-[11px] font-black text-gray-300 uppercase tracking-widest mb-1.5">ABOUT</h3>
      <p
        ref={textRef}
        className="text-gray-100 text-sm leading-relaxed drop-shadow-md line-clamp-3 cursor-default"
        onPointerEnter={handlePointerMove}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
      >
        {summary}
      </p>
      {position && isTruncated && summary && typeof document !== "undefined"
        ? createPortal(
          <div
            className="about-tooltip-bubble"
            style={{
              left: `${position.x}px`,
              top: `${position.y}px`,
            }}
          >
            {summary}
          </div>,
          document.body
        )
        : null}
    </div>
  );
}

function SessionConnectorTooltipAnchor({ session, children }) {
  const [position, setPosition] = useState(null);
  const isVisibleRef = useRef(false);

  function handlePointerMove(event) {
    if (!session?.is_split) return;
    const nextPosition = {
      x: Math.min(event.clientX + 14, window.innerWidth - 340),
      y: Math.min(event.clientY + 14, window.innerHeight - 100),
    };
    isVisibleRef.current = true;
    setPosition(nextPosition);
  }

  function handlePointerLeave() {
    isVisibleRef.current = false;
    setPosition(null);
  }

  const tooltipTitle = "Single Continuous Session";
  const tooltipText = `${formatSessionClock(session?.raw_started_at)} - ${formatSessionClock(session?.raw_ended_at)} (${formatDurationDetailed(session?.raw_duration_seconds)})`;

  return (
    <>
      <div
        className={`relative flex items-center justify-center shrink-0 ${session?.is_split ? "cursor-help group/line" : ""}`}
        onPointerEnter={handlePointerMove}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
      >
        {children}
      </div>

      {position && session?.is_split && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed z-[9999] pointer-events-none bg-[#161616] text-[#ffffff] text-xs px-3.5 py-2.5 rounded-[14px] shadow-2xl border border-white/10 flex items-start gap-2.5 max-w-[320px]"
              style={{
                left: `${position.x}px`,
                top: `${position.y}px`,
              }}
            >
              <span className="w-2 h-2 rounded-full bg-[#8077ff] mt-1 shrink-0 shadow-[0_0_8px_rgba(128,119,255,0.6)]" />
              <div>
                <strong className="block text-[11px] font-bold text-white tracking-wide uppercase">
                  {tooltipTitle}
                </strong>
                <span className="block text-[11px] text-gray-300 leading-relaxed mt-0.5">
                  {tooltipText}
                </span>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}

function SessionNoteTooltipAnchor({ note, children, onClick }) {
  const [position, setPosition] = useState(null);

  function handlePointerMove(event) {
    if (!note) return;
    const nextPosition = {
      x: Math.min(event.clientX + 14, window.innerWidth - 330),
      y: Math.min(event.clientY + 14, window.innerHeight - 140),
    };
    setPosition(nextPosition);
  }

  function handlePointerLeave() {
    setPosition(null);
  }

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        className="game-detail-note-text"
        onPointerEnter={handlePointerMove}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
      >
        {children}
      </button>

      {position && note && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed z-[9999] pointer-events-none bg-[#161616] text-[#ffffff] text-xs px-3.5 py-2.5 rounded-[14px] shadow-2xl border border-white/10 flex items-start gap-2.5 max-w-[320px]"
              style={{
                left: `${position.x}px`,
                top: `${position.y}px`,
              }}
            >
              <NotebookIcon className="w-3.5 h-3.5 text-purple-400 mt-0.5 shrink-0" />
              <div>
                <strong className="block text-[11px] font-bold text-white tracking-wide uppercase">
                  Session Note
                </strong>
                <span className="block text-[11px] text-gray-300 leading-relaxed mt-0.5 whitespace-pre-wrap break-words">
                  {note}
                </span>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}

function UserRatingReviewCard({ gameId, gameName, initialRating, initialReview, onUpdated }) {
  const [rating, setRating] = useState(initialRating || null);
  const [review, setReview] = useState(() => String(initialReview || ""));
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    setRating(initialRating || null);
    setReview(String(initialReview || ""));
  }, [initialRating, initialReview]);

  const safeReview = String(review || "");

  async function executeSave() {
    setShowConfirm(false);
    setSaving(true);
    try {
      await invoke("update_game_user_rating_review", {
        gameId,
        userRating: rating,
        userReview: safeReview.trim() || null,
      });
      setIsEditing(false);
      onUpdated?.();
    } catch (err) {
      console.error("Failed to save rating/review:", err);
    } finally {
      setSaving(false);
    }
  }

  const hasData = Boolean(rating) || Boolean(safeReview.trim());

  return (
    <div className="flex flex-col relative mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <FileTextIcon className="w-5 h-5 text-[#558467]" />
          <h2 className="text-xl font-bold text-white tracking-tight">Rating & Review</h2>
        </div>
        {isEditing ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setRating(initialRating || null);
                setReview(String(initialReview || ""));
                setIsEditing(false);
              }}
              disabled={saving}
              className="rr-btn rr-btn-idle"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={executeSave}
              disabled={saving}
              className="rr-btn rr-btn-save"
            >
              <CheckIcon className="w-3.5 h-3.5" />
              <span>{saving ? "Saving..." : "Save"}</span>
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            disabled={saving}
            className="rr-btn rr-btn-idle"
          >
            <PencilIcon className="w-3.5 h-3.5" />
            <span>{hasData ? "Edit Review" : "Add Review"}</span>
          </button>
        )}
      </div>

      <div className="space-y-4">
        {isEditing ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-xs font-medium text-gray-400">Rating:</span>
                <StarRating
                  value={rating}
                  onChange={(newVal) => setRating(newVal)}
                  size="md"
                  showLabel
                  noShape
                />
              </div>
              <span className={`text-[11px] font-mono ${safeReview.length >= 2400 ? "text-amber-400 font-bold" : "text-gray-400"}`}>
                {safeReview.length} / 2500
              </span>
            </div>
            <textarea
              value={safeReview}
              onChange={(e) => setReview(e.target.value)}
              maxLength={2500}
              placeholder="// Write your review or personal notes here..."
              rows={4}
              className="w-full bg-[#161616] hover:bg-[#1f1f1f] focus:bg-[#1f1f1f] text-gray-300 text-sm font-mono rounded-r-[14px] rounded-l-none p-4 border-0 border-l-4 border-l-[#7068ff] outline-none resize-none transition-all placeholder:text-gray-600 shadow-md"
            />
          </div>
        ) : (
          hasData ? (
            <div className="space-y-3">
              {Boolean(rating) && (
                <div className="flex items-center gap-3">
                  <StarRating value={rating} readOnly size="md" showLabel noShape />
                </div>
              )}
              {safeReview && (
                <div className="w-full bg-[#161616] hover:bg-[#1f1f1f] text-gray-400 text-sm leading-relaxed p-4 rounded-r-[14px] rounded-l-none border-0 border-l-4 border-l-[#7068ff] shadow-md font-mono whitespace-pre-wrap transition-colors">
                  "{safeReview}"
                </div>
              )}
            </div>
          ) : (
            <div className="w-full bg-[#161616] hover:bg-[#1f1f1f] text-gray-500 text-sm font-mono p-4 rounded-r-[14px] rounded-l-none border-0 border-l-4 border-l-[#7068ff]/60 shadow-md select-none transition-colors">
              // No review or personal notes saved yet.
            </div>
          )
        )}
      </div>

      {/* Confirmation Modal using createPortal to mount directly on document.body to prevent blur leakage */}
      {showConfirm &&
        createPortal(
          <div
            className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fadeIn"
            role="presentation"
            onClick={() => setShowConfirm(false)}
          >
            <section
              className="w-full max-w-[420px] bg-[#161616] text-[#ffffff] rounded-[14px] shadow-2xl p-5 relative border-0 space-y-4"
              role="dialog"
              aria-modal="true"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-2.5">
                <StarIcon className="w-5 h-5 text-amber-400 shrink-0" fill="currentColor" />
                <strong className="text-base font-bold text-white tracking-tight">Save Rating & Review?</strong>
              </div>

              <p className="text-sm text-gray-300 leading-relaxed">
                Are you sure you want to save your rating and review for{" "}
                <strong className="text-white font-semibold">{gameName || "this game"}</strong>?
              </p>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  className="rr-btn rr-btn-lg rr-btn-idle cursor-pointer"
                  onClick={() => setShowConfirm(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="rr-btn rr-btn-lg rr-btn-save cursor-pointer"
                  onClick={executeSave}
                  disabled={saving}
                >
                  {saving ? "Saving..." : "Save"}
                </button>
              </div>
            </section>
          </div>,
          document.body
        )}
    </div>
  );
}

export default function GameDetailPage({
  gameId,
  fallbackGame,
  initialDetail = null,
  backLabel = "Back",
  onBack,
  onEdit,
  onDelete,
  onRefreshLibrary,
  onToggleFavorite,
  onNotify,
}) {
  const [detail, setDetail] = useState(() => (
    Number(initialDetail?.id || 0) === Number(gameId) ? initialDetail : null
  ));
  const [loading, setLoading] = useState(() => Number(initialDetail?.id || 0) !== Number(gameId));
  const [refreshing, setRefreshing] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [isTitleExpanded, setIsTitleExpanded] = useState(false);
  const [isTitleExpandable, setIsTitleExpandable] = useState(false);
  const hasConsumedInitialDetailRef = useRef(Number(initialDetail?.id || 0) === Number(gameId));
  const titleRef = useRef(null);

  function notifyDetail(notice) {
    onNotify?.(notice);
  }

  function notifyDetailError(title, nextError, tone = "danger") {
    notifyDetail({
      tone,
      title,
      message: nextError?.message || String(nextError),
    });
  }

  useEffect(() => {
    let cancelled = false;

    if (hasConsumedInitialDetailRef.current) {
      hasConsumedInitialDetailRef.current = false;
      return () => {
        cancelled = true;
      };
    }

    async function loadDetail() {
      setLoading(true);

      try {
        const nextDetail = await invoke("get_game_detail", { gameId });
        if (!cancelled) {
          setDetail(nextDetail);
        }
      } catch (nextError) {
        if (!cancelled) {
          setDetail(null);
          notifyDetailError("Unable to load game detail.", nextError);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadDetail();
    return () => {
      cancelled = true;
    };
  }, [gameId]);

  const game = detail || fallbackGame || null;
  const poster = useMemo(
    () => resolveCoverMedia(game?.cover_url) || resolveCoverMedia(game?.backdrop_url),
    [game]
  );
  const titleLogo = useMemo(
    () => resolveGenericMedia(game?.title_logo_url) || resolveSteamLogoMedia(game?.backdrop_url, game?.cover_url),
    [game]
  );
  const shouldUseTitleLogo = Boolean(game?.use_title_logo && titleLogo);
  const titleLogoStyle = useMemo(
    () => buildLogoPresentationStyle(game?.title_logo_position_x, game?.title_logo_position_y, game?.title_logo_zoom),
    [game]
  );
  const posterStyle = useMemo(
    () => buildPosterPresentationStyle(game?.cover_position_x, game?.cover_position_y, game?.cover_zoom),
    [game]
  );
  const sessionsCount = Array.isArray(detail?.play_sessions) ? detail.play_sessions.length : 0;
  const splitSessions = useMemo(
    () => splitGameSessions(detail?.play_sessions),
    [detail?.play_sessions]
  );
  const sessionYearGroups = useMemo(
    () => buildSessionYearGroups(splitSessions),
    [splitSessions]
  );
  const availableSessionYears = sessionYearGroups.map((group) => group.year);
  const [selectedSessionYear, setSelectedSessionYear] = useState("");
  const [openSessionMonths, setOpenSessionMonths] = useState([]);
  const [activeJournalSession, setActiveJournalSession] = useState(null);
  const summary = String(game?.summary || "").trim() || "No description available for this game yet.";
  const genres = normalizeTextItems(detail?.genres);
  const platforms = normalizePlatformItems(detail?.platforms);
  const developers = normalizeTextItems(detail?.developers);
  const publishers = normalizeTextItems(detail?.publishers);
  const ageRatingImage = getAgeRatingImage(detail?.age_rating?.label, detail?.age_rating?.image_url);
  const lastPlayedTimestamp = Number(detail?.last_played || game?.finished_last_played || game?.last_played || 0);
  const lastPlayedLabel = lastPlayedTimestamp ? formatDateLabel(lastPlayedTimestamp) : "Not played yet";
  const lastPlayedRelative = lastPlayedTimestamp ? formatRelativePlayed(lastPlayedTimestamp) : "No sessions recorded";
  const executablePath = String(detail?.executable_path || detail?.executable_name || "").trim() || "-";
  const backdropStyle = game?.backdrop_url || game?.cover_url
    ? buildBackdropPresentationStyle(
      game.backdrop_url || game.cover_url,
      game.backdrop_position_x,
      game.backdrop_position_y,
      game.backdrop_zoom
    )
    : undefined;
  const releaseYear = detail?.release_year || game?.release_year || "-";
  const storeLabel = formatGameStoreLabel(detail?.store ?? game?.store);
  const hasExecutable = Boolean(detail?.executable_path);
  const isFavorite = Boolean(game?.isFavorite ?? game?.is_favorite);
  const hasManualPlaytime = Boolean(detail?.has_manual_playtime);
  const addedAtLabel = Number(game?.created_at || 0) > 0 ? formatAddedDateLabel(game.created_at) : "";
  const selectedYearSessions = sessionYearGroups.find((group) => group.year === selectedSessionYear) || null;

  useEffect(() => {
    if (!availableSessionYears.length) {
      if (selectedSessionYear) {
        setSelectedSessionYear("");
      }
      return;
    }
    if (!availableSessionYears.includes(selectedSessionYear)) {
      setSelectedSessionYear(availableSessionYears[0]);
    }
  }, [availableSessionYears, selectedSessionYear]);

  useEffect(() => {
    if (!selectedYearSessions?.months?.length) {
      setOpenSessionMonths([]);
      return;
    }
    setOpenSessionMonths((current) => {
      const valid = current.filter((key) => selectedYearSessions.months.some((month) => month.key === key));
      return valid.length ? valid : [selectedYearSessions.months[0].key];
    });
  }, [selectedYearSessions]);

  useEffect(() => {
    setIsTitleExpanded(false);
  }, [game?.id, game?.name]);

  useEffect(() => {
    if (shouldUseTitleLogo || !titleRef.current || typeof window === "undefined") {
      setIsTitleExpandable(false);
      return undefined;
    }

    const titleElement = titleRef.current;

    function measureTitle() {
      const computedStyle = window.getComputedStyle(titleElement);
      const numericLineHeight = Number.parseFloat(computedStyle.lineHeight);
      const numericFontSize = Number.parseFloat(computedStyle.fontSize);
      const resolvedLineHeight = Number.isFinite(numericLineHeight)
        ? numericLineHeight
        : (Number.isFinite(numericFontSize) ? numericFontSize * 1.05 : 0);
      const maxCollapsedHeight = resolvedLineHeight * 6;
      setIsTitleExpandable(titleElement.scrollHeight - maxCollapsedHeight > 2);
    }

    measureTitle();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measureTitle);
      return () => {
        window.removeEventListener("resize", measureTitle);
      };
    }

    const observer = new ResizeObserver(() => {
      measureTitle();
    });
    observer.observe(titleElement);
    return () => {
      observer.disconnect();
    };
  }, [shouldUseTitleLogo, game?.name, isTitleExpanded]);

  async function reloadLocalData() {
    try {
      const nextDetail = await invoke("get_game_detail", { gameId });
      setDetail(nextDetail);
      await onRefreshLibrary?.();
    } catch (nextError) {
      console.error("Failed to reload local game detail:", nextError);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);

    try {
      await invoke("refresh_game_metadata", { gameId });
      const nextDetail = await invoke("get_game_detail", { gameId });
      setDetail(nextDetail);
      await onRefreshLibrary?.();
      notifyDetail({
        tone: "success",
        title: "Game detail refreshed.",
        message: "Latest metadata has been loaded.",
      });
    } catch (nextError) {
      notifyDetailError("Unable to refresh game detail.", nextError);
    } finally {
      setRefreshing(false);
    }
  }

  async function handlePlay() {
    if (!hasExecutable) {
      return;
    }

    setLaunching(true);

    try {
      await invoke("launch_game", { gameId });
    } catch (nextError) {
      notifyDetailError("Unable to launch game.", nextError);
    } finally {
      setLaunching(false);
    }
  }

  async function handleToggleFavorite() {
    if (!game) {
      return;
    }

    const nextFavorite = !isFavorite;
    const didUpdate = await onToggleFavorite?.(game.id, nextFavorite);
    if (didUpdate) {
      setDetail((current) => (current ? { ...current, is_favorite: nextFavorite } : current));
    }
  }

  async function handleStatusChange(nextStatus) {
    if (!game || !gameId) {
      return;
    }

    try {
      await invoke("update_game_metadata", {
        input: {
          gameId,
          name: game.name,
          store: game.store || null,
          coverUrl: game.cover_url || null,
          coverPositionX: game.cover_position_x,
          coverPositionY: game.cover_position_y,
          coverZoom: game.cover_zoom,
          backdropUrl: game.backdrop_url || null,
          backdropPositionX: game.backdrop_position_x,
          backdropPositionY: game.backdrop_position_y,
          backdropZoom: game.backdrop_zoom,
          titleLogoUrl: game.title_logo_url || null,
          useTitleLogo: game.use_title_logo,
          titleLogoPositionX: game.title_logo_position_x,
          titleLogoPositionY: game.title_logo_position_y,
          titleLogoZoom: game.title_logo_zoom,
          summary: game.summary || null,
          releaseYear: game.release_year || null,
          genres: detail?.genres || [],
          platforms: detail?.platforms || [],
          developers: detail?.developers || [],
          publishers: detail?.publishers || [],
          ageRatingLabel: detail?.age_rating?.label || null,
          completionStatus: nextStatus,
        },
      });

      setDetail((current) => (current ? { ...current, completion_status: nextStatus } : current));
      await onRefreshLibrary?.();
      notifyDetail({
        tone: "success",
        title: "Status updated.",
        message: `Completion status changed to "${nextStatus}".`,
      });
    } catch (nextError) {
      notifyDetailError("Unable to update status.", nextError);
    }
  }

  function handleSessionMonthToggle(monthKey) {
    setOpenSessionMonths((current) => (
      current.includes(monthKey)
        ? current.filter((key) => key !== monthKey)
        : [...current, monthKey]
    ));
  }

  async function handleExportSessions() {
    if (!selectedYearSessions?.sessions?.length || typeof window === "undefined") {
      return;
    }

    const csvRows = [
      ["Date", "Session", "Duration", "Playtime"].join(","),
    ];

    selectedYearSessions.months.forEach((month) => {
      month.days.forEach((day) => {
        day.sessions.forEach((session, index) => {
          csvRows.push([
            csvCell(index === 0 ? day.label : ""),
            csvCell(`${formatSessionClock(session.started_at)} - ${session.ended_at ? formatSessionClock(session.ended_at) : "Now"}`),
            csvCell(formatDurationDetailed(session.duration_seconds || 0)),
            csvCell(index === 0 ? formatDurationDetailed(day.totalSeconds) : ""),
          ].join(","));
        });
      });
    });

    try {
      const fileName = `${slugifyFilePart(game?.name || "game")}-sessions-${selectedSessionYear || "all"}.csv`;
      const savedPath = await invoke("export_game_sessions_csv", {
        fileName,
        content: csvRows.join("\n"),
      });

      if (savedPath) {
        onNotify?.({
          tone: "success",
          title: "Playtime exported.",
          message: `Saved to ${savedPath}`,
        });
      }
    } catch (nextError) {
      notifyDetailError("Unable to export playtime.", nextError);
    }
  }

  return (
    <div className="game-detail-page w-full h-full flex flex-col bg-[#0f0f0f] text-gray-300 overflow-y-auto overflow-x-hidden relative custom-scrollbar pb-20">

      {/* Top Floating Bar */}
      <div className="absolute top-0 left-0 w-full pt-6 px-8 flex items-center gap-5 z-50 pointer-events-none">
        <h1 className="text-3xl font-black text-white tracking-tight drop-shadow-xl pointer-events-auto">Game Details</h1>
      </div>

      {/* Hero Section */}
      <div className="relative w-full min-h-[380px] lg:min-h-[410px] flex-shrink-0">
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-cover bg-top bg-no-repeat transition-all duration-700"
          style={backdropStyle ? { ...backdropStyle, backgroundPosition: "center top" } : { backgroundColor: "#1a1a1a" }}
        />

        {/* Gradients */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0f0f0f] via-[#0f0f0f]/30 to-transparent pointer-events-none" />
        <div className="absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-[#0f0f0f]/75 via-[#0f0f0f]/25 to-transparent pointer-events-none" />

        {/* Hero Content */}
        <div className="absolute top-28 left-0 w-full px-8 flex items-start gap-8 z-20">
          {/* Poster */}
          <div className="w-[185px] flex-shrink-0 rounded-xl overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.7)] border border-white/5 relative z-20 translate-y-8 bg-[#141414] aspect-[2/3]">
            {poster ? (
              <img src={poster} alt={game?.name || "Game poster"} className="w-full h-full object-cover" style={posterStyle} />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-4xl font-black text-white/30">{getInitials(game?.name)}</div>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 z-20">
            {shouldUseTitleLogo ? (
              <div className="game-detail-title-logo-wrap">
                <img
                  src={titleLogo}
                  alt={game?.name || "Game logo"}
                  className="game-detail-title-logo-img drop-shadow-2xl"
                  style={titleLogoStyle}
                />
              </div>
            ) : (
              <h1 className="text-4xl lg:text-5xl font-black text-white tracking-tight pt-8 mb-3 drop-shadow-xl flex items-baseline gap-4 leading-none">
                {game?.name || "Unknown game"}
              </h1>
            )}

            {/* Genres */}
            <div className="flex flex-wrap items-center gap-4 mb-3">
              <div className="flex flex-wrap items-center gap-2">
                {genres.length > 0 ? genres.map(g => (
                  <span key={g} className="px-3 py-0.5 bg-[#1a1a1a]/80 hover:bg-[#2a2a2a] transition backdrop-blur-md rounded-full text-xs font-semibold text-gray-200 border border-white/5 shadow-sm">
                    {g}
                  </span>
                )) : (
                  <span className="px-3 py-0.5 bg-[#1a1a1a]/80 backdrop-blur-md rounded-full text-xs font-semibold text-gray-400 border border-white/5 shadow-sm">
                    No Genre
                  </span>
                )}
              </div>
            </div>

            {/* About */}
            <AboutTooltipSection summary={summary} />

            {/* Actions */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handlePlay}
                disabled={!hasExecutable || launching || loading}
                className="game-detail-play-button cursor-pointer"
                title={launching ? "Launching..." : (hasExecutable ? "Play Game" : "Not Installed")}
              >
                <span className="icon">
                  <PlaySolidIcon />
                </span>
                <span className="text">{launching ? "Launching..." : (hasExecutable ? "Play Game" : "Not Installed")}</span>
              </button>

              <button onClick={onEdit} disabled={loading} className="game-detail-action-button btn-edit cursor-pointer" title="Edit Game">
                <span className="icon"><PencilIcon /></span>
                <span className="text">Edit</span>
              </button>
              <button onClick={onDelete} disabled={loading} className="game-detail-action-button btn-delete cursor-pointer" title="Delete Game">
                <span className="icon"><TrashIcon /></span>
                <span className="text">Delete</span>
              </button>
              <button onClick={handleRefresh} disabled={refreshing || loading} className={`game-detail-action-button btn-refresh cursor-pointer`} title="Refresh Metadata">
                <span className={`icon ${refreshing ? "animate-spin" : ""}`}><RefreshIcon /></span>
                <span className="text">{refreshing ? "Syncing..." : "Sync"}</span>
              </button>
              <button onClick={handleToggleFavorite} disabled={loading} className={`game-detail-action-button btn-favorite cursor-pointer ${isFavorite ? "is-favorite" : ""}`} title="Toggle Favorite">
                <span className="icon"><StarIcon fill={isFavorite ? "currentColor" : "none"} /></span>
                <span className="text">{isFavorite ? "Favorited" : "Favorite"}</span>
              </button>
              <GameDetailStatusDropdown
                currentStatus={game?.completion_status || "Backlog"}
                hasPlaytime={(detail?.total_seconds || 0) > 0 || Boolean(detail?.last_played)}
                onSelectStatus={handleStatusChange}
                disabled={loading}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Content Below Hero */}
      <div className="px-8 mt-8 z-10 space-y-12">
        {/* 1. Information Details Section (2 Columns Grid) */}
        <div className="flex flex-col">
          <div className="flex items-center gap-3 mb-6">
            <MonitorIcon className="w-5 h-5 text-[#558467]" />
            <h2 className="text-xl font-bold text-white tracking-tight">Information</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-0.5 w-full">
            <div className="flex flex-col">
              <DetailRow icon={<TagIcon className="text-purple-400" />} label="Type" value="Game" />
              <DetailRow icon={<CalendarIcon className="text-sky-400" />} label="Release Date" value={String(releaseYear)} />
              <DetailRow icon={<TagIcon className="text-emerald-400" />} label="Genre" value={genres.length ? genres.join(", ") : "-"} />
              <DetailRow icon={<TagIcon className="text-amber-400" />} label="Store" value={storeLabel} />
              <DetailRow icon={<CalendarIcon className="text-indigo-400" />} label="Date Added" value={addedAtLabel || "-"} />
            </div>
            <div className="flex flex-col">
              <DetailRow icon={<MonitorIcon className="text-blue-400" />} label="Platform" value={platforms.length ? platforms : "-"} />
              <DetailRow icon={<UsersIcon className="text-teal-400" />} label="Developer" value={developers.length ? developers : "-"} />
              <DetailRow icon={<UsersIcon className="text-cyan-400" />} label="Publisher" value={publishers.length ? publishers : "-"} />
              <DetailRow icon={<ShieldIcon className="text-rose-400" />} label="Age Rating" value={detail?.age_rating?.label || "-"} imageValue={ageRatingImage} />
              <DetailRow icon={<FolderIcon className="text-amber-500" />} label="Game EXE" value={executablePath} isPath />
            </div>
          </div>
        </div>

        {/* 2. User Rating & Personal Review Section (Below Information) */}
        <UserRatingReviewCard
          gameId={game?.id}
          gameName={game?.name}
          initialRating={detail?.user_rating ?? game?.user_rating}
          initialReview={detail?.user_review ?? game?.user_review}
          onUpdated={reloadLocalData}
        />

        {/* 3. Activity Summary Section (Below Review & Rating) */}
        <div className="flex flex-col">
          <div className="flex items-center gap-3 mb-6">
            <ClockIcon className="w-5 h-5 text-[#558467]" />
            <h2 className="text-xl font-bold text-white tracking-tight">Activity</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 w-full">
            <ActivityStatCard
              icon={<StopwatchIcon />}
              iconColor="text-emerald-400"
              title="TOTAL PLAY TIME"
              value={renderPlayTimeFormatted(game?.total_seconds || 0)}
              caption="Across all sessions"
            />
            <ActivityStatCard
              icon={<CalendarIcon />}
              iconColor="text-sky-400"
              title="LAST PLAYED"
              value={lastPlayedTimestamp ? lastPlayedLabel : "Not played yet"}
              caption={lastPlayedRelative}
              captionIcon={lastPlayedTimestamp ? <ClockIcon /> : null}
            />
            <ActivityStatCard
              icon={<TrophyIcon />}
              iconColor="text-amber-400"
              title="ACHIEVEMENTS"
              value="-"
              caption="Not available"
            />
            <ActivityStatCard
              icon={<GamepadOutlineIcon />}
              iconColor="text-purple-400"
              title="SESSIONS"
              value={String(sessionsCount)}
              caption={detail?.executable_count ? `${detail.executable_count} executable linked` : "No executable linked"}
              isPurpleDot={Boolean(detail?.executable_count)}
            />
          </div>
        </div>

        <section className="game-detail-session-panel">
          <div className="game-detail-session-toolbar">
            <label className="game-detail-session-year">
              <SessionYearSelect
                options={availableSessionYears}
                value={selectedSessionYear}
                onChange={setSelectedSessionYear}
              />
            </label>

            <div className="game-detail-session-total">
              <span>Total Play Time:</span>
              <strong>{formatDurationLong(selectedYearSessions?.totalSeconds || 0)}</strong>
            </div>

            <button
              type="button"
              className="game-detail-session-export"
              onClick={handleExportSessions}
              disabled={!selectedYearSessions?.sessions?.length}
            >
              <ExportIcon />
              <span>Export</span>
            </button>
          </div>

          {!selectedYearSessions?.months?.length ? (
            <div className="game-detail-session-empty">
              <strong>No play sessions recorded yet.</strong>
            </div>
          ) : (
            <div className="game-detail-session-year-group">
              {selectedYearSessions.months.map((month) => {
                const isOpen = openSessionMonths.includes(month.key);
                return (
                  <details
                    key={month.key}
                    className="game-detail-session-month"
                    open={isOpen}
                    onToggle={(event) => {
                      const nextOpen = event.currentTarget.open;
                      const currentlyOpen = openSessionMonths.includes(month.key);
                      if (nextOpen !== currentlyOpen) {
                        handleSessionMonthToggle(month.key);
                      }
                    }}
                  >
                    <summary className="game-detail-session-month-summary">
                      <span className="game-detail-session-month-main">
                        <strong>{month.label}</strong>
                        <span>{month.sessions.length} sessions • {formatDurationLong(month.totalSeconds)}</span>
                      </span>
                      <i className="game-detail-session-month-toggle"><ChevronDownIcon /></i>
                    </summary>

                    <div className="game-detail-session-month-body">
                      <div className="game-detail-session-table-wrap">
                        <table className="game-detail-session-table">
                          <thead>
                            <tr>
                              <th className="game-detail-session-head-date">Date</th>
                              <th className="game-detail-session-head-range">Session</th>
                              <th className="game-detail-session-head-duration">Duration</th>
                              <th className="game-detail-session-head-note">Note</th>
                              <th className="game-detail-session-head-total">Playtime</th>
                            </tr>
                          </thead>
                          {month.days.map((day) => (
                            <tbody key={day.key} className="game-detail-session-day-group">
                              {day.sessions.map((session, index) => (
                                <tr key={`${day.key}-${session.started_at}-${index}`} className="game-detail-session-row group">
                                  {index === 0 ? (
                                    <td className="game-detail-session-date" rowSpan={day.sessions.length}>
                                      {day.label}
                                    </td>
                                  ) : null}
                                  <td className="game-detail-session-range">
                                    <div className="game-detail-session-range-main flex items-center gap-2 flex-wrap">
                                      <SessionConnectorTooltipAnchor session={session}>
                                        {session.is_split && session.split_index === 1 && (
                                          <span className="absolute top-1/2 left-1/2 -translate-x-1/2 w-[3px] h-[32px] bg-gradient-to-b from-[#8077ff] to-[#8077ff]/30 z-10 group-hover/line:bg-[#a39cff] transition-all pointer-events-none" />
                                        )}
                                        {session.is_split && session.split_index === 0 && (
                                          <span className="absolute bottom-1/2 left-1/2 -translate-x-1/2 w-[3px] h-[32px] bg-gradient-to-t from-[#8077ff] to-[#8077ff]/30 z-10 group-hover/line:bg-[#a39cff] transition-all pointer-events-none" />
                                        )}
                                        <span className="game-detail-session-dot relative z-20" />
                                      </SessionConnectorTooltipAnchor>

                                      <span>{formatSessionClock(session.started_at)} - {session.ended_at ? formatSessionClock(session.ended_at) : "Now"}</span>

                                      {session.is_active ? <em>Active</em> : null}
                                    </div>
                                  </td>
                                  <td className="game-detail-session-duration">
                                    <div className="flex items-center gap-1.5">
                                      <ClockIcon />
                                      <span>{formatDurationDetailed(session.duration_seconds || 0)}</span>
                                    </div>
                                  </td>
                                  <td className="game-detail-session-note">
                                    {session.note ? (
                                      <SessionNoteTooltipAnchor
                                        note={session.note}
                                        onClick={() => setActiveJournalSession(session)}
                                      >
                                        <span className="truncate block max-w-full">{session.note}</span>
                                      </SessionNoteTooltipAnchor>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => setActiveJournalSession(session)}
                                        className="hidden group-hover:inline-flex session-note-btn session-note-btn-add"
                                      >
                                        + Note
                                      </button>
                                    )}
                                  </td>
                                  {index === 0 ? (
                                    <td className="game-detail-session-total-cell" rowSpan={day.sessions.length}>
                                      <div className="flex items-center gap-1.5">
                                        <ClockIcon />
                                        <strong>{formatDurationDetailed(day.totalSeconds)}</strong>
                                      </div>
                                    </td>
                                  ) : null}
                                </tr>
                              ))}
                            </tbody>
                          ))}
                        </table>
                      </div>
                    </div>
                  </details>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* Post Session Journal Modal for editing session notes */}
      {activeJournalSession && (
        <PostSessionJournalModal
          isOpen={Boolean(activeJournalSession)}
          onClose={() => setActiveJournalSession(null)}
          session={activeJournalSession}
          game={{
            id: game?.id || detail?.id || gameId,
            name: game?.name || detail?.name || "Game",
            user_rating: detail?.user_rating ?? game?.user_rating,
            user_review: detail?.user_review ?? game?.user_review,
          }}
          onSaved={reloadLocalData}
        />
      )}
    </div>
  );
}

function DetailRow({ icon, label, value, imageValue, isPath }) {
  const items = Array.isArray(value)
    ? value
    : (typeof value === "string" && value.includes(",") ? value.split(",").map((s) => s.trim()).filter(Boolean) : null);

  return (
    <div className="flex items-start justify-between py-1.5 border-b border-white/[0.03] group hover:bg-white/[0.01] px-2 -mx-2 transition-colors rounded-lg gap-4">
      <div className="flex items-center gap-3 text-sm font-medium text-gray-400 pt-0.5 shrink-0">
        <span className="w-4 flex justify-center shrink-0">{icon}</span>
        <span>{label}</span>
      </div>
      <div className="text-sm font-bold text-white max-w-[65%] text-right">
        {imageValue ? (
          <img src={imageValue} alt={String(value)} className="h-8 object-contain ml-auto" />
        ) : items && items.length > 1 ? (
          <div className="flex flex-col items-end gap-1">
            {items.map((item, idx) => (
              <span key={idx} className="block whitespace-normal break-words text-right">{item}</span>
            ))}
          </div>
        ) : (
          <span className={isPath ? "font-mono text-xs text-gray-400 break-all whitespace-normal block text-right" : "block whitespace-normal break-words text-right"}>
            {Array.isArray(value) ? (value[0] || "-") : value}
          </span>
        )}
      </div>
    </div>
  );
}

function renderPlayTimeFormatted(totalSeconds) {
  const formatted = formatDurationLong(totalSeconds || 0);
  const regex = /(\d+(?:[.,]\d+)?)\s*([a-zA-Z]+)/g;
  const matches = [...formatted.matchAll(regex)];

  if (!matches.length) {
    return (
      <div className="flex items-baseline">
        <span className="text-xl lg:text-2xl font-black text-[#8d88ff]">0</span>
        <span className="text-xs font-bold text-[#b8b5ff] ml-0.5">m</span>
      </div>
    );
  }

  return (
    <div className="flex items-baseline gap-0.5">
      {matches.map((match, idx) => {
        const val = match[1];
        const unit = match[2];
        const isLast = idx === matches.length - 1;
        return (
          <React.Fragment key={idx}>
            <span className="text-xl lg:text-2xl font-black text-[#8d88ff]">{val}</span>
            <span className={`text-xs font-bold text-[#b8b5ff]${!isLast ? " mr-1" : ""}`}>{unit}</span>
          </React.Fragment>
        );
      })}
    </div>
  );
}

function ActivityStatCard({ icon, iconColor, title, value, caption, captionIcon, isPurpleDot }) {
  return (
    <div className="bg-[#161616] hover:bg-[#1f1f1f] transition-colors rounded-xl p-3.5 shadow-md flex flex-col justify-between min-h-[105px]">
      <div className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-wider mb-1">
        <span className={`w-4 h-4 flex items-center justify-center shrink-0 ${iconColor || "text-[#d6c596]"}`}>{icon}</span>
        <span className="truncate text-gray-400">{title}</span>
      </div>

      <div className="my-auto py-0.5">
        {typeof value === "string" || typeof value === "number" ? (
          <div className="text-xl lg:text-2xl font-black text-white tracking-tight leading-snug break-words">
            {value}
          </div>
        ) : (
          value
        )}
      </div>

      <div className="mt-1 flex items-center gap-1.5 text-xs font-semibold min-h-[18px]">
        {isPurpleDot ? (
          <span className="w-2 h-2 rounded-full bg-[#8d88ff] shrink-0" />
        ) : captionIcon ? (
          <span className="w-3.5 h-3.5 text-[#8d88ff] shrink-0 flex items-center justify-center">{captionIcon}</span>
        ) : null}
        <span className="text-gray-400 opacity-80 truncate">
          {caption}
        </span>
      </div>
    </div>
  );
}

function DetailStat({ icon, label, value, caption, progress = 0, tone = "", accent = false }) {
  return (
    <article className={`game-detail-stat${accent ? " is-accent" : ""}`}>
      <div className={`game-detail-stat-icon${tone ? ` tone-${tone}` : ""}`} aria-hidden="true">{icon}</div>
      <div className="game-detail-stat-copy">
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{caption}</small>
        {progress > 0 ? (
          <div className="game-detail-stat-progress">
            <i style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} />
          </div>
        ) : null}
      </div>
    </article>
  );
}

function normalizePlatformItems(items) {
  const seen = new Set();
  return (Array.isArray(items) ? items : [])
    .map((item) => normalizePlatformLabel(item))
    .filter((item) => item && !seen.has(item.toLowerCase()) && seen.add(item.toLowerCase()));
}

function normalizeTextItems(items) {
  const seen = new Set();
  return (Array.isArray(items) ? items : [])
    .map((item) => String(item || "").trim())
    .filter((item) => item && item !== "-" && !seen.has(item.toLowerCase()) && seen.add(item.toLowerCase()));
}

function normalizePlatformLabel(value) {
  const label = String(value || "").trim();
  if (!label) {
    return "";
  }
  const lower = label.toLowerCase();
  if (lower === "pc" || lower === "windows" || lower.includes("microsoft windows") || lower.startsWith("pc (")) {
    return "Windows";
  }
  if (
    lower === "xsx|s" ||
    lower === "xsx" ||
    lower === "xss" ||
    lower.includes("xbox series")
  ) {
    return "Xbox Series X|S";
  }
  if (lower === "xone" || lower === "xbone" || lower.includes("xbox one")) {
    return "Xbox One";
  }
  if (lower === "x360" || lower === "xb360" || lower.includes("xbox 360")) {
    return "Xbox 360";
  }
  if (lower === "xbox") {
    return "Xbox";
  }
  return label;
}

function formatGameStoreLabel(value) {
  const label = String(value || "").trim();
  if (!label) {
    return "-";
  }

  const normalized = label.toLowerCase().replace(/\s+/g, " ").trim();
  if (
    normalized === "non-store"
    || normalized === "non store"
    || normalized === "manual"
    || normalized === "pc"
  ) {
    return "-";
  }

  return label;
}

function formatDateLabel(timestamp) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(Number(timestamp) * 1000));
}

function formatLastPlayedBadgeDate(timestamp) {
  if (!timestamp) return "Not played yet";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(Number(timestamp) * 1000));
}

function formatAddedDateLabel(timestamp) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(Number(timestamp) * 1000));
}

function formatRelativePlayed(timestamp) {
  const diffDays = Math.max(0, Math.floor((Date.now() - Number(timestamp) * 1000) / 86400000));
  if (diffDays === 0) {
    return "Today";
  }
  if (diffDays === 1) {
    return "1 day ago";
  }
  if (diffDays < 30) {
    return `${diffDays} days ago`;
  }
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) {
    return `${diffMonths} month${diffMonths === 1 ? "" : "s"} ago`;
  }
  const diffYears = Math.floor(diffMonths / 12);
  return `${diffYears} year${diffYears === 1 ? "" : "s"} ago`;
}

function getAgeRatingImage(label, imageUrl) {
  if (imageUrl) {
    return toAssetUrl(imageUrl);
  }

  const match = String(label || "").match(/PEGI\s*(3|7|12|16|18)/i);
  if (!match) {
    return "";
  }

  return new URL(`../../src/picture/PEGI_${match[1]}.svg`, import.meta.url).href;
}

function splitGameSessions(items) {
  return (Array.isArray(items) ? items : []).flatMap((session) => splitSessionAcrossDays(session));
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
    const segmentDuration = Math.min(remaining, Math.max(0, segmentEnd - currentStart));
    if (segmentDuration <= 0) {
      break;
    }

    const reachesAnotherDay = segmentEnd < effectiveEnd;
    segments.push({
      id: session?.id,
      note: session?.note || null,
      started_at: currentStart,
      ended_at: currentStart + segmentDuration,
      duration_seconds: segmentDuration,
      raw_started_at: start,
      raw_ended_at: effectiveEnd,
      is_active: Boolean(session?.is_active) && segmentEnd >= effectiveEnd,
      range_start_label: formatSessionClock(currentStart),
      range_end_label: reachesAnotherDay ? "23.59" : formatSessionClock(currentStart + segmentDuration),
    });

    currentStart = segmentEnd;
    remaining -= segmentDuration;
  }

  const isSplit = segments.length > 1;
  return segments.map((seg, index) => ({
    ...seg,
    is_split: isSplit,
    split_index: index,
    split_total: segments.length,
    raw_started_at: start,
    raw_ended_at: effectiveEnd,
    raw_duration_seconds: totalDuration,
  }));
}

function isCrossMidnightSession(session) {
  if (!session) return false;
  const startTs = Number(session.raw_started_at || session.started_at || 0);
  const endTs = Number(session.raw_ended_at || session.ended_at || 0);
  if (startTs <= 0 || endTs <= 0 || endTs <= startTs) return false;

  const startDate = new Date(startTs * 1000).toDateString();
  const endDate = new Date(endTs * 1000).toDateString();
  return startDate !== endDate;
}

function localMidnightTimestamp(timestamp) {
  const date = new Date(timestamp * 1000);
  date.setHours(0, 0, 0, 0);
  return Math.floor(date.getTime() / 1000);
}

function buildSessionYearGroups(sessions) {
  const years = new Map();
  const sortedSessions = [...sessions].sort((left, right) => Number(right.started_at || 0) - Number(left.started_at || 0));

  sortedSessions.forEach((session) => {
    const date = new Date(Number(session.started_at || 0) * 1000);
    const yearKey = String(date.getFullYear());
    const monthKey = `${yearKey}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const dayKey = `${monthKey}-${String(date.getDate()).padStart(2, "0")}`;

    if (!years.has(yearKey)) {
      years.set(yearKey, { year: yearKey, totalSeconds: 0, sessions: [], months: new Map() });
    }

    const yearBucket = years.get(yearKey);
    yearBucket.totalSeconds += Number(session.duration_seconds || 0);
    yearBucket.sessions.push(session);

    if (!yearBucket.months.has(monthKey)) {
      yearBucket.months.set(monthKey, { key: monthKey, label: formatSessionMonth(session.started_at), totalSeconds: 0, sessions: [], days: new Map() });
    }

    const monthBucket = yearBucket.months.get(monthKey);
    monthBucket.totalSeconds += Number(session.duration_seconds || 0);
    monthBucket.sessions.push(session);

    if (!monthBucket.days.has(dayKey)) {
      monthBucket.days.set(dayKey, { key: dayKey, label: formatSessionDay(session.started_at), totalSeconds: 0, sessions: [] });
    }

    const dayBucket = monthBucket.days.get(dayKey);
    dayBucket.totalSeconds += Number(session.duration_seconds || 0);
    dayBucket.sessions.push(session);
  });

  return [...years.values()]
    .sort((left, right) => Number(right.year) - Number(left.year))
    .map((yearGroup) => ({
      year: yearGroup.year,
      totalSeconds: yearGroup.totalSeconds,
      sessions: yearGroup.sessions,
      months: [...yearGroup.months.values()]
        .sort((left, right) => right.key.localeCompare(left.key))
        .map((monthGroup) => ({
          ...monthGroup,
          days: [...monthGroup.days.values()]
            .sort((left, right) => right.key.localeCompare(left.key))
            .map((dayGroup) => ({
              ...dayGroup,
              sessions: [...dayGroup.sessions].sort((left, right) => Number(right.started_at || 0) - Number(left.started_at || 0)),
            })),
        })),
    }));
}

function formatSessionMonth(timestamp) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(new Date(Number(timestamp) * 1000));
}

function formatSessionDay(timestamp) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(Number(timestamp) * 1000));
}

function formatSessionClock(timestamp) {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(Number(timestamp) * 1000)).replace(":", ".");
}

function csvCell(value) {
  const text = String(value ?? "");
  return `"${text.replaceAll("\"", "\"\"")}"`;
}

function slugifyFilePart(value) {
  return String(value || "game")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "game";
}

function SessionYearSelect({ options, value, onChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef(null);
  const activeLabel = value || options[0] || "No data";

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
    <div ref={rootRef} className={`game-detail-session-year-select${isOpen ? " is-open" : ""}`}>
      <button
        type="button"
        className="game-detail-session-year-trigger"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => options.length && setIsOpen((current) => !current)}
        disabled={!options.length}
      >
        <strong>{activeLabel}</strong>
        <ChevronDownIcon />
      </button>

      {isOpen ? (
        <div className="game-detail-session-year-panel">
          <div className="game-detail-session-year-option-list" role="listbox" aria-label="Filter play sessions by year">
            {options.map((option) => (
              <button
                key={option}
                type="button"
                role="option"
                aria-selected={value === option}
                className={`game-detail-session-year-option${value === option ? " is-selected" : ""}`}
                onClick={() => {
                  onChange(option);
                  setIsOpen(false);
                }}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function getStatusBadgeClass(status) {
  switch (status) {
    case "In Progress":
      return "status-badge-in-progress";
    case "Completed":
      return "status-badge-completed";
    case "100% Mastered":
      return "status-badge-mastered";
    case "Dropped":
      return "status-badge-dropped";
    default:
      return "status-badge-backlog";
  }
}

function GameDetailStatusDropdown({ currentStatus, hasPlaytime, onSelectStatus, disabled }) {
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

  const isBacklogAvailable = currentStatus === "Backlog" && !hasPlaytime;
  const options = isBacklogAvailable
    ? ["Backlog", "In Progress", "Completed", "100% Mastered", "Dropped"]
    : ["In Progress", "Completed", "100% Mastered", "Dropped"];

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((current) => !current)}
        className={`game-detail-status-pill cursor-pointer transition-all flex items-center gap-2 px-4 rounded-full text-xs font-bold shadow-md border-0 ${getStatusBadgeClass(currentStatus)}`}
        title="Change completion status"
      >
        <StatusIcon status={currentStatus} className="w-4 h-4 shrink-0" />
        <span className="font-bold text-xs leading-none whitespace-nowrap text-white">{currentStatus}</span>
        <ChevronDownIcon className="w-3.5 h-3.5 opacity-70 shrink-0 ml-0.5" />
      </button>

      {isOpen ? (
        <div className="status-dropdown-panel">
          {options.map((option) => {
            const isSelected = option === currentStatus;
            return (
              <button
                key={option}
                type="button"
                data-status={option}
                className={`status-dropdown-item${isSelected ? " is-selected" : ""}`}
                onClick={() => {
                  onSelectStatus(option);
                  setIsOpen(false);
                }}
              >
                <StatusIcon status={option} className="w-3.5 h-3.5 shrink-0" />
                <span>{option}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}


