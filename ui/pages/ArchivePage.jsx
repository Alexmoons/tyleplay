import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  BookmarkIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  FolderIcon,
  SearchIcon,
  ShieldIcon,
  TrashIcon,
  UsersIcon,
} from "../components/icons";
import LoadingIndicator from "../components/LoadingIndicator";
import { buildPaginationItems, buildRangeLabel, formatDurationLong, getInitials, preventPagerFocus } from "../lib/game-helpers";
import { invoke, toAssetUrl } from "../lib/tauri";

const ARCHIVE_SOURCE_OPTIONS = [
  { value: "all", label: "All sources" },
  { value: "igdb", label: "Metadata linked" },
  { value: "manual", label: "Manual only" },
];
const ARCHIVE_PAGE_SIZE = 10;
const ARCHIVE_RETENTION_DAYS = 90;

function formatArchivedDate(value) {
  if (!value) {
    return "Unknown date";
  }

  try {
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(new Date(Number(value) * 1000));
  } catch {
    return "Unknown date";
  }
}

function truncateExeBadgeText(value, maxLength = 58) {
  const text = String(value || "");
  if (text.length <= maxLength) {
    return text;
  }

  return `...${text.slice(-(maxLength - 3))}`;
}

function formatArchiveExpiry(value) {
  const archivedAt = Number(value || 0);
  if (!archivedAt) {
    return `Auto delete in ${ARCHIVE_RETENTION_DAYS} days`;
  }

  const daysElapsed = Math.floor((Date.now() - archivedAt * 1000) / 86400000);
  const daysLeft = Math.max(0, ARCHIVE_RETENTION_DAYS - daysElapsed);
  if (daysLeft <= 0) {
    return "Auto delete today";
  }
  if (daysLeft === 1) {
    return "Auto delete in 1 day";
  }
  return `Auto delete in ${daysLeft} days`;
}

function ArchiveTooltipAnchor({ as: Component = "span", className = "", tooltip, children }) {
  const [position, setPosition] = useState(null);
  const delayRef = useRef(null);
  const pendingPositionRef = useRef(null);
  const isVisibleRef = useRef(false);

  function handlePointerMove(event) {
    const nextPosition = {
      x: event.clientX + 12,
      y: event.clientY + 12,
    };
    pendingPositionRef.current = nextPosition;

    if (isVisibleRef.current) {
      setPosition(nextPosition);
      return;
    }

    if (delayRef.current) {
      return;
    }

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

  useEffect(() => () => {
    if (delayRef.current) {
      window.clearTimeout(delayRef.current);
    }
  }, []);

  return (
    <>
      <Component
        className={className}
        onPointerEnter={handlePointerMove}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        onBlur={handlePointerLeave}
      >
        {children}
      </Component>
      {position && tooltip && typeof document !== "undefined"
        ? createPortal(
            <span
              className="archive-tooltip-bubble"
              style={{
                left: `${position.x}px`,
                top: `${position.y}px`,
              }}
            >
              {tooltip}
            </span>,
            document.body
          )
        : null}
    </>
  );
}

export default function ArchivePage({
  archiveGames,
  loading,
  restoringArchiveId,
  deletingArchiveId,
  onRestore,
  onDeletePermanently,
  onNotify,
}) {
  const [query, setQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [selectedGame, setSelectedGame] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [page, setPage] = useState(1);

  function notifyArchive(notice) {
    onNotify?.(notice);
  }

  function notifyArchiveError(title, nextError, tone = "danger") {
    notifyArchive({
      tone,
      title,
      message: nextError?.message || String(nextError),
    });
  }

  const filteredGames = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return archiveGames.filter((game) => {
      if (sourceFilter === "igdb" && !game.has_igdb_link) return false;
      if (sourceFilter === "manual" && game.has_igdb_link) return false;
      if (!normalizedQuery) return true;
      return [game.name, game.store, game.primary_exe_name, game.release_year]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedQuery));
    });
  }, [archiveGames, query, sourceFilter]);

  const totalArchivedSeconds = useMemo(
    () => filteredGames.reduce((sum, game) => sum + Number(game.total_seconds || 0), 0),
    [filteredGames]
  );
  const totalPages = Math.max(1, Math.ceil(filteredGames.length / ARCHIVE_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginationItems = buildPaginationItems(currentPage, totalPages);
  const visibleGames = filteredGames.slice((currentPage - 1) * ARCHIVE_PAGE_SIZE, currentPage * ARCHIVE_PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [query, sourceFilter, archiveGames.length]);

  useEffect(() => {
    if (!selectedGame?.archive_id) {
      setDetail(null);
      setDetailError("");
      setDetailLoading(false);
      return;
    }

    let cancelled = false;
    setDetailLoading(true);
    setDetailError("");

    invoke("get_archived_game_detail", { archiveId: Number(selectedGame.archive_id) })
      .then((nextDetail) => {
        if (!cancelled) {
          setDetail(nextDetail);
        }
      })
      .catch((nextError) => {
        if (!cancelled) {
          setDetail(null);
          setDetailError(nextError?.message || String(nextError));
          notifyArchiveError("Unable to load archive detail.", nextError);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setDetailLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedGame]);

  useEffect(() => {
    if (!selectedGame?.archive_id) {
      return;
    }

    const stillExists = archiveGames.some((game) => Number(game.archive_id) === Number(selectedGame.archive_id));
    if (!stillExists) {
      setSelectedGame(null);
    }
  }, [archiveGames, selectedGame]);

  return (
    <>
      <header className="page-header page-header-library">
        <div className="page-heading">
          <h1>Archive</h1>
        </div>

        <div className="library-top-actions">
          <label className="top-search" htmlFor="archive-search">
            <SearchIcon />
            <input
              id="archive-search"
              type="search"
              placeholder="Search archive..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
        </div>
      </header>

      <section className="archive-panel">
        <div className="library-panel-head">
          <div className="library-panel-filters">
            <ArchiveFilterSelect options={ARCHIVE_SOURCE_OPTIONS} value={sourceFilter} onChange={setSourceFilter} />
          </div>
        </div>

        {loading ? (
          <div className="library-empty">
            <LoadingIndicator label="Loading archive..." />
          </div>
        ) : null}

        {!loading && !filteredGames.length ? (
          <div className="library-empty">
            <strong>{archiveGames.length ? "No archive matches." : "Archive is empty."}</strong>
            <span>{archiveGames.length ? "Try another search or filter." : "Deleted games will appear here."}</span>
          </div>
        ) : null}

        {!loading && visibleGames.length ? (
          <div className="archive-list">
            {visibleGames.map((game) => (
              <article
                key={game.archive_id}
                className="archive-card"
                role="button"
                tabIndex={0}
                onClick={() => setSelectedGame(game)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelectedGame(game);
                  }
                }}
              >
                <div className="archive-card-main">
                  <div className="archive-card-cover">
                    {game.cover_url ? <img src={game.cover_url} alt="" /> : <div className="archive-card-cover-fallback">{getInitials(game.name)}</div>}
                  </div>

                  <div className="archive-card-copy">
                    <ArchiveTooltipAnchor
                      as="strong"
                      className="archive-card-title"
                      tooltip={game.name || "Unknown title"}
                    >
                      {game.name}
                    </ArchiveTooltipAnchor>
                    <div className="archive-card-meta">
                      {game.store ? <span>{game.store}</span> : null}
                      {game.release_year ? <span>{game.release_year}</span> : null}
                      <span>{game.has_igdb_link ? "Metadata linked" : "Manual entry"}</span>
                      <span>{formatDurationLong(game.total_seconds || 0)}</span>
                    </div>
                    <div className="archive-card-detail">
                      <span>Archived {formatArchivedDate(game.archived_at)}</span>
                      <div className="archive-exe-row">
                        <ArchiveTooltipAnchor
                          className="archive-exe-pill"
                          tooltip={game.primary_exe_name || "No executable stored"}
                        >
                          <FolderIcon />
                          <span className="archive-exe-pill-text">{truncateExeBadgeText(game.primary_exe_name || "No executable stored")}</span>
                        </ArchiveTooltipAnchor>
                        <span className="archive-expiry-pill">{formatArchiveExpiry(game.archived_at)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="archive-card-actions">
                  <button
                    type="button"
                    className="action-button archive-delete-button"
                    disabled={deletingArchiveId === game.archive_id || restoringArchiveId === game.archive_id}
                    onClick={(event) => {
                      event.stopPropagation();
                      onDeletePermanently?.(game);
                    }}
                  >
                    <TrashIcon />
                    <span>{deletingArchiveId === game.archive_id ? "Deleting..." : "Delete Permanently"}</span>
                  </button>

                  <button
                    type="button"
                    className="action-button action-button-primary archive-restore-button"
                    disabled={restoringArchiveId === game.archive_id || deletingArchiveId === game.archive_id}
                    onClick={(event) => {
                      event.stopPropagation();
                      onRestore?.(game);
                    }}
                  >
                    <span>{restoringArchiveId === game.archive_id ? "Restoring..." : "Restore"}</span>
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : null}

        {!loading && filteredGames.length > ARCHIVE_PAGE_SIZE ? (
          <footer className="archive-footer">
            <span>{buildRangeLabel(filteredGames.length, currentPage, ARCHIVE_PAGE_SIZE)} of {filteredGames.length} archived games</span>
            <div className="pager" role="navigation" aria-label="Archive pagination">
              <button
                type="button"
                aria-label="Previous archive page"
                disabled={currentPage <= 1}
                onMouseDown={preventPagerFocus}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
              >
                <ChevronLeftIcon />
              </button>
              {paginationItems.map((item) => (
                item.type === "ellipsis" ? (
                  <span key={`archive-page-${item.key}`} className="pager-ellipsis" aria-hidden="true">...</span>
                ) : (
                  <button
                    key={`archive-page-${item.value}`}
                    type="button"
                    className={currentPage === item.value ? "is-active" : ""}
                    aria-label={`Archive page ${item.value}`}
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
                aria-label="Next archive page"
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

      {selectedGame ? (
        <div className="confirm-modal-overlay" role="presentation" onClick={() => setSelectedGame(null)}>
          <section className="confirm-modal archive-detail-modal" role="dialog" aria-modal="true" aria-labelledby="archive-detail-title" onClick={(event) => event.stopPropagation()}>
            <div className="confirm-modal-head">
              <ArchiveTooltipAnchor
                as="strong"
                className="archive-detail-title"
                tooltip={detail?.name || selectedGame.name || "Unknown title"}
              >
                <span id="archive-detail-title">{detail?.name || selectedGame.name}</span>
              </ArchiveTooltipAnchor>
              <button
                type="button"
                className="confirm-modal-close"
                aria-label="Close archive detail"
                onClick={() => setSelectedGame(null)}
              >
                <CloseIcon />
              </button>
            </div>

            {detailLoading ? <LoadingIndicator className="archive-detail-loading" label="Loading archive detail..." compact /> : null}

            {!detailLoading && detailError ? <p>Archive detail could not be loaded.</p> : null}

            {!detailLoading && !detailError && detail ? (
              <div className="archive-detail-body">
                <div className="archive-detail-hero">
                  <div className="archive-detail-cover">
                    {detail.cover_url ? (
                      <img src={toAssetUrl(detail.cover_url)} alt={detail.name} />
                    ) : (
                      <div className="archive-card-cover-fallback">{getInitials(detail.name || selectedGame.name)}</div>
                    )}
                  </div>
                  <div className="archive-detail-copy">
                    <div className="archive-detail-meta">
                      {detail.store ? <span>{detail.store}</span> : null}
                      {detail.release_year ? <span>{detail.release_year}</span> : null}
                      <span>{detail.has_igdb_link ? "Metadata linked" : "Manual entry"}</span>
                      <span className="archive-expiry-pill">{formatArchiveExpiry(detail.archived_at)}</span>
                    </div>
                    <ArchiveTooltipAnchor
                      as="p"
                      className="archive-detail-summary"
                      tooltip={String(detail.summary || "").trim() || "No summary was saved for this archived game."}
                    >
                      {String(detail.summary || "").trim() || "No summary was saved for this archived game."}
                    </ArchiveTooltipAnchor>
                  </div>
                </div>

                <div className="archive-detail-grid">
                  <DetailBlock label="Playtime" value={formatDurationLong(detail.total_seconds || 0)} />
                  <DetailBlock label="Archived" value={formatArchivedDate(detail.archived_at)} />
                  <DetailBlock label="Executable" value={detail.primary_exe_name || "Not stored"} />
                  <DetailBlock label="Age Rating" value={detail.age_rating?.label || "Unknown"} icon={<ShieldIcon />} />
                  <DetailBlock label="Developers" value={detail.developers?.length ? detail.developers.join(", ") : "Unknown"} icon={<UsersIcon />} />
                  <DetailBlock label="Publishers" value={detail.publishers?.length ? detail.publishers.join(", ") : "Unknown"} icon={<UsersIcon />} />
                </div>

                {detail.genres?.length ? (
                  <div className="archive-detail-section">
                    <strong>Genres</strong>
                    <div className="archive-card-meta">
                      {detail.genres.map((item) => <span key={item}>{item}</span>)}
                    </div>
                  </div>
                ) : null}

                {detail.platforms?.length ? (
                  <div className="archive-detail-section">
                    <strong>Platforms</strong>
                    <div className="archive-card-meta">
                      {detail.platforms.map((item) => <span key={item}>{item}</span>)}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="confirm-modal-actions">
              <button
                type="button"
                className="action-button archive-delete-button"
                disabled={deletingArchiveId === selectedGame.archive_id || restoringArchiveId === selectedGame.archive_id}
                onClick={() => onDeletePermanently?.(selectedGame)}
              >
                <TrashIcon />
                <span>{deletingArchiveId === selectedGame.archive_id ? "Deleting..." : "Delete Permanently"}</span>
              </button>
              <button
                type="button"
                className="action-button action-button-primary"
                disabled={restoringArchiveId === selectedGame.archive_id || deletingArchiveId === selectedGame.archive_id}
                onClick={() => onRestore?.(selectedGame)}
              >
                {restoringArchiveId === selectedGame.archive_id ? "Restoring..." : "Restore"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

function ArchiveFilterSelect({ options, value, onChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef(null);
  const activeLabel = options.find((option) => option.value === value)?.label || "All sources";

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
        <span>Source:</span>
        <strong>{activeLabel}</strong>
        <ChevronDownIcon />
      </button>

      {isOpen ? (
        <div className="sort-select-panel">
          <div className="sort-select-option-list" role="listbox" aria-label="Filter archive source">
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

function DetailBlock({ label, value, icon = null }) {
  return (
    <div className="archive-detail-block">
      <span>{label}</span>
      <ArchiveTooltipAnchor as="div" className="archive-detail-block-strong" tooltip={value}>
        {icon ? <i className="archive-detail-block-icon">{icon}</i> : null}
        <span className="archive-detail-block-value">{value}</span>
      </ArchiveTooltipAnchor>
    </div>
  );
}
