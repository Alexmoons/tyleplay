import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeftIcon, ChevronDownIcon, CloseIcon, ExportIcon } from "../components/icons";
import LoadingIndicator from "../components/LoadingIndicator";
import { formatDurationDetailed } from "../lib/game-helpers";
import { invoke } from "../lib/tauri";

export default function WeeklyPlaytimePage({ onBack, onNotify, initialOverview = null }) {
  const [weeks, setWeeks] = useState(() => Array.isArray(initialOverview?.weeks) ? initialOverview.weeks : []);
  const [loading, setLoading] = useState(() => !Array.isArray(initialOverview?.weeks));
  const [exporting, setExporting] = useState(false);
  const [selectedWeek, setSelectedWeek] = useState(null);
  const [selectedYear, setSelectedYear] = useState("");
  const [openMonthKeys, setOpenMonthKeys] = useState([]);
  const hasConsumedInitialOverviewRef = useRef(Array.isArray(initialOverview?.weeks));

  function notifyWeekly(notice) {
    onNotify?.(notice);
  }

  function notifyWeeklyError(title, nextError, tone = "danger") {
    notifyWeekly({
      tone,
      title,
      message: nextError?.message || String(nextError),
    });
  }

  async function handleExportCsv() {
    if (!filteredWeeks.length) {
      return;
    }

    setExporting(true);
    try {
      const csvRows = [
        ["Week", "Weekly Total Playtime", "Game", "Game Playtime"].map(csvCell).join(","),
      ];

      filteredWeeks.forEach((week) => {
        const weekStr = formatWeekLabel(week.week_start);
        const totalStr = formatDurationDetailed(week.total_seconds || 0);

        if (Array.isArray(week.all_games) && week.all_games.length > 0) {
          week.all_games.forEach((game, index) => {
            csvRows.push([
              csvCell(index === 0 ? weekStr : ""),
              csvCell(index === 0 ? totalStr : ""),
              csvCell(game.name || "Unknown Game"),
              csvCell(formatDurationDetailed(game.total_seconds || 0)),
            ].join(","));
          });
        } else {
          csvRows.push([
            csvCell(weekStr),
            csvCell(totalStr),
            csvCell("-"),
            csvCell("-"),
          ].join(","));
        }
      });

      const fileName = `weekly-playtime-${selectedYear || "all"}.csv`;
      const savedPath = await invoke("export_game_sessions_csv", {
        fileName,
        content: csvRows.join("\n"),
      });

      if (savedPath) {
        notifyWeekly({
          tone: "success",
          title: "Weekly playtime exported.",
          message: `Saved to ${savedPath}`,
        });
      }
    } catch (nextError) {
      notifyWeeklyError("Unable to export weekly playtime.", nextError);
    } finally {
      setExporting(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    if (hasConsumedInitialOverviewRef.current) {
      hasConsumedInitialOverviewRef.current = false;
      return () => {
        cancelled = true;
      };
    }

    async function loadOverview() {
      setLoading(true);

      try {
        const result = await invoke("get_weekly_playtime_overview");
        if (cancelled) {
          return;
        }
        setWeeks(Array.isArray(result?.weeks) ? result.weeks : []);
      } catch (nextError) {
        if (!cancelled) {
          setWeeks([]);
          notifyWeeklyError("Unable to load weekly playtime.", nextError);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadOverview();
    return () => {
      cancelled = true;
    };
  }, []);

  const yearOptions = useMemo(() => {
    const years = new Set();

    weeks.forEach((week) => {
      const date = new Date(Number(week.week_start || 0) * 1000);
      years.add(String(date.getFullYear()));
    });

    return [...years].sort((left, right) => Number(right) - Number(left));
  }, [weeks]);

  useEffect(() => {
    if (!yearOptions.length) {
      if (selectedYear) {
        setSelectedYear("");
      }
      return;
    }

    const currentYear = String(new Date().getFullYear());
    if (!selectedYear) {
      setSelectedYear(yearOptions.includes(currentYear) ? currentYear : yearOptions[0]);
      return;
    }

    if (!yearOptions.includes(selectedYear)) {
      setSelectedYear(yearOptions[0]);
    }
  }, [selectedYear, yearOptions]);

  const filteredWeeks = useMemo(() => {
    if (!selectedYear) {
      return weeks;
    }

    return weeks.filter((week) => {
      const date = new Date(Number(week.week_start || 0) * 1000);
      return String(date.getFullYear()) === selectedYear;
    });
  }, [weeks, selectedYear]);

  const monthGroups = useMemo(() => {
    const groups = new Map();

    filteredWeeks.forEach((week) => {
      const date = new Date(Number(week.week_start || 0) * 1000);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          label: formatMonthLabel(week.week_start),
          totalSeconds: 0,
          weeks: [],
        });
      }

      const entry = groups.get(key);
      entry.totalSeconds += Math.max(0, Number(week.total_seconds || 0));
      entry.weeks.push(week);
    });

    return [...groups.values()].sort((left, right) => right.key.localeCompare(left.key));
  }, [filteredWeeks]);

  useEffect(() => {
    if (!monthGroups.length) {
      setOpenMonthKeys([]);
      return;
    }

    const currentMonthKey = getCurrentMonthKey();
    const defaultOpenKey = monthGroups.some((group) => group.key === currentMonthKey)
      ? currentMonthKey
      : monthGroups[0].key;

    setOpenMonthKeys([defaultOpenKey]);
  }, [monthGroups, selectedYear]);

  function toggleMonthGroup(groupKey) {
    setOpenMonthKeys((current) => (
      current.includes(groupKey)
        ? current.filter((key) => key !== groupKey)
        : [...current, groupKey]
    ));
  }

  return (
    <div className="daily-playtime-page">
      <header className="page-header page-header-library daily-playtime-header">
        <div className="page-heading">
          <h1>Weekly Playtime</h1>
        </div>

        <div className="stats-profile-pill" aria-hidden="true" />
      </header>

      <section className="stats-section">
        <article className="daily-playtime-panel">
          <div className="daily-playtime-panel-head">
            <span>{filteredWeeks.length} tracked weeks</span>
            <div className="daily-playtime-head-actions">
              <YearSelect options={yearOptions} value={selectedYear} onChange={setSelectedYear} />
              <button
                type="button"
                className="daily-playtime-export-btn"
                onClick={handleExportCsv}
                disabled={exporting || loading || !filteredWeeks.length}
                title={`Export ${selectedYear || "all"} weekly playtime to CSV`}
              >
                <ExportIcon />
                <span>{exporting ? "Exporting..." : "Export CSV"}</span>
              </button>
            </div>
          </div>

          {loading ? <LoadingIndicator className="stats-loading-block" label="Loading weekly playtime..." /> : null}

          {!loading && !filteredWeeks.length ? (
            <div className="stats-empty">
              <strong>No weekly playtime recorded.</strong>
              <span>No tracked play sessions for the selected year.</span>
            </div>
          ) : null}

          <div className="daily-playtime-groups">
            {monthGroups.map((group) => {
              const isOpen = openMonthKeys.includes(group.key);

              return (
                <section key={group.key} className="daily-playtime-group">
                  <button
                    type="button"
                    className={`daily-playtime-group-head${isOpen ? " is-open" : ""}`}
                    onClick={() => toggleMonthGroup(group.key)}
                    aria-expanded={isOpen}
                  >
                    <div className="daily-playtime-group-head-main">
                      <div>
                        <strong>{group.label}</strong>
                        <span>{group.weeks.length} weeks</span>
                      </div>
                      <strong>{formatDurationDetailed(group.totalSeconds)}</strong>
                    </div>
                    <ChevronDownIcon />
                  </button>

                  {isOpen ? (
                    <div className="daily-playtime-table">
                      <div className="daily-playtime-table-head" aria-hidden="true">
                        <span>Week</span>
                        <span>Playtime</span>
                        <span>Games</span>
                      </div>

                      <div className="daily-playtime-table-body">
                        {group.weeks.map((week) => (
                          <button
                            key={`${group.key}-${week.week_start}`}
                            type="button"
                            className="daily-playtime-table-row"
                            onClick={() => setSelectedWeek(week)}
                          >
                            <span>{formatWeekLabel(week.week_start)}</span>
                            <span>{formatDurationDetailed(week.total_seconds || 0)}</span>
                            <span className="daily-playtime-top-games">
                              {Array.isArray(week.all_games) && week.all_games.length
                                ? renderGameList(week.all_games)
                                : "No finished sessions recorded."}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </section>
              );
            })}
          </div>
        </article>
      </section>

      {selectedWeek ? (
        <div className="daily-playtime-modal-overlay" role="presentation" onClick={() => setSelectedWeek(null)}>
          <section
            className="daily-playtime-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="weekly-playtime-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="daily-playtime-modal-head">
              <div>
                <strong id="weekly-playtime-modal-title">{formatWeekLabel(selectedWeek.week_start)}</strong>
                <span>
                  {formatDurationDetailed(selectedWeek.total_seconds || 0)}
                  {" \u2022 "}
                  {Array.isArray(selectedWeek.all_games) ? selectedWeek.all_games.length : 0}
                  {" games"}
                </span>
              </div>
              <button
                type="button"
                className="daily-playtime-modal-close"
                aria-label="Close weekly playtime detail"
                onClick={() => setSelectedWeek(null)}
              >
                <CloseIcon />
              </button>
            </div>

            <div className="daily-playtime-modal-list">
              {(Array.isArray(selectedWeek.all_games) ? selectedWeek.all_games : []).map((game) => (
                <div key={`${selectedWeek.week_start}-${game.name}`} className="daily-playtime-modal-row">
                  <span>{game.name}</span>
                  <strong>{formatDurationDetailed(game.total_seconds || 0)}</strong>
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function YearSelect({ options, value, onChange }) {
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

  const activeLabel = value || options[0] || "No data";

  return (
    <div ref={rootRef} className={`sort-select daily-playtime-year-select${isOpen ? " is-open" : ""}`}>
      <button
        type="button"
        className="sort-select-trigger"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => options.length && setIsOpen((current) => !current)}
        disabled={!options.length}
      >
        <span>Year:</span>
        <strong>{activeLabel}</strong>
        <ChevronDownIcon />
      </button>

      {isOpen ? (
        <div className="sort-select-panel">
          <div className="sort-select-option-list" role="listbox" aria-label="Filter weekly playtime by year">
            {options.map((option) => (
              <button
                key={option}
                type="button"
                role="option"
                aria-selected={value === option}
                className={`sort-select-option${value === option ? " is-selected" : ""}`}
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

function formatMonthLabel(weekStart) {
  return new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
  }).format(new Date(Number(weekStart || 0) * 1000));
}

function formatWeekLabel(weekStart) {
  const start = new Date(Number(weekStart || 0) * 1000);
  const end = new Date(start.getTime() + 6 * 86400 * 1000);
  const formatter = new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return `${formatter.format(start)} - ${formatter.format(end)}`;
}

function getCurrentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function renderGameList(games) {
  return games.map((game, index) => (
    <React.Fragment key={`${game.name}-${index}`}>
      {index > 0 ? <span className="daily-playtime-game-separator"> • </span> : null}
      <span className="daily-playtime-game-name">{game.name}</span>
    </React.Fragment>
  ));
}

function csvCell(value) {
  const text = String(value ?? "");
  if (text.includes(",") || text.includes('"') || text.includes("\n")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}
