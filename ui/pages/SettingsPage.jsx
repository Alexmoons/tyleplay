import React, { useEffect, useRef, useState } from "react";
import { invoke } from "../lib/tauri";
import tauriConfig from "../../src-tauri/tauri.conf.json";
import {
  CalendarIcon,
  ChevronDownIcon,
  ClockIcon,
  CogIcon,
  DatabaseIcon,
  FacebookIcon,
  GithubIcon,
  GlobeIcon,
  InfoCircleIcon,
  InstagramIcon,
  MailIcon,
  MonitorIcon,
  MoonIcon,
  ShieldIcon,
  SunIcon,
  TelegramIcon,
  TrashIcon,
  UserIcon,
} from "../components/icons";
import UserSettingsTab from "./settings/UserSettingsTab";
import {
  DEFAULT_USER_SETTINGS,
  buildSocialLinksFromUserSettings,
  fetchUserSettings,
  migrateLegacyUserSettingsIfNeeded,
  notifyUserSettingsUpdated,
  persistUserSettings,
} from "./settings/user-settings-storage";

const SETTINGS_TABS = [
  { id: "general", label: "General", icon: <CogIcon /> },
  { id: "advance", label: "Advanced", icon: <ShieldIcon /> },
  { id: "user", label: "User", icon: <UserIcon /> },
  { id: "about", label: "About", icon: <InfoCircleIcon /> },
];

const DEFAULT_PAGE_OPTIONS = [
  { value: "dashboard", label: "Dashboard" },
  { value: "library", label: "Library" },
  { value: "archive", label: "Archive" },
];

const LANGUAGE_OPTIONS = [
  { value: "English", label: "English" },
  { value: "Indonesia", label: "Indonesia", disabled: true },
];
const TIMEZONE_OPTIONS = [
  { value: "(GMT+7) Jakarta", label: "(GMT+7) Jakarta" },
  { value: "(GMT+8) Singapore", label: "(GMT+8) Singapore" },
  { value: "(GMT+9) Tokyo", label: "(GMT+9) Tokyo" },
];
const DATE_FORMAT_OPTIONS = [
  { value: "May 25, 2026", label: "May 25, 2026" },
  { value: "25 May 2026", label: "25 May 2026" },
  { value: "2026-05-25", label: "2026-05-25" },
];
const TIME_FORMAT_OPTIONS = [
  { value: "12h", label: "12h (AM/PM)" },
  { value: "24h", label: "24h" },
];
const TOP_GAME_ARTWORK_OPTIONS = [
  { value: "poster", label: "Vertical" },
  { value: "capsule", label: "Horizontal" },
];
const THEME_OPTIONS = [
  { value: "dark", label: "Dark" },
  { value: "light", label: "Light", disabled: true },
];
const PLAYTIME_DISPLAY_MODE_OPTIONS = [
  { value: "standard", label: "Standard" },
  { value: "hours_only", label: "Hours Only" },
];
const GENERAL_SETTINGS_SAVE_DELAY_MS = 180;

const APP_VERSION = String(tauriConfig.version || "Unknown");
const DEVELOPER_SOCIAL_LINKS = {
  github: "https://github.com/Alexmoons",
  instagram: "",
  facebook: "",
  telegram: "https://t.me/Ramth3",
  email: "mailto:virgopurple55@outlook.com",
};

export default function SettingsPage({
  appSettings,
  initialIgdbSettings = null,
  initialSystemInfo = null,
  onAppSettingsCommitted,
  onThemePreview,
  onNotify,
  onRefreshLibrary,
  onUserSettingsDirtyChange,
  onRequestConfirm,
}) {
  const [activeTab, setActiveTab] = useState("general");
  const [generalSettings, setGeneralSettings] = useState(appSettings);
  const [savingGeneral, setSavingGeneral] = useState(false);
  const [savingIgdb, setSavingIgdb] = useState(false);
  const [clearingData, setClearingData] = useState(false);
  const [igdbSettings, setIgdbSettings] = useState(() => (
    initialIgdbSettings && typeof initialIgdbSettings === "object"
      ? initialIgdbSettings
      : {
        client_id: "",
        has_client_secret: false,
      }
  ));
  const [igdbForm, setIgdbForm] = useState(() => ({
    clientId: String(initialIgdbSettings?.client_id || ""),
    clientSecret: "",
  }));
  const [hasLoadedIgdbSettings, setHasLoadedIgdbSettings] = useState(Boolean(initialIgdbSettings && typeof initialIgdbSettings === "object"));
  const [systemInfo, setSystemInfo] = useState(() => (
    initialSystemInfo && typeof initialSystemInfo === "object"
      ? {
        os: String(initialSystemInfo.os || "Unknown"),
      }
      : {
        os: "Unknown",
      }
  ));
  const [userSettings, setUserSettings] = useState(DEFAULT_USER_SETTINGS);
  const [hasUnsavedUserChanges, setHasUnsavedUserChanges] = useState(false);
  const [hasLoadedSystemInfo, setHasLoadedSystemInfo] = useState(Boolean(initialSystemInfo && typeof initialSystemInfo === "object"));
  const notifyRef = useRef(onNotify);
  const pendingGeneralSettingsRef = useRef(appSettings);
  const committedGeneralSettingsRef = useRef(appSettings);
  const generalSaveTimerRef = useRef(null);
  const generalSaveInFlightRef = useRef(false);
  const generalSaveMessageRef = useRef("");

  useEffect(() => {
    notifyRef.current = onNotify;
  }, [onNotify]);

  useEffect(() => {
    onUserSettingsDirtyChange?.(hasUnsavedUserChanges);
  }, [hasUnsavedUserChanges, onUserSettingsDirtyChange]);

  useEffect(() => {
    let cancelled = false;

    async function loadUserSettings() {
      try {
        const migratedSettings = await migrateLegacyUserSettingsIfNeeded();
        const nextSettings = migratedSettings || await fetchUserSettings();
        if (!cancelled) {
          setUserSettings(nextSettings);
          notifyUserSettingsUpdated(nextSettings);
        }
      } catch (error) {
        if (!cancelled) {
          notifyRef.current?.({
            tone: "danger",
            title: "Unable to load user settings.",
            message: error?.message || String(error),
          });
        }
      }
    }

    loadUserSettings();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (activeTab !== "advance" || hasLoadedIgdbSettings) {
      return undefined;
    }

    let cancelled = false;

    async function loadIgdbSettings() {
      try {
        const nextSettings = await invoke("get_igdb_settings");
        if (cancelled || !nextSettings || typeof nextSettings !== "object") {
          return;
        }
        setIgdbSettings(nextSettings);
        setIgdbForm({
          clientId: String(nextSettings.client_id || ""),
          clientSecret: "",
        });
        setHasLoadedIgdbSettings(true);
      } catch (error) {
        if (!cancelled) {
          onNotify?.({
            tone: "danger",
            title: "Unable to load IGDB settings.",
            message: error?.message || String(error),
          });
        }
      }
    }

    loadIgdbSettings();
    return () => {
      cancelled = true;
    };
  }, [activeTab, hasLoadedIgdbSettings, onNotify]);

  useEffect(() => {
    if (activeTab !== "about" || hasLoadedSystemInfo) {
      return undefined;
    }

    let cancelled = false;

    async function loadSystemInfo() {
      try {
        const nextInfo = await invoke("get_app_system_info");
        if (cancelled || !nextInfo || typeof nextInfo !== "object") {
          return;
        }

        setSystemInfo({
          os: String(nextInfo.os || "Unknown"),
        });
        setHasLoadedSystemInfo(true);
      } catch {
        if (!cancelled) {
          setSystemInfo({
            os: resolveOsLabelFallback(),
          });
          setHasLoadedSystemInfo(true);
        }
      }
    }

    loadSystemInfo();
    return () => {
      cancelled = true;
    };
  }, [activeTab, hasLoadedSystemInfo]);

  useEffect(() => {
    setGeneralSettings(appSettings);
    pendingGeneralSettingsRef.current = appSettings;
    committedGeneralSettingsRef.current = appSettings;
  }, [
    appSettings.app_theme,
    appSettings.close_to_system_tray,
    appSettings.default_page,
    appSettings.language,
    appSettings.playtime_display_mode,
    appSettings.start_on_system_startup,
    appSettings.top_game_artwork,
  ]);

  useEffect(() => {
    return () => {
      if (generalSaveTimerRef.current) {
        window.clearTimeout(generalSaveTimerRef.current);
      }
    };
  }, []);

  function handleSettingsTabChange(nextTabId) {
    if (nextTabId === activeTab) {
      return;
    }

    if (activeTab === "user" && hasUnsavedUserChanges) {
      onRequestConfirm?.({
        title: "Leave User Settings",
        message: "You have unsaved changes in User settings. Leave this tab anyway?",
        confirmLabel: "Leave Tab",
        cancelLabel: "Stay Here",
        tone: "danger",
        onConfirm: () => setActiveTab(nextTabId),
      });
      return;
    }

    setActiveTab(nextTabId);
  }

  async function persistAppSettings(nextSettings) {
    await invoke("save_app_settings", {
      startOnSystemStartup: Boolean(nextSettings.start_on_system_startup),
      closeToSystemTray: Boolean(nextSettings.close_to_system_tray),
      defaultPage: String(nextSettings.default_page || "dashboard"),
      language: String(nextSettings.language || "English"),
      appTheme: String(nextSettings.app_theme || "dark"),
      topGameArtwork: String(nextSettings.top_game_artwork || "capsule"),
      playtimeDisplayMode: String(nextSettings.playtime_display_mode || "standard"),
    });
  }

  async function flushGeneralSettingsSave() {
    if (generalSaveInFlightRef.current) {
      return;
    }

    const nextSettings = pendingGeneralSettingsRef.current;
    const previousCommittedSettings = committedGeneralSettingsRef.current;
    if (areAppSettingsEqual(previousCommittedSettings, nextSettings)) {
      setSavingGeneral(false);
      return;
    }

    generalSaveInFlightRef.current = true;
    generalSaveTimerRef.current = null;

    try {
      await persistAppSettings(nextSettings);
      committedGeneralSettingsRef.current = nextSettings;
      onAppSettingsCommitted?.(nextSettings);
      if (generalSaveMessageRef.current && areAppSettingsEqual(pendingGeneralSettingsRef.current, nextSettings)) {
        onNotify?.({
          tone: "success",
          title: "Settings updated.",
          ...(typeof generalSaveMessageRef.current === "string"
            ? { message: generalSaveMessageRef.current }
            : generalSaveMessageRef.current),
        });
      }
    } catch (error) {
      committedGeneralSettingsRef.current = previousCommittedSettings;
      pendingGeneralSettingsRef.current = previousCommittedSettings;
      setGeneralSettings(previousCommittedSettings);
      onThemePreview?.(previousCommittedSettings.app_theme);
      onNotify?.({
        tone: "danger",
        title: "Unable to save settings.",
        message: error?.message || String(error),
      });
    } finally {
      generalSaveInFlightRef.current = false;
      if (!areAppSettingsEqual(pendingGeneralSettingsRef.current, committedGeneralSettingsRef.current)) {
        generalSaveTimerRef.current = window.setTimeout(() => {
          flushGeneralSettingsSave();
        }, GENERAL_SETTINGS_SAVE_DELAY_MS);
      } else {
        setSavingGeneral(false);
      }
    }
  }

  function queueGeneralSettingsSave(nextSettings, successMessage) {
    pendingGeneralSettingsRef.current = nextSettings;
    generalSaveMessageRef.current = successMessage || "";
    setSavingGeneral(true);

    if (generalSaveTimerRef.current) {
      window.clearTimeout(generalSaveTimerRef.current);
    }

    generalSaveTimerRef.current = window.setTimeout(() => {
      flushGeneralSettingsSave();
    }, GENERAL_SETTINGS_SAVE_DELAY_MS);
  }

  function handleGeneralChange(patch, successMessage) {
    const nextSettings = { ...generalSettings, ...patch };
    if (areAppSettingsEqual(generalSettings, nextSettings)) {
      return;
    }

    setGeneralSettings(nextSettings);
    if (Object.prototype.hasOwnProperty.call(patch, "app_theme")) {
      onThemePreview?.(nextSettings.app_theme);
    }
    queueGeneralSettingsSave(nextSettings, successMessage);
  }

  async function handleUserPreferenceChange(field, value) {
    const nextUserSettings = {
      ...userSettings,
      [field]: value,
    };
    setUserSettings(nextUserSettings);

    if (field === "language") {
      handleGeneralChange(
        { language: value },
        { messagePrefix: "Language set to ", messageStrong: value }
      );
    }

    try {
      const saved = await persistUserSettings(nextUserSettings);
      setUserSettings(saved);
      const fieldLabel =
        field === "dateFormat"
          ? "Date Format"
          : field === "timeFormat"
            ? "Time Format"
            : field === "timezone"
              ? "Timezone"
              : "Language";
      onNotify?.({
        tone: "success",
        title: "Preference updated.",
        message: `${fieldLabel} set to ${value}.`,
      });
    } catch (error) {
      onNotify?.({
        tone: "danger",
        title: "Unable to update preference.",
        message: error?.message || String(error),
      });
    }
  }

  async function handleSaveIgdbSettings(event) {
    event.preventDefault();
    setSavingIgdb(true);

    try {
      await invoke("save_igdb_settings", {
        clientId: igdbForm.clientId,
        clientSecret: igdbForm.clientSecret,
      });
      const nextSettings = await invoke("get_igdb_settings");
      setIgdbSettings(nextSettings);
      setIgdbForm((current) => ({ ...current, clientSecret: "" }));
      onNotify?.({
        tone: "success",
        title: "IGDB settings saved.",
        message: "Client ID and secret have been updated.",
      });
    } catch (error) {
      onNotify?.({
        tone: "danger",
        title: "Unable to save IGDB settings.",
        message: error?.message || String(error),
      });
    } finally {
      setSavingIgdb(false);
    }
  }

  async function handleClearLocalData() {
    if (!window.confirm("Delete the local game database and archive database? This cannot be undone.")) {
      return;
    }

    setClearingData(true);
    try {
      await invoke("clear_local_data");
      await onRefreshLibrary?.();
      onNotify?.({
        tone: "success",
        title: "Database deleted.",
        message: "Game, session, archive, and notification data were removed.",
      });
    } catch (error) {
      onNotify?.({
        tone: "danger",
        title: "Unable to delete database.",
        message: error?.message || String(error),
      });
    } finally {
      setClearingData(false);
    }
  }

  function handleDeleteAccount() {
    onRequestConfirm?.({
      title: "Delete Account",
      message: "Delete this local account profile and regenerate its account information? Game database data will not be removed.",
      confirmLabel: "Delete Account",
      cancelLabel: "Cancel",
      tone: "danger",
      onConfirm: async () => {
        try {
          const nextSettings = await invoke("delete_user_account");
          setUserSettings(nextSettings);
          notifyUserSettingsUpdated(nextSettings);
          onNotify?.({
            tone: "success",
            title: "Account deleted.",
            message: "Local account information was removed and recreated. Database data was not deleted.",
          });
        } catch (error) {
          onNotify?.({
            tone: "danger",
            title: "Unable to delete account.",
            message: error?.message || String(error),
          });
        }
      },
    });
  }

  return (
    <section className="settings-page">
      <header className="page-header settings-page-header">
        <div className="page-heading">
          <h1>Settings</h1>
        </div>
      </header>

      <div className="settings-tabs" role="tablist" aria-label="Settings sections">
        {SETTINGS_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={activeTab === tab.id ? "is-active" : ""}
            aria-pressed={activeTab === tab.id}
            onClick={() => handleSettingsTabChange(tab.id)}
          >
            <span className="settings-tab-icon" aria-hidden="true">{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {activeTab === "user" ? (
        <section className="settings-content-shell settings-content-user">
          <UserSettingsTab
            userSettings={userSettings}
            onNotify={onNotify}
            onUserSettingsSaved={setUserSettings}
            onDirtyChange={setHasUnsavedUserChanges}
            onRequestConfirm={onRequestConfirm}
          />
        </section>
      ) : null}

      {activeTab === "general" ? (
        <section className="settings-content-shell settings-content-general">
          <section className="settings-panel-card">
            <strong className="settings-panel-title">General</strong>

            <SettingsRow
              title="Start on system startup"
              control={(
                <ToggleSwitch
                  checked={Boolean(generalSettings.start_on_system_startup)}
                  disabled={false}
                  onChange={(checked) => handleGeneralChange(
                    { start_on_system_startup: checked },
                    checked
                      ? { messagePrefix: "Start on system startup ", messageStrong: "enabled" }
                      : { messagePrefix: "Start on system startup ", messageStrong: "disabled" }
                  )}
                />
              )}
            />

            <SettingsRow
              title="Close to system tray"
              control={(
                <ToggleSwitch
                  checked={Boolean(generalSettings.close_to_system_tray)}
                  disabled={false}
                  onChange={(checked) => handleGeneralChange(
                    { close_to_system_tray: checked },
                    checked
                      ? { messagePrefix: "Close to system tray ", messageStrong: "enabled" }
                      : { messagePrefix: "Close to system tray ", messageStrong: "disabled" }
                  )}
                />
              )}
            />

            <SettingsRow
              title="Default Page"
              control={(
                <InlineSelect
                  icon={<MonitorIcon />}
                  value={generalSettings.default_page || "dashboard"}
                  options={DEFAULT_PAGE_OPTIONS}
                  disabled={false}
                  onChange={(value) => handleGeneralChange(
                    { default_page: value },
                    { messagePrefix: "Default Page set to ", messageStrong: findOptionLabel(DEFAULT_PAGE_OPTIONS, value) }
                  )}
                />
              )}
            />

            <SettingsRow
              title="Theme"
              control={(
                <InlineSelect
                  icon={String(generalSettings.app_theme || "dark") === "light" ? <SunIcon /> : <MoonIcon />}
                  value={generalSettings.app_theme || "dark"}
                  options={THEME_OPTIONS}
                  disabled={false}
                  onChange={(value) => handleGeneralChange(
                    { app_theme: value },
                    { messagePrefix: "Theme set to ", messageStrong: findOptionLabel(THEME_OPTIONS, value) }
                  )}
                />
              )}
            />

            <SettingsRow
              title="Top Game Artwork"
              control={(
                <InlineSelect
                  icon={<MonitorIcon />}
                  value={generalSettings.top_game_artwork || "capsule"}
                  options={TOP_GAME_ARTWORK_OPTIONS}
                  disabled={false}
                  onChange={(value) => handleGeneralChange(
                    { top_game_artwork: value },
                    { messagePrefix: "Top Game Artwork set to ", messageStrong: findOptionLabel(TOP_GAME_ARTWORK_OPTIONS, value) }
                  )}
                />
              )}
            />

            <SettingsRow
              title="Playtime Format"
              control={(
                <InlineSelect
                  icon={<MonitorIcon />}
                  value={generalSettings.playtime_display_mode || "standard"}
                  options={PLAYTIME_DISPLAY_MODE_OPTIONS}
                  disabled={false}
                  onChange={(value) => handleGeneralChange(
                    { playtime_display_mode: value },
                    { messagePrefix: "Playtime Format set to ", messageStrong: findOptionLabel(PLAYTIME_DISPLAY_MODE_OPTIONS, value) }
                  )}
                />
              )}
              noDivider
            />
            {savingGeneral ? <span className="settings-save-hint">Applying changes...</span> : null}
          </section>

          <section className="settings-panel-card">
            <strong className="settings-panel-title">Preferences</strong>

            <SettingsRow
              title="Language"
              control={(
                <InlineSelect
                  icon={<GlobeIcon />}
                  value={userSettings.language || "English"}
                  options={LANGUAGE_OPTIONS}
                  disabled={false}
                  onChange={(value) => handleUserPreferenceChange("language", value)}
                />
              )}
            />



            <SettingsRow
              title="Date Format"
              control={(
                <InlineSelect
                  icon={<CalendarIcon />}
                  value={userSettings.dateFormat || "May 25, 2026"}
                  options={DATE_FORMAT_OPTIONS}
                  disabled={false}
                  onChange={(value) => handleUserPreferenceChange("dateFormat", value)}
                />
              )}
            />

            <SettingsRow
              title="Time Format"
              control={(
                <InlineSelect
                  icon={<ClockIcon />}
                  value={userSettings.timeFormat || "24 Hour (19:30)"}
                  options={TIME_FORMAT_OPTIONS}
                  disabled={false}
                  onChange={(value) => handleUserPreferenceChange("timeFormat", value)}
                />
              )}
              noDivider
            />
          </section>
        </section>
      ) : null}

      {activeTab === "advance" ? (
        <section className="settings-content-shell settings-content-advance">
          <div className="settings-advance-grid">
            <section className="settings-panel-advance">
              <strong className="settings-panel-title">IGDB API</strong>
              <form className="settings-form" onSubmit={handleSaveIgdbSettings}>
                <label className="settings-field">
                  <span>IGDB Client ID</span>
                  <input
                    type="text"
                    autoComplete="off"
                    placeholder="Provided by default, but if you experience issues please fill in with your own"
                    value={igdbForm.clientId}
                    onChange={(event) => setIgdbForm((current) => ({ ...current, clientId: event.target.value }))}
                  />
                </label>

                <label className="settings-field">
                  <span>IGDB Client Secret</span>
                  <input
                    type="password"
                    autoComplete="off"
                    placeholder="Provided by default, but if you experience issues please fill in with your own"
                    value={igdbForm.clientSecret}
                    onChange={(event) => setIgdbForm((current) => ({ ...current, clientSecret: event.target.value }))}
                  />
                </label>

                <div className="settings-panel-actions">
                  <button type="submit" className="action-button action-button-primary" disabled={savingIgdb}>
                    <span>{savingIgdb ? "Saving..." : "Save IGDB API"}</span>
                  </button>
                </div>
              </form>
            </section>

            <section className="settings-panel-advance">
              <strong className="settings-panel-title">Data</strong>
              <div className="settings-danger-list">
                <div className="settings-danger-block">
                  <div className="settings-danger-copy">
                    <div className="settings-danger-icon">
                      <TrashIcon />
                    </div>
                    <div>
                      <strong>Delete Account</strong>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="settings-danger-button"
                    onClick={handleDeleteAccount}
                  >
                    Delete Account
                  </button>
                </div>

                <div className="settings-danger-block">
                  <div className="settings-danger-copy">
                    <div className="settings-danger-icon">
                      <DatabaseIcon />
                    </div>
                    <div>
                      <strong>Delete Database</strong>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="settings-danger-button"
                    disabled={clearingData}
                    onClick={handleClearLocalData}
                  >
                    {clearingData ? "Deleting..." : "Delete Database"}
                  </button>
                </div>
              </div>
            </section>
          </div>
        </section>
      ) : null}

      {activeTab === "about" ? (
        <section className="settings-content-shell settings-content-about">
          <section className="settings-panel-about">
            <strong className="settings-panel-title">About</strong>
            <div className="settings-about-simple">
              <span>----------------------------------------------------------</span>
              <strong>TylePlay</strong>
              <span>Version: {APP_VERSION}</span>
              <span>OS: {systemInfo.os}</span>
              <span>Cr: Alexmoons/Artyle</span>
              <span>----------------------------------------------------------</span>
              <span>If any bug or error, please tell me!</span>
              <span>----------------------------------------------------------</span>
            </div>

            <div className="settings-about-socials" aria-label="Developer social links">
              <SocialLink href={DEVELOPER_SOCIAL_LINKS.github} label="GitHub" icon={<GithubIcon />} type="github" />
              <SocialLink href={DEVELOPER_SOCIAL_LINKS.telegram} label="Telegram" icon={<TelegramIcon />} type="telegram" />
              <SocialLink href={DEVELOPER_SOCIAL_LINKS.email} label="Email: virgopurple55@outlook.com" icon={<MailIcon />} type="email" />
            </div>
          </section>
        </section>
      ) : null}
    </section>
  );
}

function SettingsRow({ title, control, noDivider = false }) {
  return (
    <div className={`settings-row${noDivider ? " is-last" : ""}`}>
      <div className="settings-row-copy">
        <strong>{title}</strong>
      </div>
      <div className="settings-row-control">{control}</div>
    </div>
  );
}

function ToggleSwitch({ checked, disabled, onChange }) {
  return (
    <button
      type="button"
      className={`settings-toggle${checked ? " is-active" : ""}`}
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  );
}

function InlineSelect({ icon, value, options, disabled, onChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef(null);
  const activeLabel = findOptionLabel(options, value);

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
    <div
      ref={rootRef}
      className={`settings-inline-select${disabled ? " is-disabled" : ""}${isOpen ? " is-open" : ""}`}
    >
      <span className="settings-inline-select-icon">{icon}</span>
      <button
        type="button"
        className="settings-inline-select-trigger"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
      >
        <span>{activeLabel}</span>
        <ChevronDownIcon />
      </button>

      {isOpen ? (
        <div className="settings-inline-select-menu" role="listbox">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={option.value === value}
              disabled={Boolean(option.disabled)}
              className={`settings-inline-select-option${option.value === value ? " is-selected" : ""}${option.disabled ? " is-disabled" : ""}`}
              onClick={() => {
                if (option.disabled) return;
                onChange(option.value);
                setIsOpen(false);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SocialLink({ href, label, icon, type = "github" }) {
  async function handleClick(event) {
    event.preventDefault();
    try {
      await invoke("open_external_url", { url: href });
    } catch {
      if (typeof window !== "undefined") {
        window.open(href, "_blank", "noopener,noreferrer");
      }
    }
  }

  return (
    <a
      className={`settings-social-link social-link-${type}`}
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label={label}
      title={label}
      onClick={handleClick}
    >
      {icon}
    </a>
  );
}

function findOptionLabel(options, value) {
  return options.find((option) => option.value === value)?.label || options[0]?.label || "";
}

function areAppSettingsEqual(left, right) {
  return (
    left?.start_on_system_startup === right?.start_on_system_startup &&
    left?.close_to_system_tray === right?.close_to_system_tray &&
    left?.default_page === right?.default_page &&
    left?.language === right?.language &&
    left?.app_theme === right?.app_theme &&
    left?.top_game_artwork === right?.top_game_artwork &&
    left?.playtime_display_mode === right?.playtime_display_mode
  );
}

function resolveOsLabelFallback() {
  if (typeof navigator === "undefined") {
    return "Unknown";
  }

  const platform = String(navigator.userAgentData?.platform || navigator.platform || navigator.userAgent || "").toLowerCase();
  if (platform.includes("win")) {
    return "Windows";
  }
  if (platform.includes("mac")) {
    return "macOS";
  }
  if (platform.includes("linux")) {
    return "Linux";
  }
  return "Unknown";
}
