import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeftIcon, CheckCircleIcon, ChevronDownIcon, FolderIcon, InfoCircleIcon, LockIcon, PencilIcon, RefreshIcon, WarningTriangleIcon } from "../components/icons";
import LoadingIndicator from "../components/LoadingIndicator";
import { IGDB_GENRE_OPTIONS, IGDB_PLATFORM_OPTIONS } from "../lib/game-option-lists";
import { buildLogoPresentationStyle, getInitials, resolveBackdropMedia, resolveGenericMedia, resolvePosterMedia, resolveSteamLogoMedia, validateRomFormat } from "../lib/game-helpers";
import { invoke } from "../lib/tauri";
import StarRating from "../components/StarRating";

const STORE_OPTIONS = ["", "Steam", "Epic Games", "GOG", "Microsoft Store", "Rockstar", "EA App", "Ubisoft Connect"];
const COMPLETION_STATUS_OPTIONS = ["Backlog", "In Progress", "Completed", "100% Mastered", "Dropped"];
const AGE_RATING_OPTIONS = ["", "PEGI 3", "PEGI 7", "PEGI 12", "PEGI 16", "PEGI 18"];
const RELEASE_YEAR_OPTIONS = Array.from({ length: 201 }, (_, index) => String(1900 + index));
const DEFAULT_POSITION = 50;
const DEFAULT_ZOOM = 100;
const MIN_ZOOM = 100;
const MAX_ZOOM = 250;
const MAX_GAME_NAME_LENGTH = 360;
export default function EditGamePage({ gameId, fallbackGame, initialDetail = null, backLabel = "Back", onBack, onSaved, onRefreshLibrary, onNotify }) {
  const seededInitialDetail = Number(initialDetail?.id || 0) === Number(gameId) ? initialDetail : null;
  const [detail, setDetail] = useState(seededInitialDetail);
  const [emulatorProfiles, setEmulatorProfiles] = useState([]);
  const [ps3RomStatus, setPs3RomStatus] = useState(null);
  const [form, setForm] = useState(() => buildFormState(seededInitialDetail, fallbackGame));
  const formRef = useRef(buildFormState(seededInitialDetail, fallbackGame));
  const fallbackGameRef = useRef(fallbackGame);
  const [loading, setLoading] = useState(!seededInitialDetail);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resettingPlaytime, setResettingPlaytime] = useState(false);
  const [pickingExe, setPickingExe] = useState(false);
  const [pickingCoverImage, setPickingCoverImage] = useState(false);
  const [pickingBackdropImage, setPickingBackdropImage] = useState(false);
  const [pickingTitleLogoImage, setPickingTitleLogoImage] = useState(false);
  const [playtimeEditLocked, setPlaytimeEditLocked] = useState(true);
  const [confirmState, setConfirmState] = useState(null);
  const hasConsumedInitialDetailRef = useRef(Boolean(seededInitialDetail));
  const isEmulator = String(detail?.game_type || fallbackGame?.game_type || form?.gameType || "").toLowerCase() === "emulator"
    || String(detail?.store || fallbackGame?.store || form?.store || "").toLowerCase() === "emulator"
    || Boolean(detail?.rom_path || fallbackGame?.rom_path || form?.romPath || detail?.emulator_id || detail?.emulator_profile_name || detail?.emulator_name);

  useEffect(() => {
    let cancelled = false;
    invoke("get_emulator_profiles")
      .then((data) => {
        if (!cancelled && Array.isArray(data)) {
          setEmulatorProfiles(data);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const selectedProfile = (emulatorProfiles || []).find((p) => p?.id === form.emulatorId);
    const isRpcs3 = isEmulator && Boolean(
      selectedProfile?.name?.toLowerCase().includes("rpcs3") ||
      selectedProfile?.platform?.toLowerCase().includes("playstation 3") ||
      selectedProfile?.exe_path?.toLowerCase().includes("rpcs3") ||
      selectedProfile?.exePath?.toLowerCase().includes("rpcs3") ||
      detail?.emulator_profile_name?.toLowerCase().includes("rpcs3") ||
      detail?.platform?.toLowerCase().includes("playstation 3")
    );

    const path = (form.romPath || form.executablePath || "").trim();
    if (isRpcs3 && path) {
      let isCurrent = true;
      invoke("check_ps3_rom_status", { path })
        .then((res) => {
          if (isCurrent) {
            setPs3RomStatus(res);
          }
        })
        .catch(() => {
          if (isCurrent) {
            setPs3RomStatus(null);
          }
        });
      return () => {
        isCurrent = false;
      };
    } else {
      setPs3RomStatus(null);
    }
  }, [isEmulator, form.emulatorId, form.romPath, form.executablePath, emulatorProfiles, detail]);

  useEffect(() => {
    fallbackGameRef.current = fallbackGame;
  }, [fallbackGame]);

  useEffect(() => {
    const seededForm = buildFormState(seededInitialDetail, fallbackGameRef.current);
    syncFormState(formRef, setForm, seededForm);
    setDetail(seededInitialDetail);
    setPlaytimeEditLocked(true);

    let cancelled = false;

    if (hasConsumedInitialDetailRef.current) {
      hasConsumedInitialDetailRef.current = false;
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    async function loadDetail() {
      setLoading(true);

      try {
        const nextDetail = await invoke("get_game_detail", { gameId });
        if (cancelled) {
          return;
        }
        setDetail(nextDetail);
        syncFormState(formRef, setForm, buildFormState(nextDetail, fallbackGameRef.current));
        setPlaytimeEditLocked(true);
      } catch (nextError) {
        if (!cancelled) {
          setDetail(null);
          syncFormState(formRef, setForm, buildFormState(null, fallbackGameRef.current));
          setPlaytimeEditLocked(true);
          notifyEditorError("Unable to load game info.", nextError);
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

  const hasIgdbLink = Boolean(detail?.has_igdb_link);
  const hasManualPlaytime = Boolean(detail?.has_manual_playtime);
  const currentTotalSeconds = Math.max(0, Number(detail?.total_seconds || fallbackGame?.total_seconds || 0));
  const baselineForm = useMemo(
    () => buildFormState(detail, fallbackGame),
    [detail, fallbackGame]
  );
  const hasUnsavedChanges = useMemo(
    () => JSON.stringify(form) !== JSON.stringify(baselineForm),
    [form, baselineForm]
  );
  const posterPreviewSource = resolvePosterMedia(form.coverUrl || detail?.cover_url || fallbackGame?.cover_url);
  const backdropPreviewSource = resolveBackdropMedia(
    form.backdropUrl || form.coverUrl || detail?.backdrop_url || detail?.cover_url || fallbackGame?.backdrop_url || fallbackGame?.cover_url
  );
  const titleLogoPreviewSource = (
    resolveGenericMedia(form.titleLogoUrl || detail?.title_logo_url || fallbackGame?.title_logo_url)
    || resolveSteamLogoMedia(
      form.backdropUrl || detail?.backdrop_url || fallbackGame?.backdrop_url,
      form.coverUrl || detail?.cover_url || fallbackGame?.cover_url
    )
  );

  function notifyEditor(notice) {
    onNotify?.(notice);
  }

  function notifyEditorError(title, nextError, tone = "danger") {
    notifyEditor({
      tone,
      title,
      message: nextError?.message || String(nextError),
    });
  }

  function updateField(key, value) {
    setForm((current) => {
      const nextForm = { ...current, [key]: value };
      formRef.current = nextForm;
      return nextForm;
    });
  }

  function handleTitleDisplayChange(useLogo) {
    updateField("useTitleLogo", useLogo);
    if (!useLogo || String(formRef.current.titleLogoUrl || "").trim()) {
      return;
    }
    notifyEditor({
      tone: "warning",
      title: "Title logo not available.",
      message: "No title logo was found for this game. You can add one manually.",
    });
  }

  function togglePlatform(platform) {
    setForm((current) => {
      const nextForm = {
        ...current,
        platforms: current.platforms.includes(platform)
          ? current.platforms.filter((item) => item !== platform)
          : [...current.platforms, platform],
      };
      formRef.current = nextForm;
      return nextForm;
    });
  }

  function toggleGenre(genre) {
    setForm((current) => {
      const nextForm = {
        ...current,
        genres: current.genres.includes(genre)
          ? current.genres.filter((item) => item !== genre)
          : [...current.genres, genre],
      };
      formRef.current = nextForm;
      return nextForm;
    });
  }

  function handleMediaPositionChange(prefix, axis, value) {
    updateField(`${prefix}Position${axis}`, clampPosition(value));
  }

  function handleMediaZoomChange(prefix, value) {
    updateField(`${prefix}Zoom`, clampZoom(value));
  }

  function resetMediaTransform(prefix) {
    setForm((current) => {
      const nextForm = {
        ...current,
        [`${prefix}PositionX`]: DEFAULT_POSITION,
        [`${prefix}PositionY`]: DEFAULT_POSITION,
        [`${prefix}Zoom`]: DEFAULT_ZOOM,
      };
      formRef.current = nextForm;
      return nextForm;
    });
  }

  async function handleBrowseExeOrRom() {
    setPickingExe(true);

    try {
      if (isEmulator) {
        const selectedProfile = (emulatorProfiles || []).find((p) => p?.id === formRef.current.emulatorId);
        const emuName = selectedProfile?.name || detail?.emulator_profile_name || "";
        const selectedPath = await invoke("pick_rom_path", { emulatorName: emuName || null });
        if (selectedPath) {
          updateField("romPath", selectedPath);
          updateField("executablePath", selectedPath);
        }
      } else {
        const selectedPath = await invoke("pick_exe_path");
        if (selectedPath) {
          updateField("executablePath", selectedPath);
        }
      }
    } catch (nextError) {
      notifyEditorError(isEmulator ? "Unable to choose ROM." : "Unable to choose executable.", nextError);
    } finally {
      setPickingExe(false);
    }
  }

  async function handleBrowseRomFolder() {
    setPickingExe(true);

    try {
      const selectedPath = await invoke("pick_folder_path");
      if (selectedPath) {
        let pathToUse = selectedPath;
        try {
          const statusResult = await invoke("check_ps3_rom_status", { path: selectedPath });
          if (statusResult?.detected_file) {
            pathToUse = statusResult.detected_file;
          }
        } catch {
          // fallback to selected folder
        }
        updateField("romPath", pathToUse);
        updateField("executablePath", pathToUse);
      }
    } catch (nextError) {
      notifyEditorError("Unable to choose game folder.", nextError);
    } finally {
      setPickingExe(false);
    }
  }

  async function handleBrowseImage(fieldKey, setPicking) {
    setPicking(true);

    try {
      const selectedPath = await invoke("pick_image_path");
      if (selectedPath) {
        updateField(fieldKey, selectedPath);
      }
    } catch (nextError) {
      notifyEditorError("Unable to choose image.", nextError);
    } finally {
      setPicking(false);
    }
  }

  async function executeReset() {
    if (!hasIgdbLink) {
      return;
    }

    setResetting(true);

    try {
      if (hasManualPlaytime) {
        await invoke("reset_game_playtime", { gameId });
      }
      await invoke("reset_game_metadata_to_igdb", { gameId });
      const nextDetail = await invoke("get_game_detail", { gameId });
      setDetail(nextDetail);
      syncFormState(formRef, setForm, buildFormState(nextDetail, fallbackGameRef.current));
      setPlaytimeEditLocked(true);
      await onRefreshLibrary?.();
      notifyEditor({
        tone: "success",
        title: "Game info reset.",
        message: "Metadata has been restored for this game.",
      });
    } catch (nextError) {
      notifyEditorError("Unable to reset game info.", nextError);
    } finally {
      setResetting(false);
    }
  }

  async function executeResetPlaytime() {
    setResettingPlaytime(true);

    try {
      await invoke("reset_game_playtime", { gameId });
      const nextDetail = await invoke("get_game_detail", { gameId });
      setDetail(nextDetail);
      syncFormState(formRef, setForm, buildFormState(nextDetail, fallbackGameRef.current));
      setPlaytimeEditLocked(true);
      await onRefreshLibrary?.();
      notifyEditor({
        tone: "success",
        title: "Playtime reset.",
        message: "The displayed total now follows tracked sessions again.",
      });
    } catch (nextError) {
      notifyEditorError("Unable to reset playtime.", nextError);
    } finally {
      setResettingPlaytime(false);
    }
  }

  async function executeSave(nextPlaytimeSeconds, playtimeChanged) {
    setSaving(true);

    try {
      const currentForm = formRef.current;
      const isEmu = isEmulator
        || currentForm.gameType === "emulator"
        || String(detail?.game_type || fallbackGame?.game_type || "").toLowerCase() === "emulator"
        || String(currentForm.store || detail?.store || "").toLowerCase() === "emulator"
        || Boolean(currentForm.romPath || detail?.rom_path || currentForm.emulatorId || detail?.emulator_id || detail?.emulator_profile_name || detail?.emulator_name);

      if (isEmu) {
        const nextRomPath = (currentForm.romPath || currentForm.executablePath || "").trim();
        let finalEmulatorId = currentForm.emulatorId ? Number(currentForm.emulatorId) : null;
        let emuName = (emulatorProfiles || []).find((p) => p?.id === currentForm.emulatorId)?.name || detail?.emulator_name || detail?.emulator_profile_name || "";
        if (!finalEmulatorId && Array.isArray(emulatorProfiles) && emulatorProfiles.length > 0) {
          const profileName = detail?.emulator_name || detail?.emulator_profile_name || "";
          if (profileName) {
            const matched = emulatorProfiles.find((p) => p?.name?.toLowerCase() === profileName.toLowerCase());
            if (matched) {
              finalEmulatorId = matched.id;
              emuName = matched.name;
            }
          }
        }

        if (nextRomPath) {
          const validationError = validateRomFormat(emuName, nextRomPath);
          if (validationError) {
            notifyEditorError(validationError);
            return;
          }
        }

        await invoke("update_game_metadata", {
          input: {
            gameId,
            name: currentForm.name.trim(),
            store: currentForm.store || "Emulator",
            coverUrl: currentForm.coverUrl.trim() || null,
            coverPositionX: currentForm.coverPositionX,
            coverPositionY: currentForm.coverPositionY,
            coverZoom: currentForm.coverZoom,
            backdropUrl: currentForm.backdropUrl.trim() || null,
            backdropPositionX: currentForm.backdropPositionX,
            backdropPositionY: currentForm.backdropPositionY,
            backdropZoom: currentForm.backdropZoom,
            titleLogoUrl: currentForm.titleLogoUrl.trim() || null,
            useTitleLogo: currentForm.useTitleLogo,
            titleLogoPositionX: currentForm.titleLogoPositionX,
            titleLogoPositionY: currentForm.titleLogoPositionY,
            titleLogoZoom: currentForm.titleLogoZoom,
            summary: currentForm.summary.trim() || null,
            releaseYear: currentForm.releaseYear ? Number(currentForm.releaseYear) : null,
            genres: currentForm.genres,
            platforms: currentForm.platforms,
            developers: splitList(currentForm.developersInput),
            publishers: splitList(currentForm.publishersInput),
            ageRatingLabel: currentForm.ageRatingLabel || null,
            completionStatus: detail?.completion_status || fallbackGame?.completion_status || "Backlog",
            gameType: "emulator",
            romPath: nextRomPath || null,
            emulatorId: finalEmulatorId,
          },
        });
      } else {
        const nextExecutablePath = currentForm.executablePath.trim();
        const previousExecutablePath = String(detail?.executable_path || fallbackGame?.executable_path || "").trim();
        if (nextExecutablePath !== previousExecutablePath) {
          await invoke("update_game_executable", {
            input: {
              gameId,
              exePath: nextExecutablePath,
            },
          });
        }

        await invoke("update_game_metadata", {
          input: {
            gameId,
            name: currentForm.name.trim(),
            store: currentForm.store || null,
            coverUrl: currentForm.coverUrl.trim() || null,
            coverPositionX: currentForm.coverPositionX,
            coverPositionY: currentForm.coverPositionY,
            coverZoom: currentForm.coverZoom,
            backdropUrl: currentForm.backdropUrl.trim() || null,
            backdropPositionX: currentForm.backdropPositionX,
            backdropPositionY: currentForm.backdropPositionY,
            backdropZoom: currentForm.backdropZoom,
            titleLogoUrl: currentForm.titleLogoUrl.trim() || null,
            useTitleLogo: currentForm.useTitleLogo,
            titleLogoPositionX: currentForm.titleLogoPositionX,
            titleLogoPositionY: currentForm.titleLogoPositionY,
            titleLogoZoom: currentForm.titleLogoZoom,
            summary: currentForm.summary.trim() || null,
            releaseYear: currentForm.releaseYear ? Number(currentForm.releaseYear) : null,
            genres: currentForm.genres,
            platforms: currentForm.platforms,
            developers: splitList(currentForm.developersInput),
            publishers: splitList(currentForm.publishersInput),
            ageRatingLabel: currentForm.ageRatingLabel || null,
            completionStatus: detail?.completion_status || fallbackGame?.completion_status || "Backlog",
            gameType: "pc",
          },
        });
      }

      if (playtimeChanged) {
        await invoke("update_game_playtime", {
          input: {
            gameId,
            totalSeconds: nextPlaytimeSeconds,
          },
        });
      }

      await onRefreshLibrary?.();
      notifyEditor({
        tone: "success",
        title: "Game info saved.",
        message: playtimeChanged
          ? "Metadata and playtime changes have been applied."
          : "Your changes have been applied.",
      });
      onSaved?.();
    } catch (nextError) {
      notifyEditorError("Unable to save game info.", nextError);
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    if (!hasIgdbLink || resetting || saving) {
      return;
    }
    setConfirmState({
      title: "Reset",
      message: hasManualPlaytime
        ? "Restore this game's linked metadata? This will also remove the manually edited playtime adjustment. Recorded play sessions will not be changed."
        : "Restore this game's linked metadata? Manual edits on this page will be replaced.",
      confirmLabel: "Reset",
      tone: "igdb",
      onConfirm: executeReset,
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (loading || saving) {
      return;
    }

    const currentForm = formRef.current;
    const trimmedName = String(currentForm.name || "").trim();
    if (!trimmedName) {
      notifyEditor({
        tone: "warning",
        title: "Game name is required.",
        message: "Enter a game title before saving.",
      });
      return;
    }

    if (trimmedName.length > MAX_GAME_NAME_LENGTH) {
      notifyEditor({
        tone: "warning",
        title: "Game name is too long.",
        message: `Keep the game title within ${MAX_GAME_NAME_LENGTH} characters.`,
      });
      return;
    }

    const isEmu = isEmulator
      || currentForm.gameType === "emulator"
      || String(detail?.game_type || fallbackGame?.game_type || "").toLowerCase() === "emulator"
      || String(currentForm.store || detail?.store || "").toLowerCase() === "emulator"
      || Boolean(currentForm.romPath || detail?.rom_path || currentForm.emulatorId || detail?.emulator_id || detail?.emulator_profile_name || detail?.emulator_name);

    if (isEmu) {
      const nextRomPath = String(currentForm.romPath || currentForm.executablePath || "").trim();
      if (nextRomPath) {
        let emuName = (emulatorProfiles || []).find((p) => p?.id === currentForm.emulatorId)?.name || detail?.emulator_name || detail?.emulator_profile_name || "";
        if (!emuName && Array.isArray(emulatorProfiles) && emulatorProfiles.length > 0) {
          const profileName = detail?.emulator_name || detail?.emulator_profile_name || "";
          if (profileName) {
            const matched = emulatorProfiles.find((p) => p?.name?.toLowerCase() === profileName.toLowerCase());
            if (matched) {
              emuName = matched.name;
            }
          }
        }
        const validationError = validateRomFormat(emuName, nextRomPath);
        if (validationError) {
          notifyEditorError("Invalid ROM format.", new Error(validationError), "warning");
          return;
        }
      }
    } else {
      const nextExecutablePath = String(currentForm.executablePath || "").trim();
      if (nextExecutablePath) {
        try {
          await invoke("validate_executable_path", { exePath: nextExecutablePath });
        } catch (nextError) {
          notifyEditorError("Invalid executable path.", nextError, "warning");
          return;
        }
      }
    }

    let nextPlaytimeSeconds = 0;
    try {
      nextPlaytimeSeconds = parseDurationInputValue(currentForm.playtimeInput);
    } catch (nextError) {
      notifyEditorError("Invalid playtime format.", nextError, "warning");
      return;
    }

    const playtimeChanged = nextPlaytimeSeconds !== currentTotalSeconds;
    setConfirmState({
      title: playtimeChanged ? "Confirm Playtime Edit" : "Save Changes",
      message: playtimeChanged
        ? "You are about to manually edit this game's playtime. This only changes the displayed total and can differ from tracked play sessions. Continue?"
        : "Save all current changes to this game info?",
      confirmLabel: "Save Changes",
      tone: playtimeChanged ? "danger" : "primary",
      onConfirm: () => executeSave(nextPlaytimeSeconds, playtimeChanged),
    });
  }

  function handleCancel() {
    if (saving) {
      return;
    }
    if (!hasUnsavedChanges) {
      onBack?.();
      return;
    }
    setConfirmState({
      title: "Cancel Editing",
      message: "Discard your current changes and go back?",
      confirmLabel: "Discard Changes",
      tone: "danger",
      onConfirm: () => onBack?.(),
    });
  }

  function handlePlaytimeLockToggle() {
    if (playtimeEditLocked) {
      setPlaytimeEditLocked(false);
      return;
    }

    try {
      const normalized = formatDurationInputValue(parseDurationInputValue(formRef.current.playtimeInput));
      updateField("playtimeInput", normalized);
      setPlaytimeEditLocked(true);
    } catch (nextError) {
      notifyEditorError("Invalid playtime format.", nextError, "warning");
    }
  }

  function handleResetPlaytime() {
    if (!hasManualPlaytime || resettingPlaytime || saving) {
      return;
    }
    setConfirmState({
      title: "Reset Playtime",
      message: "Reset the manually edited playtime and return it to the tracked session total?",
      confirmLabel: "Reset Playtime",
      tone: "danger",
      onConfirm: executeResetPlaytime,
    });
  }

  async function handleConfirmAction() {
    const action = confirmState?.onConfirm;
    setConfirmState(null);
    await action?.();
  }

  return (
    <div className="edit-game-page">

      <form className="edit-game-layout" onSubmit={handleSubmit}>
        <section className="library-panel edit-game-panel">
          <div className="edit-game-panel-head">
            <strong>Game Information</strong>
          </div>

          <div className="edit-game-grid">
            <Field label="Game Name" required>
              <input
                value={form.name}
                onChange={(event) => updateField("name", limitGameNameInput(event.target.value))}
                placeholder="Game title"
                maxLength={MAX_GAME_NAME_LENGTH}
              />
            </Field>

            {isEmulator ? (
              <Field label="Emulator Profile" element="div" required>
                <PopupSelect
                  value={
                    (emulatorProfiles || []).find((p) => p?.id === form.emulatorId)?.name || detail?.emulator_name || detail?.emulator_profile_name || ""
                  }
                  options={
                    Array.isArray(emulatorProfiles)
                      ? emulatorProfiles.map((p) => p?.name).filter(Boolean)
                      : []
                  }
                  placeholder={
                    (emulatorProfiles || []).length > 0
                      ? "Select emulator profile"
                      : "No emulator profiles configured"
                  }
                  onChange={(selectedName) => {
                    const matchedProfile = (emulatorProfiles || []).find((p) => p?.name === selectedName);
                    updateField("emulatorId", matchedProfile ? matchedProfile.id : null);
                  }}
                />
              </Field>
            ) : (
              <Field label="Store" element="div">
                <PopupSelect
                  value={form.store}
                  options={STORE_OPTIONS}
                  placeholder="Select store"
                  onChange={(value) => updateField("store", value)}
                />
              </Field>
            )}

            <Field label="Release Year" element="div">
              <PopupSelect
                value={form.releaseYear}
                options={["", ...RELEASE_YEAR_OPTIONS]}
                placeholder="Select year"
                onChange={(value) => updateField("releaseYear", value)}
              />
            </Field>

            <Field label="Age Rating" element="div">
              <PopupSelect
                value={form.ageRatingLabel}
                options={AGE_RATING_OPTIONS}
                placeholder="Select rating"
                onChange={(value) => updateField("ageRatingLabel", value)}
              />
            </Field>

            {(() => {
              const selectedProfile = (emulatorProfiles || []).find((p) => p?.id === form.emulatorId);
              const isRpcs3Profile = isEmulator && Boolean(
                selectedProfile?.name?.toLowerCase().includes("rpcs3") ||
                selectedProfile?.platform?.toLowerCase().includes("playstation 3") ||
                selectedProfile?.exe_path?.toLowerCase().includes("rpcs3") ||
                selectedProfile?.exePath?.toLowerCase().includes("rpcs3") ||
                detail?.emulator_profile_name?.toLowerCase().includes("rpcs3") ||
                detail?.platform?.toLowerCase().includes("playstation 3")
              );

              return (
                <Field
                  className="edit-game-field-wide"
                  label={isEmulator ? (isRpcs3Profile ? "ROM File or Game Folder" : "ROM File") : "Executable Path"}
                  required={false}
                >
                  <div className="edit-game-input-with-action">
                    <input
                      value={isEmulator ? (form.romPath || form.executablePath) : form.executablePath}
                      onChange={(event) => {
                        if (isEmulator) {
                          updateField("romPath", event.target.value);
                          updateField("executablePath", event.target.value);
                        } else {
                          updateField("executablePath", event.target.value);
                        }
                      }}
                      placeholder={
                        isEmulator
                          ? (isRpcs3Profile
                              ? "Choose a decrypted ROM file (.iso) or game folder"
                              : "Choose a ROM file (.iso, .bin, .chd, .cso, etc.)")
                          : "Choose a .exe file"
                      }
                    />
                    {isEmulator && isRpcs3Profile ? (
                      <BrowseDropdown
                        onPickFile={handleBrowseExeOrRom}
                        onPickFolder={handleBrowseRomFolder}
                        isPicking={pickingExe}
                        disabled={saving}
                      />
                    ) : (
                      <button
                        type="button"
                        className="action-button action-button-browse"
                        onClick={handleBrowseExeOrRom}
                        disabled={pickingExe || saving}
                      >
                        <FolderIcon />
                        <span>{pickingExe ? "Browsing..." : "Browse"}</span>
                      </button>
                    )}
                  </div>
                  {isEmulator && isRpcs3Profile && Boolean((form.romPath || form.executablePath || "").trim()) && ps3RomStatus && ps3RomStatus.status !== "empty" && (
                    <div className={`ps3-rom-status-note ${ps3RomStatus.is_valid ? "is-valid" : "is-invalid"}`}>
                      {ps3RomStatus.is_valid ? <CheckCircleIcon /> : <WarningTriangleIcon />}
                      <span>{ps3RomStatus.message}</span>
                    </div>
                  )}
                </Field>
              );
            })()}

            <Field className="edit-game-field-wide" label="Summary">
              <textarea
                value={form.summary}
                onChange={(event) => updateField("summary", event.target.value)}
                placeholder="Write a short synopsis"
                rows={5}
              />
            </Field>

            <Field label="Platforms" element="div">
              <ChoicePicker
                selectedItems={form.platforms}
                options={IGDB_PLATFORM_OPTIONS}
                placeholder="Select platform"
                emptyLabel="No platform selected."
                onToggleItem={togglePlatform}
              />
            </Field>

            <Field label="Genres" element="div">
              <ChoicePicker
                selectedItems={form.genres}
                options={IGDB_GENRE_OPTIONS}
                placeholder="Select genre"
                emptyLabel="No genre selected."
                onToggleItem={toggleGenre}
              />
            </Field>

            <Field className="edit-game-field-wide" label="Developers">
              <input
                value={form.developersInput}
                onChange={(event) => updateField("developersInput", event.target.value)}
                placeholder="FromSoftware, Supergiant Games"
              />
            </Field>

            <Field className="edit-game-field-wide" label="Publishers">
              <input
                value={form.publishersInput}
                onChange={(event) => updateField("publishersInput", event.target.value)}
                placeholder="Bandai Namco Entertainment"
              />
            </Field>

            <Field
              className="edit-game-field-wide"
              label={(
                <span className="edit-game-field-label">
                  <span>Playtime</span>
                  <button
                    type="button"
                    className="edit-game-field-info"
                    aria-label="This only adds to the displayed playtime total. It does not create or add recorded play sessions."
                  >
                    <InfoCircleIcon />
                    <span className="edit-game-field-tooltip" role="tooltip">
                      This only adds to the displayed playtime total. It does not create or add recorded play sessions.
                    </span>
                  </button>
                </span>
              )}
            >
              <div className={`edit-game-input-with-action${playtimeEditLocked ? " is-locked" : ""}`}>
                <input
                  value={form.playtimeInput}
                  onChange={(event) => updateField("playtimeInput", event.target.value)}
                  placeholder="hh:mm:ss"
                  readOnly={playtimeEditLocked}
                />
                <button
                  type="button"
                  className={`action-button ${playtimeEditLocked ? "action-button-browse" : "action-button-danger"} edit-game-playtime-toggle`}
                  onClick={handlePlaytimeLockToggle}
                  disabled={saving || resettingPlaytime}
                >
                  {playtimeEditLocked ? <PencilIcon /> : <LockIcon />}
                  <span>{playtimeEditLocked ? "Edit" : "Lock"}</span>
                </button>
              </div>
              <small className="edit-game-field-note">
                Manual playtime only adjusts the displayed total. Tracked sessions are not changed.
              </small>
              {hasManualPlaytime ? (
                <button
                  type="button"
                  className="action-button action-button-danger edit-game-inline-action"
                  onClick={handleResetPlaytime}
                  disabled={saving || resettingPlaytime}
                >
                  <span>{resettingPlaytime ? "Resetting..." : "Reset Playtime"}</span>
                </button>
              ) : null}
            </Field>
          </div>
        </section>

        <section className="library-panel edit-game-panel">
          <div className="edit-game-panel-head">
            <strong>Media</strong>
          </div>

          <div className="edit-game-grid">
            <Field className="edit-game-field-wide" label="Cover URL">
              <div className="edit-game-input-with-action">
                <input
                  value={form.coverUrl}
                  onChange={(event) => updateField("coverUrl", event.target.value)}
                  placeholder="https://... or local image path"
                />
                <button
                  type="button"
                  className="action-button action-button-browse"
                  onClick={() => handleBrowseImage("coverUrl", setPickingCoverImage)}
                  disabled={pickingCoverImage || saving}
                >
                  <FolderIcon />
                  <span>{pickingCoverImage ? "Browsing..." : "Browse"}</span>
                </button>
              </div>
            </Field>

            <Field className="edit-game-field-wide" label="Backdrop URL">
              <div className="edit-game-input-with-action">
                <input
                  value={form.backdropUrl}
                  onChange={(event) => updateField("backdropUrl", event.target.value)}
                  placeholder="https://... or local image path"
                />
                <button
                  type="button"
                  className="action-button action-button-browse"
                  onClick={() => handleBrowseImage("backdropUrl", setPickingBackdropImage)}
                  disabled={pickingBackdropImage || saving}
                >
                  <FolderIcon />
                  <span>{pickingBackdropImage ? "Browsing..." : "Browse"}</span>
                </button>
              </div>
            </Field>

            <Field label="Title Display">
              <div className="edit-game-choice-grid">
                <button
                  type="button"
                  className={`edit-game-choice${!form.useTitleLogo ? " is-active" : ""}`}
                  onClick={() => handleTitleDisplayChange(false)}
                >
                  Text
                </button>
                <button
                  type="button"
                  className={`edit-game-choice${form.useTitleLogo ? " is-active" : ""}`}
                  onClick={() => handleTitleDisplayChange(true)}
                >
                  Use Logo
                </button>
              </div>
            </Field>

            {form.useTitleLogo ? (
              <Field className="edit-game-field-wide" label="Title Logo URL">
                <div className="edit-game-input-with-action">
                  <input
                    value={form.titleLogoUrl}
                    onChange={(event) => updateField("titleLogoUrl", event.target.value)}
                    placeholder="https://... or local image path"
                  />
                  <button
                    type="button"
                    className="action-button action-button-browse"
                    onClick={() => handleBrowseImage("titleLogoUrl", setPickingTitleLogoImage)}
                    disabled={pickingTitleLogoImage || saving}
                  >
                    <FolderIcon />
                    <span>{pickingTitleLogoImage ? "Browsing..." : "Browse"}</span>
                  </button>
                </div>
              </Field>
            ) : null}
          </div>
        </section>

        <section className="library-panel edit-game-panel">
          <div className="edit-game-panel-head">
            <strong>{form.name || "Untitled Game"}</strong>
          </div>

          <div className="edit-preview-row">
            <MediaPreviewCard
              title="Poster Preview"
              previewClassName="edit-poster-preview"
              backgroundStyle={buildPreviewStyle(posterPreviewSource, form.coverPositionX, form.coverPositionY, form.coverZoom)}
              fallback={<span>{getInitials(form.name)}</span>}
              positionX={form.coverPositionX}
              positionY={form.coverPositionY}
              zoom={form.coverZoom}
              onReset={() => resetMediaTransform("cover")}
              onPositionXChange={(value) => handleMediaPositionChange("cover", "X", value)}
              onPositionYChange={(value) => handleMediaPositionChange("cover", "Y", value)}
              onZoomChange={(value) => handleMediaZoomChange("cover", value)}
              zoomLabel="Zoom"
              xLabel="Pos X"
              yLabel="Pos Y"
            />

            <MediaPreviewCard
              title="Backdrop Preview"
              previewClassName="edit-backdrop-preview"
              backgroundStyle={buildPreviewStyle(backdropPreviewSource, form.backdropPositionX, form.backdropPositionY, form.backdropZoom)}
              fallback={<span>{form.name || "Backdrop Preview"}</span>}
              positionX={form.backdropPositionX}
              positionY={form.backdropPositionY}
              zoom={form.backdropZoom}
              onReset={() => resetMediaTransform("backdrop")}
              onPositionXChange={(value) => handleMediaPositionChange("backdrop", "X", value)}
              onPositionYChange={(value) => handleMediaPositionChange("backdrop", "Y", value)}
              onZoomChange={(value) => handleMediaZoomChange("backdrop", value)}
              zoomLabel="Zoom"
              xLabel="Pos X"
              yLabel="Pos Y"
            />
          </div>

          {form.useTitleLogo ? (
            <div className="edit-preview-row edit-preview-row-single">
              <LogoPreviewCard
                title="Title Logo Preview"
                imageUrl={titleLogoPreviewSource}
                fallback={<span>{form.name || "Game Logo"}</span>}
                positionX={form.titleLogoPositionX}
                positionY={form.titleLogoPositionY}
                zoom={form.titleLogoZoom}
                onReset={() => resetMediaTransform("titleLogo")}
                onPositionXChange={(value) => handleMediaPositionChange("titleLogo", "X", value)}
                onPositionYChange={(value) => handleMediaPositionChange("titleLogo", "Y", value)}
                onZoomChange={(value) => handleMediaZoomChange("titleLogo", value)}
              />
            </div>
          ) : null}
        </section>

        <section className="edit-game-actions">
          {hasIgdbLink ? (
            <button
              type="button"
              className="action-button action-button-igdb-reset edit-game-reset-button"
              onClick={handleReset}
              disabled={resetting || saving}
            >
              <RefreshIcon />
              <span>{resetting ? "Resetting..." : "Reset"}</span>
            </button>
          ) : null}
          <button type="button" className="action-button action-button-danger" onClick={handleCancel} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className="action-button action-button-primary" disabled={loading || saving}>
            <PencilIcon />
            <span>{saving ? "Saving..." : "Save Changes"}</span>
          </button>
        </section>
      </form>

      {confirmState ? (
        <div className="confirm-modal-overlay" role="presentation" onClick={() => setConfirmState(null)}>
          <section
            className="confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-confirm-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="confirm-modal-head">
              <strong id="edit-confirm-title">{confirmState.title}</strong>
            </div>
            <p>{confirmState.message}</p>
            <div className="confirm-modal-actions">
              <button type="button" className="action-button action-button-browse" onClick={() => setConfirmState(null)}>
                Keep Editing
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

      {resetting ? (
        <div className="confirm-modal-overlay edit-game-loading-overlay" role="presentation">
          <LoadingIndicator label="Resetting game info..." />
        </div>
      ) : null}
    </div>
  );
}

function MediaPreviewCard({
  title,
  previewClassName,
  backgroundStyle,
  fallback,
  positionX,
  positionY,
  zoom,
  onReset,
  onPositionXChange,
  onPositionYChange,
  onZoomChange,
  zoomLabel,
  xLabel,
  yLabel,
}) {
  const safeZoom = clampZoom(zoom);
  const safePositionX = clampPosition(positionX);
  const safePositionY = clampPosition(positionY);

  return (
    <div className="edit-preview-card">
      <h3>{title}</h3>
      <div className={previewClassName}>
        <div className="edit-preview-media" style={backgroundStyle}>
          {!backgroundStyle.backgroundImage ? fallback : null}
        </div>
        <button type="button" className="action-button edit-preview-reset" onClick={onReset}>
          Reset Position
        </button>
      </div>

      <div className="edit-preview-controls">
        <RangeControl label={zoomLabel} value={safeZoom} min={MIN_ZOOM} max={MAX_ZOOM} onChange={onZoomChange} />
        <RangeControl label={xLabel} value={safePositionX} min={0} max={100} onChange={onPositionXChange} />
        <RangeControl label={yLabel} value={safePositionY} min={0} max={100} onChange={onPositionYChange} />
      </div>
    </div>
  );
}

function LogoPreviewCard({
  title,
  imageUrl,
  fallback,
  positionX,
  positionY,
  zoom,
  onReset,
  onPositionXChange,
  onPositionYChange,
  onZoomChange,
}) {
  const imageStyle = {
    ...buildLogoPresentationStyle(positionX, positionY, zoom),
  };
  const safeZoom = clampZoom(zoom);
  const safePositionX = clampPosition(positionX);
  const safePositionY = clampPosition(positionY);

  return (
    <div className="edit-preview-card">
      <h3>{title}</h3>
      <div className="edit-title-logo-layout">
        <div className="edit-title-logo-preview">
          <div className="edit-title-logo-preview-frame">
            {imageUrl ? (
              <img className="edit-title-logo-preview-image drop-shadow-2xl" src={imageUrl} alt="Title logo preview" style={imageStyle} />
            ) : (
              <div className="edit-title-logo-preview-fallback">{fallback}</div>
            )}
            <button type="button" className="action-button edit-preview-reset edit-title-logo-reset" onClick={onReset}>
              Reset Position
            </button>
          </div>
        </div>

        <div className="edit-preview-controls edit-title-logo-controls">
          <RangeControl label="Zoom" value={safeZoom} min={MIN_ZOOM} max={MAX_ZOOM} onChange={onZoomChange} />
          <RangeControl label="Pos X" value={safePositionX} min={0} max={100} onChange={onPositionXChange} />
          <RangeControl label="Pos Y" value={safePositionY} min={0} max={100} onChange={onPositionYChange} />
        </div>
      </div>
    </div>
  );
}

function ChoicePicker({
  selectedItems,
  options,
  placeholder,
  emptyLabel,
  onToggleItem,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const availableOptions = options.filter((item) => !selectedItems.includes(item));
  const rootRef = useRef(null);

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
    <div ref={rootRef} className="choice-picker">
      <div className="choice-picker-dropdown">
        <button
          type="button"
          className={`choice-picker-trigger${isOpen ? " is-open" : ""}`}
          onClick={() => setIsOpen((current) => !current)}
        >
          <span>{placeholder}</span>
          <i className="choice-picker-trigger-icon" aria-hidden="true">
            <ChevronDownIcon />
          </i>
        </button>

        {isOpen ? (
          <div className="choice-picker-panel">
            <div className="choice-picker-option-list">
              {availableOptions.length ? (
                availableOptions.map((item) => (
                  <button
                    key={item}
                    type="button"
                    className="choice-picker-option"
                    onClick={() => {
                      onToggleItem(item);
                      setIsOpen(false);
                    }}
                  >
                    {item}
                  </button>
                ))
              ) : (
                <span className="choice-picker-empty">No available option.</span>
              )}
            </div>
          </div>
        ) : null}
      </div>

      <div className="choice-picker-selected">
        <div className="choice-picker-selected-list">
          {selectedItems.length ? (
            selectedItems.map((item) => (
              <button
                key={item}
                type="button"
                className="choice-picker-badge"
                onClick={() => onToggleItem(item)}
                title="Click to remove"
              >
                <span>{item}</span>
                <strong aria-hidden="true">x</strong>
              </button>
            ))
          ) : (
            <span className="choice-picker-empty">{emptyLabel}</span>
          )}
        </div>
      </div>
    </div>
  );
}

function PopupSelect({ value, options, placeholder, onChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const displayValue = value || placeholder;
  const rootRef = useRef(null);

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
          <div className="choice-picker-option-list">
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

function BrowseDropdown({ onPickFile, onPickFolder, isPicking, disabled }) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;
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
    <div ref={rootRef} className="browse-dropdown-wrapper">
      <button
        type="button"
        className={`action-button action-button-browse browse-dropdown-trigger${isOpen ? " is-open" : ""}`}
        onClick={() => setIsOpen((prev) => !prev)}
        disabled={isPicking || disabled}
      >
        <FolderIcon />
        <span>{isPicking ? "Browsing..." : "Browse"}</span>
        <ChevronDownIcon className="browse-dropdown-chevron" />
      </button>

      {isOpen && (
        <div className="browse-dropdown-panel">
          <button
            type="button"
            className="browse-dropdown-item"
            onClick={() => {
              setIsOpen(false);
              onPickFile();
            }}
          >
            <FolderIcon />
            <span>Choose Decrypted ROM File (.iso)</span>
          </button>
          <button
            type="button"
            className="browse-dropdown-item"
            onClick={() => {
              setIsOpen(false);
              onPickFolder();
            }}
          >
            <FolderIcon />
            <span>Choose Game Folder</span>
          </button>
        </div>
      )}
    </div>
  );
}

function resolveConfirmButtonClass(tone) {
  if (tone === "danger") {
    return "action-button-danger";
  }
  if (tone === "igdb") {
    return "action-button-igdb-reset";
  }
  return "action-button-primary";
}

function RangeControl({ label, value, min, max, onChange }) {
  return (
    <label className="edit-preview-control">
      <div className="edit-preview-range-row">
        <span>{label}</span>
        <input type="range" min={min} max={max} step="1" value={value} onChange={(event) => onChange(event.target.value)} />
        <output>{Math.round(Number(value || 0))}%</output>
      </div>
    </label>
  );
}

function Field({ label, required = false, className = "", children, element = "div" }) {
  const Tag = element;
  return (
    <Tag className={`edit-game-field${className ? ` ${className}` : ""}`}>
      <div className="edit-game-field-label-row">
        {typeof label === "string" ? (
          <span>
            {label}
            {required ? " *" : ""}
          </span>
        ) : (
          <>
            {label}
            {required ? <span className="edit-game-field-required">*</span> : null}
          </>
        )}
      </div>
      {children}
    </Tag>
  );
}

function createEmptyForm() {
  return {
    name: "",
    store: "",
    releaseYear: "",
    ageRatingLabel: "",
    completionStatus: "Backlog",
    executablePath: "",
    summary: "",
    coverUrl: "",
    backdropUrl: "",
    titleLogoUrl: "",
    useTitleLogo: false,
    coverPositionX: DEFAULT_POSITION,
    coverPositionY: DEFAULT_POSITION,
    coverZoom: DEFAULT_ZOOM,
    backdropPositionX: DEFAULT_POSITION,
    backdropPositionY: DEFAULT_POSITION,
    backdropZoom: DEFAULT_ZOOM,
    titleLogoPositionX: DEFAULT_POSITION,
    titleLogoPositionY: DEFAULT_POSITION,
    titleLogoZoom: DEFAULT_ZOOM,
    genres: [],
    platforms: [],
    developersInput: "",
    publishersInput: "",
    playtimeInput: "00:00:00",
  };
}

function buildFormState(detail, fallbackGame) {
  const source = detail || fallbackGame || {};
  const isEmu = String(source.game_type || detail?.game_type || fallbackGame?.game_type || "").toLowerCase() === "emulator"
    || String(source.store || detail?.store || fallbackGame?.store || "").toLowerCase() === "emulator"
    || Boolean(detail?.rom_path || source?.rom_path || detail?.emulator_id || source?.emulator_id || detail?.emulator_name || detail?.emulator_profile_name);

  const rom = detail ? (detail.rom_path || "") : (fallbackGame?.rom_path || "");
  const exe = detail ? (detail.executable_path || "") : (fallbackGame?.executable_path || "");

  return {
    name: String(source.name || ""),
    store: String(source.store || (isEmu ? "Emulator" : "")),
    releaseYear: source.release_year ? String(source.release_year) : "",
    ageRatingLabel: String(detail?.age_rating?.label || ""),
    completionStatus: String(source.completion_status || "Backlog"),
    gameType: isEmu ? "emulator" : "pc",
    romPath: isEmu ? rom : "",
    emulatorId: detail?.emulator_id ?? source.emulator_id ?? null,
    executablePath: isEmu ? rom : exe,
    summary: String(detail?.summary || ""),
    coverUrl: String(source.cover_url || ""),
    backdropUrl: String(source.backdrop_url || ""),
    titleLogoUrl: String(source.title_logo_url || ""),
    useTitleLogo: Boolean(source.use_title_logo),
    coverPositionX: clampPosition(source.cover_position_x),
    coverPositionY: clampPosition(source.cover_position_y),
    coverZoom: clampZoom(source.cover_zoom),
    backdropPositionX: clampPosition(source.backdrop_position_x),
    backdropPositionY: clampPosition(source.backdrop_position_y),
    backdropZoom: clampZoom(source.backdrop_zoom),
    titleLogoPositionX: clampPosition(source.title_logo_position_x),
    titleLogoPositionY: clampPosition(source.title_logo_position_y),
    titleLogoZoom: clampZoom(source.title_logo_zoom),
    genres: normalizeGenreItems(detail?.genres),
    platforms: normalizePlatformItems(detail?.platforms),
    developersInput: joinList(Array.isArray(detail?.developers) ? detail.developers : []),
    publishersInput: joinList(Array.isArray(detail?.publishers) ? detail.publishers : []),
    playtimeInput: formatDurationInputValue(source.total_seconds || 0),
    userRating: detail?.user_rating ?? source?.user_rating ?? null,
    userReview: String(detail?.user_review || source?.user_review || ""),
  };
}

function syncFormState(formRef, setForm, nextForm) {
  formRef.current = nextForm;
  setForm(nextForm);
}

function buildPreviewStyle(imageUrl, positionX, positionY, zoom) {
  return {
    backgroundImage: imageUrl
      ? `url("${imageUrl}")`
      : "radial-gradient(circle at top, rgba(89, 138, 255, 0.18), transparent 42%), linear-gradient(135deg, #152030, #0b1118)",
    backgroundPosition: `${clampPosition(positionX)}% ${clampPosition(positionY)}%`,
    transformOrigin: `${clampPosition(positionX)}% ${clampPosition(positionY)}%`,
    "--media-zoom": String(clampZoom(zoom) / 100),
  };
}

function limitGameNameInput(value) {
  return String(value || "").slice(0, MAX_GAME_NAME_LENGTH);
}

function clampPosition(value) {
  if (value === null || value === undefined || value === "") {
    return DEFAULT_POSITION;
  }
  const nextValue = Number(value);
  if (!Number.isFinite(nextValue)) {
    return DEFAULT_POSITION;
  }
  return Math.max(0, Math.min(100, nextValue));
}

function clampZoom(value) {
  if (value === null || value === undefined || value === "") {
    return DEFAULT_ZOOM;
  }
  const nextValue = Number(value);
  if (!Number.isFinite(nextValue)) {
    return DEFAULT_ZOOM;
  }
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, nextValue));
}

function splitList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function joinList(items) {
  return (Array.isArray(items) ? items : []).join(", ");
}

function formatDurationInputValue(seconds) {
  const totalSeconds = Math.max(0, Math.floor(Number(seconds || 0)));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

function parseDurationInputValue(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return 0;
  }

  if (/^\d+$/.test(raw)) {
    return Number(raw);
  }

  const parts = raw.split(":").map((part) => part.trim());
  if (parts.some((part) => !/^\d+$/.test(part))) {
    throw new Error("Playtime must use hh:mm:ss, mm:ss, or seconds only.");
  }

  if (parts.length === 2) {
    const [minutes, seconds] = parts.map(Number);
    return minutes * 60 + seconds;
  }

  if (parts.length === 3) {
    const [hours, minutes, seconds] = parts.map(Number);
    return hours * 3600 + minutes * 60 + seconds;
  }

  throw new Error("Playtime must use hh:mm:ss, mm:ss, or seconds only.");
}

function normalizePlatformItems(items) {
  return uniqueValues((Array.isArray(items) ? items : []).map(normalizePlatformLabel).filter(Boolean));
}

function normalizePlatformLabel(value) {
  const label = String(value || "").trim();
  if (!label) {
    return "";
  }

  const lower = label.toLowerCase();
  if (lower === "pc" || lower.includes("windows") || lower.startsWith("pc (")) {
    return "PC (Microsoft Windows)";
  }
  if (lower.includes("playstation 5") || lower === "ps5") {
    return "PlayStation 5";
  }
  if (lower.includes("playstation 4") || lower === "ps4") {
    return "PlayStation 4";
  }
  if (lower === "playstation") {
    return "PlayStation";
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
  if (lower.includes("switch")) {
    return "Nintendo Switch";
  }
  if (lower.includes("steam deck")) {
    return "Steam Deck";
  }
  if (lower === "ios") {
    return "iOS";
  }
  if (lower.includes("android")) {
    return "Android";
  }

  return label;
}

function normalizeGenreItems(items) {
  return uniqueValues((Array.isArray(items) ? items : []).map(normalizeGenreLabel).filter(Boolean));
}

function normalizeGenreLabel(value) {
  const label = String(value || "").trim();
  if (!label) {
    return "";
  }

  const lower = label.toLowerCase();
  if (lower === "rpg") {
    return "Role-playing (RPG)";
  }
  if (lower === "real time strategy (rts)" || lower === "rts") {
    return "Real Time Strategy (RTS)";
  }
  if (lower === "turn-based strategy (tbs)" || lower === "tbs") {
    return "Turn-based strategy (TBS)";
  }

  return label;
}

function uniqueValues(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = String(item).toLowerCase();
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
