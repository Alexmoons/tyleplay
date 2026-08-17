import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  buildPosterPresentationStyle,
  formatDurationLong,
  getInitials,
  resolveBackdropMedia,
  resolveCoverMedia,
  resolveGenericMedia,
  resolveSteamLibraryHeaderMediaCandidates,
} from "../lib/game-helpers";
import { MoreIcon, PencilIcon, PlayIcon, StarIcon, StatusIcon, TrashIcon } from "./icons";

function GameCardMoreMenuPortal({ isOpen, buttonRef, onClose, onEdit, onDelete }) {
  const [coords, setCoords] = useState(null);

  useEffect(() => {
    if (!isOpen || !buttonRef?.current) {
      setCoords(null);
      return;
    }

    function updateCoords() {
      if (!buttonRef?.current) return;
      const rect = buttonRef.current.getBoundingClientRect();
      const menuWidth = 132;
      const menuHeight = 68;

      let left = Math.max(10, rect.right - menuWidth);
      let top = rect.bottom + 4;

      if (top + menuHeight > window.innerHeight - 10) {
        top = Math.max(10, rect.top - menuHeight - 4);
      }

      setCoords({ left, top });
    }

    updateCoords();
    window.addEventListener("scroll", updateCoords, true);
    window.addEventListener("resize", updateCoords);
    return () => {
      window.removeEventListener("scroll", updateCoords, true);
      window.removeEventListener("resize", updateCoords);
    };
  }, [isOpen, buttonRef]);

  if (!isOpen || !coords || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed z-[99999] min-w-[132px] w-max p-1.5 rounded-[14px] bg-[#161616] border-0 shadow-2xl flex flex-col gap-1 pointer-events-auto"
      style={{
        left: `${coords.left}px`,
        top: `${coords.top}px`,
      }}
      role="menu"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        role="menuitem"
        className="game-card-menu-item"
        onClick={(event) => {
          event.stopPropagation();
          onClose();
          onEdit?.();
        }}
      >
        <PencilIcon />
        <span>Edit Info</span>
      </button>
      <button
        type="button"
        role="menuitem"
        className="game-card-menu-item is-danger"
        onClick={async (event) => {
          event.stopPropagation();
          onClose();
          await onDelete?.();
        }}
      >
        <TrashIcon />
        <span>Delete Game</span>
      </button>
    </div>,
    document.body
  );
}

export default function LibraryGameCard({
  game,
  viewMode = "poster",
  steamHeaderUrl = "",
  onOpen,
  onEdit,
  onDelete,
  onToggleFavorite,
  onUpdateStatus,
}) {
  const media = resolveCoverMedia(game.cover_url) || resolveBackdropMedia(game.backdrop_url);
  const posterStyle = buildPosterPresentationStyle(game.cover_position_x, game.cover_position_y, game.cover_zoom);
  const storeBadgeLabel = formatStoreBadgeLabel(game.store);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const rootRef = useRef(null);
  const buttonRef = useRef(null);

  useEffect(() => {
    function handlePointerDown(event) {
      if (!rootRef.current?.contains(event.target) && !buttonRef.current?.contains(event.target)) {
        setIsMenuOpen(false);
      }
    }

    function handleEscape(event) {
      if (event.key === "Escape") {
        setIsMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  const isFavorite = Boolean(game?.isFavorite ?? game?.is_favorite);

  if (viewMode === "list") {
    return (
      <RowLibraryGameCard
        game={game}
        steamHeaderUrl={steamHeaderUrl}
        storeBadgeLabel={storeBadgeLabel}
        isMenuOpen={isMenuOpen}
        onOpen={onOpen}
        onEdit={onEdit}
        onDelete={onDelete}
        onToggleFavorite={onToggleFavorite}
        onUpdateStatus={onUpdateStatus}
        rootRef={rootRef}
        setIsMenuOpen={setIsMenuOpen}
      />
    );
  }

  return (
    <article ref={rootRef} className="relative group w-full bg-[#141414] rounded-xl overflow-hidden border-0 transition-all duration-300">
      <div className="relative aspect-[2/3] overflow-hidden bg-[#1e1e1e] cursor-pointer"
        role="button"
        tabIndex={0}
        aria-label={`Open ${game.name} details`}
        onClick={onOpen}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onOpen?.();
          }
        }}
      >
        {media ? (
          <img 
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
            src={media} 
            alt={game.name} 
            style={posterStyle} 
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-3xl font-black text-white/20 uppercase tracking-tighter">
            {getInitials(game.name)}
          </div>
        )}
        
        {/* Overlay Gradients */}
        <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/95 via-black/70 to-transparent opacity-100 pointer-events-none transition-opacity duration-300" />
        
        {/* Top Badges */}
        <div className="absolute top-2 w-full px-2 flex justify-between items-start z-10">
          {storeBadgeLabel ? (
            <div className="flex items-center gap-1.5">
              <span className="bg-black/60 backdrop-blur-md text-white text-[10px] font-bold px-1.5 py-0.5 rounded border border-white/10 shadow-sm">
                {storeBadgeLabel}
              </span>
            </div>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-1.5">
            <CardStatusDropdown
              gameId={game.id}
              currentStatus={game?.completion_status || "Backlog"}
              hasPlaytime={(game?.total_seconds || 0) > 0 || Boolean(game?.last_played)}
              onUpdateStatus={onUpdateStatus}
            />

            <button
              type="button"
              className={`p-1.5 rounded-full backdrop-blur-md border border-white/10 transition-all cursor-pointer ${
                isFavorite 
                  ? "bg-[#7068ff]/90 text-white" 
                  : "bg-black/40 text-white/70 hover:bg-black/70 hover:text-white"
              }`}
              onClick={(event) => {
                event.stopPropagation();
                event.preventDefault();
                onToggleFavorite?.(!isFavorite);
              }}
              title={isFavorite ? "Remove from favorites" : "Add to favorites"}
            >
              <StarIcon className={`w-3.5 h-3.5 ${isFavorite ? "fill-amber-400 text-amber-400" : ""}`} />
            </button>
          </div>
        </div>
        
        {/* Bottom Content within Image */}
        <div className="absolute bottom-0 w-full px-3.5 pt-3 pb-3.5 transform translate-y-0.5 group-hover:translate-y-0 transition-transform duration-300">
          <h3 className="font-bold text-sm text-white leading-tight mb-0.5 line-clamp-2 drop-shadow-[0_2px_4px_rgba(0,0,0,0.95)]">
            {game.name}
          </h3>
          <div className="flex items-center justify-between min-h-[18px]">
            <span className="flex items-center gap-1.5 text-[12.5px] font-semibold text-[#c3d7d2] leading-none drop-shadow-[0_2px_4px_rgba(0,0,0,0.95)]">
              <PlayIcon className="w-3.5 h-3.5 text-emerald-400 fill-emerald-400 shrink-0" />
              <span>{formatDurationLong(game.total_seconds || 0)}</span>
            </span>
            <button
              ref={buttonRef}
              type="button"
              className="p-0.5 text-[#c3d7d2] hover:text-white transition-colors drop-shadow-[0_2px_4px_rgba(0,0,0,0.95)] cursor-pointer"
              onClick={(event) => {
                event.stopPropagation();
                event.preventDefault();
                setIsMenuOpen((current) => !current);
              }}
            >
              <MoreIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      <GameCardMoreMenuPortal
        isOpen={isMenuOpen}
        buttonRef={buttonRef}
        onClose={() => setIsMenuOpen(false)}
        onEdit={onEdit}
        onDelete={onDelete}
      />
    </article>
  );
}

function RowLibraryGameCard({
  game,
  steamHeaderUrl = "",
  storeBadgeLabel,
  isMenuOpen,
  onOpen,
  onEdit,
  onDelete,
  onToggleFavorite,
  onUpdateStatus,
  rootRef,
  setIsMenuOpen,
}) {
  const mediaCandidates = buildRowMediaCandidates(game, steamHeaderUrl);
  const [sourceIndex, setSourceIndex] = useState(0);
  const currentMedia = mediaCandidates[sourceIndex] || "";
  const lastPlayed = formatLastPlayed(game.finished_last_played || game.last_played);
  const buttonRef = useRef(null);

  useEffect(() => {
    setSourceIndex(0);
  }, [game.id, mediaCandidates.join("|")]);

  const isFavorite = Boolean(game?.isFavorite ?? game?.is_favorite);

  return (
    <article
      ref={rootRef}
      className={`game-card game-card-list${isMenuOpen ? " is-menu-open" : ""}`}
    >
      <div
        className="game-card-hitarea game-card-hitarea-list cursor-pointer"
        role="button"
        tabIndex={0}
        aria-label={`Open ${game.name} details`}
        onClick={onOpen}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onOpen?.();
          }
        }}
      >
        <div className="game-row-media">
          {currentMedia ? (
            <img
              className="game-row-poster"
              src={currentMedia}
              alt={game.name}
              loading="lazy"
              onError={() => {
                setSourceIndex((current) => (current < mediaCandidates.length ? current + 1 : current));
              }}
            />
          ) : (
            <div className="game-row-poster game-row-poster-fallback">{getInitials(game.name)}</div>
          )}
          {storeBadgeLabel ? <span className="game-store-badge game-store-badge-list">{storeBadgeLabel}</span> : null}
        </div>

        <div className="game-row-body">
          <div className="game-row-head">
            <h3>{game.name}</h3>
            <div className="game-row-actions">
              <CardStatusDropdown
                gameId={game.id}
                currentStatus={game?.completion_status || "Backlog"}
                hasPlaytime={(game?.total_seconds || 0) > 0 || Boolean(game?.last_played)}
                onUpdateStatus={onUpdateStatus}
              />
              <button
                type="button"
                className={`game-favorite game-favorite-list${isFavorite ? " is-active" : ""}`}
                aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
                aria-pressed={isFavorite}
                onClick={(event) => {
                  event.stopPropagation();
                  event.preventDefault();
                  onToggleFavorite?.(!isFavorite);
                }}
              >
                <StarIcon className={isFavorite ? "fill-amber-400 text-amber-400" : ""} />
              </button>
              <button
                ref={buttonRef}
                type="button"
                className="game-more game-more-list cursor-pointer"
                aria-label={`More actions for ${game.name}`}
                aria-haspopup="menu"
                aria-expanded={isMenuOpen}
                onClick={(event) => {
                  event.stopPropagation();
                  event.preventDefault();
                  setIsMenuOpen((current) => !current);
                }}
              >
                <MoreIcon />
              </button>
            </div>
          </div>

          <div className="game-row-stats">
            <div className="game-row-stat">
              <span>Last Played</span>
              <strong>{lastPlayed}</strong>
            </div>
            <div className="game-row-stat">
              <span>Total Played</span>
              <strong>{formatDurationLong(game.total_seconds || 0)}</strong>
            </div>
          </div>
        </div>
      </div>

      <GameCardMoreMenuPortal
        isOpen={isMenuOpen}
        buttonRef={buttonRef}
        onClose={() => setIsMenuOpen(false)}
        onEdit={onEdit}
        onDelete={onDelete}
      />
    </article>
  );
}

function formatStoreBadgeLabel(value) {
  const label = String(value || "").trim();
  if (!label) {
    return "";
  }

  const normalized = label.toLowerCase().replace(/\s+/g, " ").trim();
  switch (normalized) {
    case "non-store":
    case "non store":
    case "manual":
    case "pc":
      return "";
    case "microsoft":
    case "microsoft store":
    case "ms store":
    case "xbox app":
      return "MS Store";
    case "rockstar games launcher":
      return "R* Launcher";
    case "rockstar games":
    case "rockstar":
      return "Rockstar";
    case "ubisoft connect":
      return "Ubisoft";
    case "epic games":
    case "epic games store":
      return "Epic";
    case "ea app":
    case "origin":
    case "ea":
      return "EA";
    default:
      return label;
  }
}

function buildRowMediaCandidates(game, steamHeaderUrl = "") {
  const headers = resolveSteamLibraryHeaderMediaCandidates(
    steamHeaderUrl,
    game?.steam_appid,
    game?.backdrop_url,
    game?.cover_url
  );
  const explicitHeader = resolveExplicitRowHeader(steamHeaderUrl);
  const backdrop = resolveBackdropMedia(game?.backdrop_url);
  const coverBackdrop = resolveBackdropMedia(game?.cover_url);
  const cover = resolveCoverMedia(game?.cover_url);
  const preferredHeaders = [explicitHeader, ...headers].filter(Boolean);
  const stableVisuals = [backdrop, coverBackdrop, cover].filter(Boolean);
  return [...new Set([...preferredHeaders, ...stableVisuals])];
}

function resolveExplicitRowHeader(value) {
  const source = String(value || "").trim();
  if (!source) {
    return "";
  }

  const normalized = source.replace(/\\/g, "/");
  const isRemoteSteamAsset = /steamstatic\.com\/store_item_assets\/steam\/apps\//i.test(normalized);
  const hasImageExtension = /\.[a-z0-9]{2,6}(?:\?.*)?$/i.test(normalized);
  if (isRemoteSteamAsset && !hasImageExtension) {
    return "";
  }

  return resolveGenericMedia(source);
}

function formatLastPlayed(timestamp) {
  const value = Number(timestamp || 0);
  if (value <= 0) {
    return "Never";
  }

  const diffSeconds = Math.max(0, Math.floor(Date.now() / 1000) - value);
  const diffDays = Math.floor(diffSeconds / 86400);
  if (diffDays <= 0) {
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

function getStatusIconBgClass(status) {
  switch (status) {
    case "In Progress":
      return "status-icon-btn-in-progress";
    case "Completed":
      return "status-icon-btn-completed";
    case "100% Mastered":
      return "status-icon-btn-mastered";
    case "Dropped":
      return "status-icon-btn-dropped";
    case "Backlog":
    default:
      return "status-icon-btn-backlog";
  }
}

function CardStatusDropdown({ gameId, currentStatus, hasPlaytime, onUpdateStatus }) {
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState(null);
  const buttonRef = useRef(null);
  const panelRef = useRef(null);

  useEffect(() => {
    if (!isOpen || !buttonRef?.current) {
      setCoords(null);
      return;
    }

    function updateCoords() {
      if (!buttonRef?.current) return;
      const rect = buttonRef.current.getBoundingClientRect();
      const menuWidth = 140;
      const menuHeight = 165;

      let left = Math.max(10, rect.right - menuWidth);
      let top = rect.bottom + 4;

      if (top + menuHeight > window.innerHeight - 10) {
        top = Math.max(10, rect.top - menuHeight - 4);
      }

      setCoords({ left, top });
    }

    updateCoords();
    window.addEventListener("scroll", updateCoords, true);
    window.addEventListener("resize", updateCoords);
    return () => {
      window.removeEventListener("scroll", updateCoords, true);
      window.removeEventListener("resize", updateCoords);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    function handlePointerDown(event) {
      if (
        buttonRef.current &&
        !buttonRef.current.contains(event.target) &&
        panelRef.current &&
        !panelRef.current.contains(event.target)
      ) {
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
  }, [isOpen]);

  const isBacklogAvailable = currentStatus === "Backlog" && !hasPlaytime;
  const options = isBacklogAvailable
    ? ["Backlog", "In Progress", "Completed", "100% Mastered", "Dropped"]
    : ["In Progress", "Completed", "100% Mastered", "Dropped"];

  async function handleSelect(event, option) {
    event.stopPropagation();
    event.preventDefault();
    setIsOpen(false);
    if (option === currentStatus) return;
    await onUpdateStatus?.(gameId, option);
  }

  return (
    <div className="relative inline-block">
      <button
        ref={buttonRef}
        type="button"
        className={`status-icon-btn ${getStatusIconBgClass(currentStatus)}`}
        title={`Status: ${currentStatus || "Backlog"} (Click to change)`}
        onClick={(event) => {
          event.stopPropagation();
          event.preventDefault();
          setIsOpen((current) => !current);
        }}
      >
        <StatusIcon status={currentStatus || "Backlog"} className="w-3.5 h-3.5" />
      </button>

      {isOpen && coords && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={panelRef}
              className="card-status-dropdown-panel is-portal fixed z-[99999] pointer-events-auto"
              style={{
                left: `${coords.left}px`,
                top: `${coords.top}px`,
              }}
              onClick={(event) => {
                event.stopPropagation();
              }}
            >
              {options.map((option) => {
                const isSelected = option === currentStatus;
                return (
                  <button
                    key={option}
                    type="button"
                    data-status={option}
                    className={`card-status-dropdown-item${isSelected ? " is-selected" : ""}`}
                    onClick={(event) => handleSelect(event, option)}
                  >
                    <StatusIcon status={option} className="w-3.2 h-3.2 shrink-0" />
                    <span>{option}</span>
                  </button>
                );
              })}
            </div>,
            document.body
          )
        : null}
    </div>
  );
}


