import React, { memo, startTransition, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDownIcon, CloseIcon, FolderIcon, InfoCircleIcon, RefreshIcon, SearchIcon, WarningTriangleIcon } from "./icons";
import LoadingIndicator from "./LoadingIndicator";
import { igdbCategoryLabel } from "../lib/igdb-game-type";
import { formatDurationLong } from "../lib/game-helpers";
import { invoke } from "../lib/tauri";
import exeHelpMarkdown from "../../src/notes.md?raw";
import exeHelpImage1 from "../../src/picture/image1.png";
import exeHelpImage2 from "../../src/picture/image2.png";
import exeHelpImage3 from "../../src/picture/image3.png";

const STORE_OPTIONS = ["", "Steam", "Epic Games", "GOG", "Microsoft Store", "Rockstar", "EA App", "Ubisoft Connect"];

export default function AddGameModal({ open, onClose, onAdded, onNotify, onOpenAutoScan }) {
  const [form, setForm] = useState(createEmptyForm);
  const [hasName, setHasName] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [savingMode, setSavingMode] = useState("");
  const [pickingExe, setPickingExe] = useState(false);
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState([]);
  const [archiveCandidates, setArchiveCandidates] = useState([]);
  const [selectedArchiveId, setSelectedArchiveId] = useState(null);
  const [archiveChoiceOpen, setArchiveChoiceOpen] = useState(false);
  const [archiveChoiceError, setArchiveChoiceError] = useState("");
  const [duplicateWarning, setDuplicateWarning] = useState(null);
  const [selectedIgdb, setSelectedIgdb] = useState(null);
  const [isSuggestionOpen, setIsSuggestionOpen] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [isExeHelpOpen, setIsExeHelpOpen] = useState(false);
  const rootRef = useRef(null);
  const autocompleteRef = useRef(null);
  const nameInputRef = useRef(null);
  const nameValueRef = useRef("");
  const resultsCacheRef = useRef(new Map());
  const activeQueryRef = useRef("");

  function notifyAddGame(notice) {
    onNotify?.(notice);
  }

  function notifyAddGameError(title, nextError, tone = "danger") {
    notifyAddGame({
      tone,
      title,
      message: nextError?.message || String(nextError),
    });
  }

  useEffect(() => {
    if (!open) {
      setForm(createEmptyForm());
      setHasName(false);
      setSearchQuery("");
      setSaving(false);
      setSavingMode("");
      setPickingExe(false);
      setSearching(false);
      setResults([]);
      setArchiveCandidates([]);
      setSelectedArchiveId(null);
      setArchiveChoiceOpen(false);
      setArchiveChoiceError("");
      setDuplicateWarning(null);
      setSelectedIgdb(null);
      setIsSuggestionOpen(false);
      setHasSearched(false);
      setIsExeHelpOpen(false);
      activeQueryRef.current = "";
      nameValueRef.current = "";
      if (nameInputRef.current) {
        nameInputRef.current.value = "";
      }
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    function handleEscape(event) {
      if (event.key === "Escape" && !saving) {
        if (isExeHelpOpen) {
          setIsExeHelpOpen(false);
          return;
        }
        if (archiveChoiceOpen) {
          setArchiveChoiceOpen(false);
          setArchiveChoiceError("");
          return;
        }
        if (duplicateWarning) {
          setDuplicateWarning(null);
          return;
        }
        onClose?.();
      }
    }

    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, [archiveChoiceOpen, duplicateWarning, isExeHelpOpen, onClose, open, saving]);

  useEffect(() => {
    if (!open || !isSuggestionOpen) {
      return undefined;
    }

    function handlePointerDown(event) {
      if (!autocompleteRef.current?.contains(event.target)) {
        setIsSuggestionOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [isSuggestionOpen, open]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const query = searchQuery.trim();
    if (selectedIgdb?.name === query || query.length < 2) {
      setResults([]);
      setSearching(false);
      activeQueryRef.current = "";
      return undefined;
    }

    const cachedResults = resultsCacheRef.current.get(query.toLowerCase());
    if (cachedResults) {
      startTransition(() => {
        setResults(cachedResults);
      });
      setSearching(false);
      activeQueryRef.current = query.toLowerCase();
      return undefined;
    }

    let cancelled = false;
    startTransition(() => {
      setResults([]);
    });
    const timeoutId = window.setTimeout(async () => {
      const normalizedQuery = query.toLowerCase();
      if (activeQueryRef.current === normalizedQuery) {
        return;
      }

      activeQueryRef.current = normalizedQuery;
      try {
        const nextResults = await invoke("search_igdb_games", { query });
        if (!cancelled) {
          const nextItems = Array.isArray(nextResults) ? nextResults.slice(0, 12) : [];
          resultsCacheRef.current.set(normalizedQuery, nextItems);
          startTransition(() => {
            setResults(nextItems);
          });
        }
      } catch {
        if (!cancelled) {
          startTransition(() => {
            setResults([]);
          });
        }
      } finally {
        if (!cancelled) {
          setSearching(false);
        }
      }
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [open, searchQuery, selectedIgdb]);

  const canSubmit = useMemo(
    () => !saving,
    [saving]
  );
  const showSuggestionPopup = hasSearched && isSuggestionOpen && hasName && (results.length > 0 || searching || !selectedIgdb);
  const exeHelpContent = useMemo(() => buildExeHelpContent(exeHelpMarkdown), []);

  function updateField(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function hasQuotedExePath(value) {
    return /['"]/.test(String(value || ""));
  }

  function notifyQuotedExePath() {
    notifyAddGame({
      tone: "warning",
      title: "Invalid executable path.",
      message: "Exe Path cannot contain quotation marks. Remove any single or double quotes first.",
    });
  }

  function notifyMissingRequiredFields() {
    notifyAddGame({
      tone: "warning",
      title: "Required fields are missing.",
      message: "Game Name and Exe Path must both be filled in before adding a game.",
    });
  }

  function selectManualEntry() {
    setSelectedIgdb(null);
    setResults([]);
    setIsSuggestionOpen(false);
  }

  function handleSearch() {
    const trimmedValue = nameValueRef.current.trim();
    if (!trimmedValue) {
      setHasSearched(false);
      setResults([]);
      setIsSuggestionOpen(false);
      setSearchQuery("");
      setSearching(false);
      return;
    }

    setSelectedIgdb(null);
    setHasSearched(true);
    setIsSuggestionOpen(true);
    setSearching(true);
    setResults([]);
    setSearchQuery(trimmedValue);
  }

  async function handleBrowseExe() {
    setPickingExe(true);

    try {
      const selectedPath = await invoke("pick_exe_path");
      if (selectedPath) {
        updateField("exePath", selectedPath);
      }
    } catch (nextError) {
      notifyAddGameError("Unable to choose executable.", nextError);
    } finally {
      setPickingExe(false);
    }
  }

  async function submitAddGame(options = {}) {
    if (hasQuotedExePath(form.exePath)) {
      notifyQuotedExePath();
      return;
    }

    setSaving(true);
    setSavingMode("add");

    try {
      const result = await invoke("add_game", {
        gameName: nameValueRef.current.trim(),
        exePath: form.exePath.trim(),
        store: form.store || null,
        coverUrl: selectedIgdb?.cover_url || null,
        igdbId: selectedIgdb?.id || null,
        skipArchiveRestore: Boolean(options.skipArchiveRestore),
      });
      await onAdded?.(result && typeof result === "object" ? result : null);
      onClose?.();
    } catch (nextError) {
      notifyAddGameError("Unable to add game.", nextError);
    } finally {
      setSaving(false);
      setSavingMode("");
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (saving) {
      return;
    }

    if (!nameValueRef.current.trim() || !form.exePath.trim()) {
      notifyMissingRequiredFields();
      return;
    }

    if (hasQuotedExePath(form.exePath)) {
      notifyQuotedExePath();
      return;
    }

    try {
      const preflight = await invoke("preflight_add_game", {
        exePath: form.exePath.trim(),
        igdbId: selectedIgdb?.id || null,
      });

      if (preflight?.duplicate_igdb_game) {
        setDuplicateWarning({
          gameId: preflight.duplicate_igdb_game.game_id,
          gameName: preflight.duplicate_igdb_game.game_name || selectedIgdb?.name,
          store: preflight.duplicate_igdb_game.store || null,
          releaseYear: preflight.duplicate_igdb_game.release_year || null,
          igdbName: selectedIgdb?.name || nameValueRef.current.trim(),
        });
        return;
      }

      if (preflight?.executable_conflict_message) {
        notifyAddGame({
          tone: "warning",
          title: "Executable already used.",
          message: preflight.executable_conflict_message,
        });
        return;
      }
    } catch {
      // Keep the add flow working if preflight lookup fails.
    }

    await proceedWithAddFlow();
  }

  async function proceedWithAddFlow() {
    try {
      const query = normalizeArchiveSearchText(nameValueRef.current);
      const queryTokens = tokenizeArchiveSearchText(nameValueRef.current);
      const archiveItems = await invoke("search_archived_games_by_name", {
        query: nameValueRef.current,
      });
      const candidateItems = Array.isArray(archiveItems)
        ? archiveItems
            .map((item) => {
              const normalizedName = normalizeArchiveSearchText(item?.name);
              const normalizedTitle = String(item?.name || "").trim();
              if (!normalizedName || !queryTokens.length) {
                return null;
              }

              const candidateTokens = tokenizeArchiveSearchText(item?.name);
              const matchedTokens = queryTokens.filter((token) => candidateTokens.includes(token));
              const matchRatio = matchedTokens.length / queryTokens.length;
              const startsWithQuery = normalizedName.startsWith(query);
              const includesWholeQuery = normalizedName.includes(query);
              const exactNormalizedMatch = normalizedName === query;
              const hasAllTokens = matchedTokens.length === queryTokens.length;
              const significantTokenMatches = matchedTokens.length >= Math.min(3, queryTokens.length);
              const strongPartialMatch = matchRatio >= 0.6;

              if (
                !exactNormalizedMatch
                && !includesWholeQuery
                && !hasAllTokens
                && !(significantTokenMatches && strongPartialMatch)
              ) {
                return null;
              }

              return {
                item,
                exactNormalizedMatch,
                includesWholeQuery,
                startsWithQuery,
                matchedTokens: matchedTokens.length,
                matchRatio,
                queryLengthDelta: Math.abs(normalizedTitle.length - String(nameValueRef.current || "").trim().length),
                candidateTokenCount: candidateTokens.length,
                startsWithQuery,
              };
            })
            .filter(Boolean)
            .sort((left, right) =>
              Number(right.exactNormalizedMatch) - Number(left.exactNormalizedMatch)
              || Number(right.includesWholeQuery) - Number(left.includesWholeQuery)
              || Number(right.startsWithQuery) - Number(left.startsWithQuery)
              || right.matchRatio - left.matchRatio
              || right.matchedTokens - left.matchedTokens
              || left.queryLengthDelta - right.queryLengthDelta
              || left.candidateTokenCount - right.candidateTokenCount
              || String(left.item?.name || "").localeCompare(String(right.item?.name || ""))
            )
            .map((entry) => entry.item)
            .slice(0, 6)
        : [];
      if (candidateItems.length) {
        setArchiveCandidates(candidateItems);
        setSelectedArchiveId(candidateItems[0]?.archive_id ?? null);
        setArchiveChoiceError("");
        setArchiveChoiceOpen(true);
        return;
      }
    } catch {
      // Keep normal add flow if archive lookup fails.
    }

    await submitAddGame();
  }

  async function handleDuplicateContinue() {
    setDuplicateWarning(null);
    await proceedWithAddFlow();
  }

  async function handleContinueWithoutRestore() {
    setArchiveChoiceOpen(false);
    setArchiveChoiceError("");
    await submitAddGame({ skipArchiveRestore: true });
  }

  async function handleContinueRestore() {
    const candidate = archiveCandidates.find((item) => Number(item.archive_id) === Number(selectedArchiveId));
    if (!candidate) {
      setArchiveChoiceError("select one archive candidate first");
      notifyAddGame({
        tone: "warning",
        title: "Select an archive candidate.",
        message: "Choose one candidate before continuing restore.",
      });
      return;
    }

    setSaving(true);
    setSavingMode("restore");
    setArchiveChoiceError("");

    try {
      const result = await invoke("restore_archived_game_entry", {
        archiveId: Number(candidate.archive_id),
        exePath: form.exePath.trim(),
      });
      await onAdded?.(result && typeof result === "object" ? result : null);
      onClose?.();
    } catch (nextError) {
      const nextMessage = nextError?.message || String(nextError);
      setArchiveChoiceError(nextMessage);
      notifyAddGameError("Unable to restore archived game.", nextError);
    } finally {
      setSaving(false);
      setSavingMode("");
    }
  }

  if (!open) {
    return null;
  }

  return (
    <div className="confirm-modal-overlay add-game-modal-overlay" role="presentation">
      <section
        ref={rootRef}
        className="confirm-modal add-game-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-game-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="confirm-modal-head add-game-modal-head">
          <div>
            <strong id="add-game-title">Add Game</strong>
          </div>
          <button
            type="button"
            className="add-game-close"
            aria-label="Close add game"
            onClick={() => !saving && onClose?.()}
            disabled={saving}
          >
            <CloseIcon />
          </button>
        </div>

        <form className="add-game-form" onSubmit={handleSubmit}>
          <label ref={autocompleteRef} className="edit-game-field add-game-autocomplete">
            <span>Game Name *</span>
            <div className="add-game-name-wrap">
              <SearchIcon />
              <input
                onChange={(event) => {
                  const nextValue = event.target.value;
                  nameValueRef.current = nextValue;
                  const nextHasName = nextValue.trim().length > 0;
                  setHasName((current) => (current === nextHasName ? current : nextHasName));
                  setSelectedIgdb(null);
                  setHasSearched(false);
                  if (!nextHasName) {
                    setResults([]);
                    setArchiveCandidates([]);
                    setSelectedArchiveId(null);
                    setArchiveChoiceOpen(false);
                    setArchiveChoiceError("");
                    setIsSuggestionOpen(false);
                    setSearchQuery("");
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    handleSearch();
                  }
                }}
                onFocus={() => setIsSuggestionOpen(true)}
                placeholder="Elden Ring"
                autoComplete="off"
                ref={nameInputRef}
              />
              <button
                type="button"
                className="add-game-inline-search"
                onClick={handleSearch}
                disabled={!hasName || searching}
              >
                {searching ? "Searching..." : "Search"}
              </button>
            </div>
            {showSuggestionPopup ? (
              <SuggestionPopup
                results={results}
                searching={searching}
                selectedIgdbId={selectedIgdb?.id ?? null}
                onSelect={(game) => {
                  if (nameInputRef.current) {
                    nameInputRef.current.value = game.name;
                  }
                  nameValueRef.current = game.name;
                  setHasName(true);
                  setHasSearched(true);
                  setSearchQuery(game.name);
                  setSelectedIgdb(game);
                  setResults([]);
                  setIsSuggestionOpen(false);
                }}
                onManual={selectManualEntry}
              />
            ) : null}
            {selectedIgdb ? (
              <p className="add-game-selection-note">
                Metadata source: {selectedIgdb.name}
              </p>
            ) : hasName ? (
              <p className="add-game-selection-note">Manual mode is active. The game will be saved without metadata.</p>
            ) : null}
          </label>

          <label className="edit-game-field">
            <div className="edit-game-field-label-row">
              <span className="edit-game-field-label">Exe Path *</span>
              <button
                type="button"
                className="add-game-help-trigger"
                aria-label="How to add a game executable"
                onClick={() => setIsExeHelpOpen(true)}
              >
                <InfoCircleIcon />
              </button>
            </div>
            <div className="edit-game-input-with-action">
              <input
                value={form.exePath}
                onChange={(event) => updateField("exePath", event.target.value)}
                placeholder="Choose a .exe file"
                autoComplete="off"
              />
              <button
                type="button"
                className="action-button action-button-browse"
                onClick={handleBrowseExe}
                disabled={pickingExe || saving}
              >
                <FolderIcon />
                <span>{pickingExe ? "Browsing..." : "Browse"}</span>
              </button>
            </div>
          </label>

          <div className="edit-game-field">
            <span>Store</span>
            <PopupSelect
              value={form.store}
              options={STORE_OPTIONS}
              placeholder="Select store"
              onChange={(value) => updateField("store", value)}
            />
          </div>

          <div className="confirm-modal-actions add-game-actions" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", marginTop: "1.2rem" }}>
            <div />

            <div className="flex items-center gap-2.5">
              <button type="button" className="action-button action-button-danger" onClick={onClose} disabled={saving}>
                Cancel
              </button>
              <button type="submit" className="action-button action-button-primary" disabled={!canSubmit}>
                <span>{saving ? "Adding..." : "Add Game"}</span>
              </button>
            </div>
          </div>
        </form>
      </section>

      {archiveChoiceOpen ? (
        <div className="confirm-modal-overlay add-game-archive-overlay" role="presentation" onClick={() => !saving && setArchiveChoiceOpen(false)}>
          <section
            className="confirm-modal add-game-archive-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="archive-choice-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="confirm-modal-head add-game-archive-head">
              <strong id="archive-choice-title">Archive Candidates</strong>
              <button
                type="button"
                className="add-game-close"
                aria-label="Close archive candidates"
                onClick={() => !saving && setArchiveChoiceOpen(false)}
                disabled={saving}
              >
                <CloseIcon />
              </button>
            </div>
            <p>Found {archiveCandidates.length} archive candidate{archiveCandidates.length === 1 ? "" : "s"} with a similar title. Select one candidate, or continue without restore.</p>

            {archiveChoiceError ? <p>{archiveChoiceError}</p> : null}

            <div className="add-game-archive-candidate-list">
              {archiveCandidates.map((candidate) => {
                const isSelected = Number(selectedArchiveId) === Number(candidate.archive_id);
                return (
                  <button
                    key={candidate.archive_id}
                    type="button"
                    className={`add-game-archive-candidate${isSelected ? " is-selected" : ""}`}
                    onClick={() => {
                      setSelectedArchiveId(candidate.archive_id);
                      setArchiveChoiceError("");
                    }}
                  >
                    <div className="add-game-archive-candidate-copy">
                      <strong>{candidate.name}</strong>
                      <div className="add-game-archive-candidate-meta">
                        {candidate.store ? <span>{candidate.store}</span> : null}
                        {candidate.release_year ? <span>{candidate.release_year}</span> : null}
                        <span>{candidate.has_igdb_link ? "Metadata linked" : "Manual entry"}</span>
                        <span>{formatDurationLong(candidate.total_seconds || 0)}</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="confirm-modal-actions">
              <button
                type="button"
                className="action-button action-button-browse"
                onClick={handleContinueWithoutRestore}
                disabled={saving}
              >
                Continue Without Restore
              </button>
              <button
                type="button"
                className="action-button action-button-primary"
                onClick={handleContinueRestore}
                disabled={saving || !selectedArchiveId}
              >
                {saving ? "Processing..." : "Continue Restore"}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {isExeHelpOpen ? (
        <div className="confirm-modal-overlay add-game-exe-help-overlay" role="presentation" onClick={() => setIsExeHelpOpen(false)}>
          <section
            className="confirm-modal add-game-exe-help-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-game-exe-help-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="confirm-modal-head add-game-exe-help-head">
              <div className="add-game-exe-help-title-wrap">
                <strong id="add-game-exe-help-title">{exeHelpContent.title}</strong>
                {exeHelpContent.description ? <p>{exeHelpContent.description}</p> : null}
              </div>
              <button
                type="button"
                className="add-game-close"
                aria-label="Close executable help"
                onClick={() => setIsExeHelpOpen(false)}
              >
                <CloseIcon />
              </button>
            </div>
            <div className="add-game-exe-help-body">
              <ol className="add-game-exe-help-steps">
                {exeHelpContent.steps.map((step, index) => (
                  <li key={`exe-help-step-${index}`}>
                    <p>{step.text}</p>
                    {step.image ? (
                      <figure className="add-game-exe-help-figure">
                        <img src={step.image.src} alt={step.image.alt} />
                        {step.image.caption ? <figcaption>{step.image.caption}</figcaption> : null}
                      </figure>
                    ) : null}
                  </li>
                ))}
              </ol>
              {exeHelpContent.note ? (
                <div className="add-game-exe-help-note">
                  <strong>Note</strong>
                  <p>{exeHelpContent.note}</p>
                </div>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}

      {duplicateWarning ? (
        <div className="confirm-modal-overlay add-game-duplicate-overlay" role="presentation" onClick={() => !saving && setDuplicateWarning(null)}>
          <section
            className="confirm-modal add-game-duplicate-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="duplicate-warning-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="confirm-modal-head add-game-duplicate-head">
              <div className="add-game-duplicate-title-wrap">
                <span className="add-game-duplicate-icon" aria-hidden="true">
                  <WarningTriangleIcon />
                </span>
                <strong id="duplicate-warning-title">Game Already Exists</strong>
              </div>
              <button
                type="button"
                className="add-game-close"
                aria-label="Close duplicate warning"
                onClick={() => !saving && setDuplicateWarning(null)}
                disabled={saving}
              >
                <CloseIcon />
              </button>
            </div>
            <div className="add-game-duplicate-copy">
              <p className="add-game-duplicate-summary">
                <strong>
                  {duplicateWarning.igdbName}
                  {duplicateWarning.releaseYear ? <span className="add-game-duplicate-year">({duplicateWarning.releaseYear})</span> : null}
                </strong>{" "}
                is already in your library as <strong>{duplicateWarning.gameName}</strong>.
              </p>
              {duplicateWarning.store || duplicateWarning.releaseYear ? (
                <p className="add-game-duplicate-meta">
                  {[duplicateWarning.store, duplicateWarning.releaseYear].filter(Boolean).join(" · ")}
                </p>
              ) : null}
              <p>Continue if you still want to add another executable with the same linked metadata. Cancel to keep the current library unchanged.</p>
            </div>
            <div className="confirm-modal-actions">
              <button
                type="button"
                className="action-button action-button-danger"
                onClick={() => setDuplicateWarning(null)}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="button"
                className="action-button action-button-primary add-game-duplicate-continue"
                onClick={handleDuplicateContinue}
                disabled={saving}
              >
                Continue
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {savingMode === "add" ? (
        <div className="confirm-modal-overlay add-game-loading-overlay" role="presentation">
          <LoadingIndicator label="Adding game..." />
        </div>
      ) : null}

      {savingMode === "restore" ? (
        <div className="confirm-modal-overlay add-game-loading-overlay" role="presentation">
          <LoadingIndicator label="Restoring archived game..." />
        </div>
      ) : null}
    </div>
  );
}

function PopupSelect({ value, options, placeholder, onChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef(null);
  const displayValue = value || placeholder;

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    function handlePointerDown(event) {
      if (!rootRef.current?.contains(event.target)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [isOpen]);

  return (
    <div ref={rootRef} className="popup-select">
      <button
        type="button"
        className={`choice-picker-trigger${isOpen ? " is-open" : ""}`}
        onClick={() => setIsOpen((current) => !current)}
      >
        <span>{displayValue}</span>
        <i className="choice-picker-trigger-icon" aria-hidden="true">
          <ChevronDownIcon />
        </i>
      </button>

      {isOpen ? (
        <div className="choice-picker-panel">
          <div className="choice-picker-option-list add-game-store-option-list">
            {options.map((option) => (
              <button
                key={option || "empty"}
                type="button"
                className={`choice-picker-option${String(value) === String(option) ? " is-selected" : ""}`}
                onClick={() => {
                  onChange(option);
                  setIsOpen(false);
                }}
              >
                {option || placeholder}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function createEmptyForm() {
  return {
    exePath: "",
    store: "",
  };
}

function normalizeArchiveSearchText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokenizeArchiveSearchText(value) {
  return normalizeArchiveSearchText(value)
    .split(" ")
    .filter((token) => token && token.length >= 3 && !ARCHIVE_SEARCH_STOPWORDS.has(token));
}

const ARCHIVE_SEARCH_STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "into",
  "onto",
  "over",
  "under",
  "los",
  "las",
  "del",
  "der",
  "van",
  "von",
  "una",
  "uno",
  "dos",
  "tres",
  "dan",
  "yang",
  "game",
  "edition",
  "version",
]);

const EXE_HELP_IMAGE_MAP = {
  "picture/image1.png": {
    src: exeHelpImage1,
    alt: "Game process in Task Manager",
  },
  "picture/image2.png": {
    src: exeHelpImage2,
    alt: "Open file location option",
  },
  "picture/image3.png": {
    src: exeHelpImage3,
    alt: "Game executable location",
  },
};

function buildExeHelpContent(markdown) {
  const lines = String(markdown || "").split(/\r?\n/);
  const title = lines.find((line) => line.startsWith("### "))
    ?.replace(/^###\s*/, "")
    .trim() || "How to Add a Game Executable";
  const description = lines.find((line) => line.trim() && !line.startsWith("#") && !/^\d+\./.test(line.trim()))
    ?.trim() || "";
  const noteLine = lines.find((line) => /^\*\*note:\*\*/i.test(line.trim()));
  const steps = [];

  lines.forEach((line) => {
    const stepMatch = line.match(/^\d+\.\s+(.*)$/);
    if (stepMatch) {
      const rawStepText = String(stepMatch[1] || "");
      const imageMatch = rawStepText.match(/!\[([^\]]*)\]\(([^)]+)\)/);
      steps.push({
        text: cleanupExeHelpText(rawStepText.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, "")),
        image: imageMatch ? mapExeHelpImage(imageMatch[2], imageMatch[1]) : null,
      });
      return;
    }

    const imageMatch = line.match(/!\[([^\]]*)\]\(([^)]+)\)/);
    if (imageMatch && steps.length) {
      steps[steps.length - 1].image = mapExeHelpImage(imageMatch[2], imageMatch[1]);
    }
  });

  return {
    title,
    description: cleanupExeHelpText(description),
    steps,
    note: noteLine ? cleanupExeHelpText(noteLine.replace(/^\*\*note:\*\*/i, "")) : "",
  };
}

function mapExeHelpImage(imagePath, caption) {
  const imageKey = String(imagePath || "").trim();
  const mappedImage = EXE_HELP_IMAGE_MAP[imageKey];
  if (!mappedImage) {
    return null;
  }

  return {
    ...mappedImage,
    caption: cleanupExeHelpText(caption),
  };
}

function cleanupExeHelpText(value) {
  return String(value || "")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .trim();
}

const SuggestionPopup = memo(function SuggestionPopup({ results, searching, selectedIgdbId, onSelect, onManual }) {
  return (
    <div className="add-game-suggestions">
      {searching ? (
        <SearchSuggestionSkeletons />
      ) : results.length ? (
        results.map((game) => (
          <button
            key={game.id}
            type="button"
            className={`add-game-suggestion${selectedIgdbId === game.id ? " is-selected" : ""}`}
            onClick={() => onSelect(game)}
          >
            {game.cover_url ? (
              <img className="add-game-suggestion-poster" src={game.cover_url} alt="" />
            ) : (
              <div className="add-game-suggestion-poster is-placeholder">GAME</div>
            )}
            <div className="add-game-suggestion-copy">
              <strong>{game.name}</strong>
              {igdbCategoryLabel(game.game_type) ? (
                <span className={`add-game-suggestion-badge ${resolveSuggestionBadgeClass(game.game_type)}`}>
                  <span>{igdbCategoryLabel(game.game_type)}</span>
                </span>
              ) : null}
            </div>
            {game.first_release_year ? (
              <span className="add-game-suggestion-year">{game.first_release_year}</span>
            ) : null}
          </button>
        ))
      ) : (
        <div className="add-game-suggestion-empty">No match found.</div>
      )}

      <button
        type="button"
        className="add-game-suggestion is-manual"
        onClick={onManual}
      >
        <div className="add-game-suggestion-poster is-placeholder">+</div>
        <div className="add-game-suggestion-copy">
          <strong>Add Manual</strong>
          <span className="add-game-suggestion-badge">No metadata</span>
        </div>
      </button>
    </div>
  );
});

function SearchSuggestionSkeletons() {
  return (
    <>
      {Array.from({ length: 4 }, (_, index) => (
        <div key={`search-skeleton-${index}`} className="add-game-suggestion-skeleton" aria-hidden="true">
          <div className="add-game-suggestion-skeleton-poster" />
          <div className="add-game-suggestion-skeleton-copy">
            <span className="add-game-suggestion-skeleton-line is-title" />
            <span className="add-game-suggestion-skeleton-line is-badge" />
          </div>
          <div className="add-game-suggestion-skeleton-year" />
        </div>
      ))}
    </>
  );
}

function resolveSuggestionBadgeClass(gameType) {
  switch (Number(gameType)) {
    case 0:
      return "is-main";
    case 1:
    case 10:
      return "is-expanded";
    case 2:
    case 4:
      return "is-addon";
    case 3:
      return "is-bundle";
    default:
      return "is-default";
  }
}
