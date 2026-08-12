import React, { useEffect, useRef, useState } from "react";
import {
  buildPaginationItems,
  buildRangeLabel,
  PAGE_SIZE,
  preventPagerFocus,
  viewModes,
} from "../lib/game-helpers";
import SummaryCard from "../components/SummaryCard";
import LibraryCardSkeleton from "../components/LibraryCardSkeleton";
import LibraryGameCard from "../components/LibraryGameCard";
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  NavIcon,
  PlusIcon,
  RefreshIcon,
  SearchIcon,
} from "../components/icons";

export function clearSteamHeaderCache() {
  return undefined;
}

export default function LibraryPage({
  activeTab,
  currentPage,
  filteredLibrary,
  loading,
  page,
  query,
  setActiveTab,
  setPage,
  setQuery,
  setSortBy,
  setViewMode,
  sortBy,
  summaryCards,
  totalPages,
  viewMode,
  visibleGames,
  onOpenGameDetail,
  onOpenGameEdit,
  onDeleteGame,
  onToggleFavorite,
  onUpdateStatus,
  onOpenAddGame,
  onResetAllMetadata,
  isResettingAllMetadata = false,
  storeTabs = [],
}) {
  const sortOptions = [
    { value: "last_played", label: "Last Played" },
    { value: "last_added", label: "Last Added" },
    { value: "name", label: "Name" },
    { value: "playtime", label: "Playtime" },
    { value: "release_year", label: "Release Year" },
  ];
  const activeSortLabel = sortOptions.find((option) => option.value === sortBy)?.label || "Last Played";
  const visibleViewModes = viewModes.slice(1);
  const paginationItems = buildPaginationItems(currentPage, totalPages);

  return (
    <>
      <header className="page-header page-header-library">
        <div className="page-heading">
          <h1>Library</h1>
        </div>

        <div className="library-top-actions">
          <label className="top-search" htmlFor="library-search">
            <SearchIcon />
            <input
              id="library-search"
              type="search"
              placeholder="Search games..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>

          <div className="view-switcher" role="group" aria-label="Library view mode">
            {visibleViewModes.map((mode) => (
              <button
                key={mode.id}
                type="button"
                className={viewMode === mode.id ? "is-active" : ""}
                aria-label={mode.label}
                aria-pressed={viewMode === mode.id}
                onClick={() => setViewMode(mode.id)}
              >
                <NavIcon type={mode.icon} />
              </button>
            ))}
          </div>
        </div>
      </header>

      <section className="library-stat-grid">
        {summaryCards.map((card) => {
          const tabId = card.id === "games" ? "all" : card.id;
          return (
            <SummaryCard
              key={card.id}
              {...card}
              loading={loading}
              onClick={() => setActiveTab(tabId)}
              active={activeTab === tabId}
            />
          );
        })}
      </section>

      <div className="library-panel-head">
        <div className="library-panel-filters">
          <CategorySelect
            storeTabs={storeTabs}
            activeTab={activeTab}
            onSelectCategory={setActiveTab}
          />

          <SortSelect
            options={sortOptions}
            value={sortBy}
            label={activeSortLabel}
            onChange={setSortBy}
          />
        </div>

        <div className="library-panel-actions">
          <button type="button" className="action-button action-button-primary rounded-full" onClick={onOpenAddGame}>
            <PlusIcon />
            <span>Add Game</span>
          </button>

          <button
            type="button"
            className="action-button action-button-secondary action-button-reset-all"
            onClick={onResetAllMetadata}
            disabled={isResettingAllMetadata || loading || !filteredLibrary.length}
            aria-label={isResettingAllMetadata ? "Resetting all metadata" : "Reset all metadata"}
            title={isResettingAllMetadata ? "Resetting all metadata" : "Reset all metadata"}
          >
            <RefreshIcon />
            <span>{isResettingAllMetadata ? "Resetting..." : "Reset All"}</span>
          </button>
        </div>
      </div>

      <div className={`library-grid view-${viewMode}`}>
        {loading
          ? Array.from({ length: PAGE_SIZE }, (_, index) => <LibraryCardSkeleton key={`skeleton-${index}`} viewMode={viewMode} />)
          : visibleGames.map((game) => (
            <LibraryGameCard
              key={game.id}
              game={game}
              viewMode={viewMode}
              steamHeaderUrl={game.steam_header_url || ""}
              onOpen={() => onOpenGameDetail?.(game.id)}
              onEdit={() => onOpenGameEdit?.(game.id)}
              onDelete={() => onDeleteGame?.(game.id)}
              onToggleFavorite={(isFavorite) => onToggleFavorite?.(game.id, isFavorite)}
              onUpdateStatus={(gameId, status) => onUpdateStatus?.(gameId, status)}
            />
            ))}
      </div>

      {!loading && !visibleGames.length ? (
        <div className="library-empty">
          <strong>No games found.</strong>
          <span>Try another search or category.</span>
        </div>
      ) : null}

      <footer className="library-footer">
        <span>{buildRangeLabel(filteredLibrary.length, currentPage, PAGE_SIZE)} of {filteredLibrary.length} games</span>
        <div className="pager" role="navigation" aria-label="Pagination">
          <button
            type="button"
            aria-label="Previous page"
            disabled={currentPage <= 1}
            onMouseDown={preventPagerFocus}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
          >
            <ChevronLeftIcon />
          </button>
          {paginationItems.map((item) => (
            item.type === "ellipsis" ? (
              <span key={`page-${item.key}`} className="pager-ellipsis" aria-hidden="true">...</span>
            ) : (
              <button
                key={`page-${item.value}`}
                type="button"
                className={currentPage === item.value ? "is-active" : ""}
                aria-label={`Page ${item.value}`}
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
            aria-label="Next page"
            disabled={currentPage >= totalPages}
            onMouseDown={preventPagerFocus}
            onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
          >
            <ChevronRightIcon />
          </button>
        </div>
      </footer>
    </>
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
          <div className="sort-select-option-list" role="listbox" aria-label="Sort library">
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

function CategorySelect({ storeTabs, activeTab, onSelectCategory }) {
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

  const options = [
    { value: "all", label: "All Games" },
    { value: "installed", label: "Installed Games" },
    { value: "favorites", label: "Favorites" },
    { value: "unplayed", label: "Unplayed Games" },
    { value: "status:Backlog", label: "Backlog / Not Started" },
    { value: "status:In Progress", label: "In Progress / Playing" },
    { value: "status:Completed", label: "Completed / Beaten" },
    { value: "status:100% Mastered", label: "100% Mastered" },
    { value: "status:Dropped", label: "Dropped / Abandoned" },
    ...storeTabs.map((tab) => ({ value: tab.id, label: tab.label, count: tab.count })),
  ];

  const activeOption = options.find((opt) => opt.value === activeTab) || options[0];

  return (
    <div ref={rootRef} className={`sort-select category-select${isOpen ? " is-open" : ""}`}>
      <button
        type="button"
        className="sort-select-trigger"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
      >
        <span>Category:</span>
        <strong>{activeOption.label}</strong>
        <ChevronDownIcon />
      </button>

      {isOpen ? (
        <div className="sort-select-panel">
          <div className="sort-select-option-list" role="listbox" aria-label="Filter games by category">
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={activeTab === option.value}
                className={`sort-select-option${activeTab === option.value ? " is-selected" : ""}`}
                onClick={() => {
                  onSelectCategory(option.value);
                  setIsOpen(false);
                }}
              >
                <span>{option.label}</span>
                {option.count !== undefined ? <small className="store-option-count">({option.count})</small> : null}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
