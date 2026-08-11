import { invoke } from "../../lib/tauri";

const LEGACY_USER_SETTINGS_STORAGE_KEY = "playplay.user-settings";
const LEGACY_USER_SETTINGS_MIGRATION_MARKER_KEY = "playplay.user-settings.migrated-to-tauri-v1";
export const USER_SETTINGS_UPDATED_EVENT = "playplay:user-settings-updated";

export const DEFAULT_USER_SETTINGS = {
  fullName: "",
  username: "",
  displayName: "",
  bio: "",
  email: "",
  phone: "",
  github: "",
  instagram: "",
  facebook: "",
  telegram: "",
  language: "English",
  timezone: "(GMT+7) Jakarta",
  dateFormat: "May 25, 2026",
  timeFormat: "12 Hour (07:30 PM)",
  memberSince: "-",
  lastLogin: "-",
  accountStatus: "Inactive",
  userId: "-",
  avatarDataUrl: createDefaultAvatarDataUrl(),
};

export async function fetchUserSettings() {
  const response = await invoke("get_user_settings");
  return normalizeUserSettings(response);
}

export async function migrateLegacyUserSettingsIfNeeded() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    if (window.localStorage.getItem(LEGACY_USER_SETTINGS_MIGRATION_MARKER_KEY) === "done") {
      return null;
    }

    const rawLegacy = window.localStorage.getItem(LEGACY_USER_SETTINGS_STORAGE_KEY);
    if (!rawLegacy) {
      window.localStorage.setItem(LEGACY_USER_SETTINGS_MIGRATION_MARKER_KEY, "done");
      return null;
    }

    const parsedLegacy = JSON.parse(rawLegacy);
    const legacySettings = normalizeUserSettings(parsedLegacy);
    const currentSettings = await fetchUserSettings();

    if (isEditableUserSettingsDefault(currentSettings)) {
      const migrated = await persistUserSettings(legacySettings);
      window.localStorage.setItem(LEGACY_USER_SETTINGS_MIGRATION_MARKER_KEY, "done");
      window.localStorage.removeItem(LEGACY_USER_SETTINGS_STORAGE_KEY);
      return migrated;
    }

    window.localStorage.setItem(LEGACY_USER_SETTINGS_MIGRATION_MARKER_KEY, "done");
    window.localStorage.removeItem(LEGACY_USER_SETTINGS_STORAGE_KEY);
    return currentSettings;
  } catch {
    return null;
  }
}

export async function persistUserSettings(nextSettings) {
  const normalized = normalizeUserSettings(nextSettings);
  const response = await invoke("save_user_settings", { input: normalized });
  const saved = normalizeUserSettings(response);
  notifyUserSettingsUpdated(saved);
  return saved;
}

export function buildSocialLinksFromUserSettings(userSettings) {
  const settings = normalizeUserSettings(userSettings);
  return {
    github: buildUrl("https://github.com/", settings.github),
    instagram: buildUrl("https://instagram.com/", settings.instagram),
    facebook: buildUrl("https://facebook.com/", settings.facebook),
    telegram: buildUrl("https://t.me/", settings.telegram),
  };
}

export function normalizeUserSettings(userSettings) {
  if (!userSettings || typeof userSettings !== "object") {
    return { ...DEFAULT_USER_SETTINGS };
  }

  const fn = String(userSettings.fullName || "").trim();
  const un = String(userSettings.username || "").trim();
  const em = String(userSettings.email || "").trim();

  const isAutoDefault = (
    fn === "Alex Moons" || fn === "Rivay Ramadhan" ||
    un === "alexmoons" || un === "rivay.dev" ||
    em === "alexmoons.artyle@gmail.com" || em === "rivay.dev@gmail.com"
  );

  const source = isAutoDefault ? {} : userSettings;
  const next = {
    ...DEFAULT_USER_SETTINGS,
    ...(source && typeof source === "object" ? source : {}),
  };

  const isCreated = Boolean(next.fullName || next.username || next.displayName);
  const now = new Date();
  const defaultMemberSince = now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const defaultLastLogin = now.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).replace(",", "");
  const defaultUserId = `TP-${String(now.getFullYear()).slice(-2)}-${String(now.getMonth() + 1).padStart(2, "0")}-1-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

  return {
    ...next,
    fullName: String(next.fullName || ""),
    username: String(next.username || ""),
    displayName: String(next.displayName || ""),
    bio: String(next.bio || "").slice(0, 150),
    email: String(next.email || ""),
    phone: String(next.phone || ""),
    github: normalizeSocialHandle(next.github, "github.com/"),
    instagram: normalizeSocialHandle(next.instagram, "instagram.com/"),
    facebook: normalizeSocialHandle(next.facebook, "facebook.com/"),
    telegram: normalizeSocialHandle(next.telegram, "t.me/", true),
    language: String(next.language || DEFAULT_USER_SETTINGS.language),
    timezone: String(next.timezone || DEFAULT_USER_SETTINGS.timezone),
    dateFormat: String(next.dateFormat || DEFAULT_USER_SETTINGS.dateFormat),
    timeFormat: String(next.timeFormat || DEFAULT_USER_SETTINGS.timeFormat),
    memberSince: isCreated && (next.memberSince === "-" || !next.memberSince) ? defaultMemberSince : String(next.memberSince || "-"),
    lastLogin: isCreated && (next.lastLogin === "-" || !next.lastLogin) ? defaultLastLogin : String(next.lastLogin || "-"),
    accountStatus: isCreated ? (next.accountStatus === "Inactive" || next.accountStatus === "-" || !next.accountStatus ? "Active" : String(next.accountStatus)) : "Inactive",
    userId: isCreated && (next.userId === "-" || !next.userId || next.userId.startsWith("PT-")) ? defaultUserId : String(next.userId || "-"),
    avatarDataUrl: String(next.avatarDataUrl || DEFAULT_USER_SETTINGS.avatarDataUrl),
  };
}

export function notifyUserSettingsUpdated(userSettings) {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new CustomEvent(USER_SETTINGS_UPDATED_EVENT, {
    detail: normalizeUserSettings(userSettings),
  }));
}

function normalizeSocialHandle(value, domainPrefix, stripAt = false) {
  let normalized = String(value || "").trim();
  normalized = normalized.replace(/^https?:\/\//i, "");
  normalized = normalized.replace(/^www\./i, "");
  normalized = normalized.replace(new RegExp(`^${escapeRegExp(domainPrefix)}`, "i"), "");
  normalized = normalized.replace(/^\/+/, "");
  if (stripAt) {
    normalized = normalized.replace(/^@+/, "");
  }
  return normalized;
}

function isEditableUserSettingsDefault(userSettings) {
  const current = editableUserSettingsSnapshot(normalizeUserSettings(userSettings));
  const baseline = editableUserSettingsSnapshot(DEFAULT_USER_SETTINGS);
  return JSON.stringify(current) === JSON.stringify(baseline);
}

function editableUserSettingsSnapshot(userSettings) {
  return {
    fullName: userSettings.fullName,
    username: userSettings.username,
    displayName: userSettings.displayName,
    bio: userSettings.bio,
    email: userSettings.email,
    phone: userSettings.phone,
    github: userSettings.github,
    instagram: userSettings.instagram,
    facebook: userSettings.facebook,
    telegram: userSettings.telegram,
    language: userSettings.language,
    timezone: userSettings.timezone,
    dateFormat: userSettings.dateFormat,
    timeFormat: userSettings.timeFormat,
    avatarDataUrl: userSettings.avatarDataUrl,
  };
}

function buildUrl(baseUrl, handle) {
  const normalizedHandle = String(handle || "").trim().replace(/^@+/, "");
  return normalizedHandle ? `${baseUrl}${normalizedHandle}` : baseUrl;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function createDefaultAvatarDataUrl() {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#bac6d6"/>
          <stop offset="100%" stop-color="#6e7b8d"/>
        </linearGradient>
        <linearGradient id="coat" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#0f1721"/>
          <stop offset="100%" stop-color="#202b39"/>
        </linearGradient>
      </defs>
      <rect width="240" height="240" rx="120" fill="url(#bg)"/>
      <circle cx="120" cy="96" r="46" fill="#e5bf9e"/>
      <path d="M74 206c8-32 28-54 46-63h0c20 3 44 30 46 63Z" fill="url(#coat)"/>
      <path d="M78 90c3-28 25-49 50-49 27 0 48 20 50 49-3-4-8-8-14-10-10-4-21-4-30-2-15 4-29 10-56 12Z" fill="#111821"/>
      <path d="M88 95c8 0 15-5 17-12 4 9 14 14 24 14 11 0 20-5 24-13 4 7 11 12 18 12v18c0 30-21 53-51 53-29 0-50-23-50-53Z" fill="#efc7a3"/>
      <path d="M103 114c5 0 9 4 9 9s-4 9-9 9-9-4-9-9 4-9 9-9Zm34 0c5 0 9 4 9 9s-4 9-9 9-9-4-9-9 4-9 9-9Z" fill="#fff" opacity=".18"/>
      <path d="M105 145c11 7 20 7 31 0" stroke="#b2745c" stroke-width="4" fill="none" stroke-linecap="round"/>
    </svg>
  `;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
