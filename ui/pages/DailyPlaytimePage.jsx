import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeftIcon, ChevronDownIcon, CloseIcon, ExportIcon } from "../components/icons";
import LoadingIndicator from "../components/LoadingIndicator";
import { formatDurationDetailed } from "../lib/game-helpers";
import { invoke } from "../lib/tauri";

export default function DailyPlaytimePage({ onBack, onNotify, initialOverview = null }) {
  const [days, setDays] = useState(() => Array.isArray(initialOverview?.days) ? initialOverview.days : []);
  const [loading, setLoading] = useState(() => !Array.isArray(initialOverview?.days));
  const [exporting, setExporting] = useState(false);
  const [selectedDay, setSelectedDay] = useState(null);
  const [selectedYear, setSelectedYear] = useState("");
  const [openMonthKeys, setOpenMonthKeys] = useState([]);
  const hasConsumedInitialOverviewRef = useRef(Array.isArray(initialOverview?.days));

  function notifyDaily(notice) {
    onNotify?.(notice);
  }

  function notifyDailyError(title, nextError, tone = "danger") {
    notifyDaily({
      tone,
      title,
      message: nextError?.message || String(nextError),
    });
  }

  async function handleExportCsv() {
    if (!filteredDays.length) {
      return;
    }

    setExporting(true);
    try {
      const csvRows = [
        ["Date", "Daily Total Playtime", "Game", "Game Playtime"].map(csvCell).join(","),
      ];

      filteredDays.forEach((day) => {
        const dateStr = formatDayLabel(day.day_start);
        const totalStr = formatDurationDetailed(day.total_seconds || 0);

        if (Array.isArray(day.all_games) && day.all_games.length > 0) {
          day.all_games.forEach((game, index) => {
            csvRows.push([
              csvCell(index === 0 ? dateStr : ""),
              csvCell(index === 0 ? totalStr : ""),
              csvCell(game.name || "Unknown Game"),
              csvCell(formatDurationDetailed(game.total_seconds || 0)),
            ].join(","));
          });
        } else {
          csvRows.push([
            csvCell(dateStr),
            csvCell(totalStr),
            csvCell("-"),
            csvCell("-"),
          ].join(","));
        }
      });

      const fileName = `daily-playtime-${selectedYear || "all"}.csv`;
      const savedPath = await invoke("export_game_sessions_csv", {
        fileName,
        content: csvRows.join("\n"),
      });

      if (savedPath) {
        notifyDaily({
          tone: "success",
          title: "Daily playtime exported.",
          message: `Saved to ${savedPath}`,
        });
      }
    } catch (nextError) {
      notifyDailyError("Unable to export daily playtime.", nextError);
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
        const result = await invoke("get_daily_playtime_overview");
        if (cancelled) {
          return;
        }
        setDays(Array.isArray(result?.days) ? result.days : []);
      } catch (nextError) {
        if (!cancelled) {
          setDays([]);
          notifyDailyError("Unable to load daily playtime.", nextError);
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

    days.forEach((day) => {
      const date = new Date(Number(day.day_start || 0) * 1000);
      years.add(String(date.getFullYear()));
    });

    return [...years].sort((left, right) => Number(right) - Number(left));
  }, [days]);

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

  const filteredDays = useMemo(() => {
    if (!selectedYear) {
      return days;
    }

    return days.filter((day) => {
      const date = new Date(Number(day.day_start || 0) * 1000);
      return String(date.getFullYear()) === selectedYear;
    });
  }, [days, selectedYear]);

  const monthGroups = useMemo(() => {
    const groups = new Map();

    filteredDays.forEach((day) => {
      const date = new Date(Number(day.day_start || 0) * 1000);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          label: formatMonthLabel(day.day_start),
          totalSeconds: 0,
          days: [],
        });
      }

      const entry = groups.get(key);
      entry.totalSeconds += Math.max(0, Number(day.total_seconds || 0));
      entry.days.push(day);
    });

    return [...groups.values()].sort((left, right) => right.key.localeCompare(left.key));
  }, [filteredDays]);

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
          <h1>Daily Playtime</h1>
        </div>

        <div className="stats-profile-pill" aria-hidden="true" />
      </header>

      <section className="stats-section">
        <article className="daily-playtime-panel">
          <div className="daily-playtime-panel-head">
            <span>{filteredDays.length} tracked days</span>
            <div className="daily-playtime-head-actions">
              <YearSelect options={yearOptions} value={selectedYear} onChange={setSelectedYear} />
              <button
                type="button"
                className="daily-playtime-export-btn"
                onClick={handleExportCsv}
                disabled={exporting || loading || !filteredDays.length}
                title={`Export ${selectedYear || "all"} daily playtime to CSV`}
              >
                <ExportIcon />
                <span>{exporting ? "Exporting..." : "Export CSV"}</span>
              </button>
            </div>
          </div>

          {loading ? <LoadingIndicator className="stats-loading-block" label="Loading daily playtime..." /> : null}

          {!loading && !filteredDays.length ? (
            <div className="stats-empty">
              <strong>No daily playtime recorded.</strong>
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
                        <span>{group.days.length} days</span>
                      </div>
                      <strong>{formatDurationDetailed(group.totalSeconds)}</strong>
                    </div>
                    <ChevronDownIcon />
                  </button>

                  {isOpen ? (
                    <div className="daily-playtime-table">
                      <div className="daily-playtime-table-head" aria-hidden="true">
                        <span>Date</span>
                        <span>Playtime</span>
                        <span>Games</span>
                      </div>

                      <div className="daily-playtime-table-body">
                        {group.days.map((day) => (
                          <button
                            key={`${group.key}-${day.day_start}`}
                            type="button"
                            className="daily-playtime-table-row"
                            onClick={() => setSelectedDay(day)}
                          >
                            <span>{formatDayLabel(day.day_start)}</span>
                            <span>{formatDurationDetailed(day.total_seconds || 0)}</span>
                            <span className="daily-playtime-top-games">
                              {Array.isArray(day.all_games) && day.all_games.length
                                ? renderGameList(day.all_games)
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

      {selectedDay ? (
        <div className="daily-playtime-modal-overlay" role="presentation" onClick={() => setSelectedDay(null)}>
          <section
            className="daily-playtime-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="daily-playtime-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="daily-playtime-modal-head">
              <div>
                <strong id="daily-playtime-modal-title">{formatDayLabel(selectedDay.day_start)}</strong>
                <span>
                  {formatDurationDetailed(selectedDay.total_seconds || 0)}
                  {" \u2022 "}
                  {Array.isArray(selectedDay.all_games) ? selectedDay.all_games.length : 0}
                  {" games"}
                </span>
              </div>
              <button
                type="button"
                className="daily-playtime-modal-close"
                aria-label="Close daily playtime detail"
                onClick={() => setSelectedDay(null)}
              >
                <CloseIcon />
              </button>
            </div>

            <div className="daily-playtime-modal-list">
              {(Array.isArray(selectedDay.all_games) ? selectedDay.all_games : []).map((game) => (
                <div key={`${selectedDay.day_start}-${game.name}`} className="daily-playtime-modal-row">
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
          <div className="sort-select-option-list" role="listbox" aria-label="Filter daily playtime by year">
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

function formatMonthLabel(dayStart) {
  return new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
  }).format(new Date(Number(dayStart || 0) * 1000));
}

function formatDayLabel(dayStart) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(Number(dayStart || 0) * 1000));
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
