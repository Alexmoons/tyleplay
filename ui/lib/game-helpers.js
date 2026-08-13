import { toAssetUrl } from "./tauri";

export const PAGE_SIZE = 30;
let playtimeDisplayMode = "standard";

export const navItems = [
  { id: "dashboard", label: "Dashboard", icon: "home" },
  { id: "library", label: "Library", icon: "grid" },
  { id: "archive", label: "Archive", icon: "bookmark" },
  { id: "stats", label: "Stats", icon: "chart" },
  { id: "achievements", label: "Achievements", icon: "trophy" },
];

export const libraryTabs = [
  { id: "all", label: "All Games" },
  { id: "favorites", label: "Favorites" },
];

export const viewModes = [
  { id: "poster", label: "Poster grid", icon: "grid" },
  { id: "compact", label: "Compact grid", icon: "layout-grid" },
  { id: "list", label: "Row layout", icon: "rows" },
];

export function computeCompletion(game, index) {
  const playHours = Number(game.total_seconds || 0) / 3600;
  return Math.max(18, Math.min(96, Math.round(22 + playHours * 1.1 + (index % 5) * 7)));
}

export function sortLibrary(left, right, sortBy) {
  switch (sortBy) {
    case "last_added":
      return Number(right.created_at || 0) - Number(left.created_at || 0)
        || Number(right.last_played || 0) - Number(left.last_played || 0)
        || String(left.name || "").localeCompare(String(right.name || ""));
    case "name":
      return String(left.name || "").localeCompare(String(right.name || ""));
    case "playtime":
      return Number(right.total_seconds || 0) - Number(left.total_seconds || 0)
        || String(left.name || "").localeCompare(String(right.name || ""));
    case "release_year":
      return Number(right.release_year || 0) - Number(left.release_year || 0)
        || String(left.name || "").localeCompare(String(right.name || ""));
    case "last_played":
    default:
      return Number(right.last_played || 0) - Number(left.last_played || 0)
        || Number(right.total_seconds || 0) - Number(left.total_seconds || 0)
        || String(left.name || "").localeCompare(String(right.name || ""));
  }
}

export function buildRangeLabel(total, page, pageSize) {
  if (!total) {
    return "Showing 0-0";
  }
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);
  return `Showing ${start}-${end}`;
}

export function buildPaginationItems(currentPage, totalPages, edgeCount = 3) {
  const safeCurrentPage = Math.max(1, Number(currentPage || 1));
  const safeTotalPages = Math.max(1, Number(totalPages || 1));
  const safeEdgeCount = Math.max(1, Number(edgeCount || 1));

  if (safeTotalPages <= safeEdgeCount * 2) {
    return Array.from({ length: safeTotalPages }, (_, index) => ({
      type: "page",
      value: index + 1,
    }));
  }

  const items = [];
  const addPage = (value) => {
    if (!items.some((item) => item.type === "page" && item.value === value)) {
      items.push({ type: "page", value });
    }
  };
  const addEllipsis = (key) => {
    if (items[items.length - 1]?.type !== "ellipsis") {
      items.push({ type: "ellipsis", key });
    }
  };

  const currentBlockStart = Math.max(1, safeCurrentPage - safeEdgeCount + 1);
  const currentBlockEnd = Math.min(safeTotalPages, currentBlockStart + safeEdgeCount - 1);
  const trailingBlockStart = Math.max(1, safeTotalPages - safeEdgeCount + 1);

  for (let page = currentBlockStart; page <= currentBlockEnd; page += 1) {
    addPage(page);
  }

  if (currentBlockEnd + 1 < trailingBlockStart) {
    addEllipsis("middle");
  }

  for (let page = trailingBlockStart; page <= safeTotalPages; page += 1) {
    addPage(page);
  }

  return items;
}

export function preventPagerFocus(event) {
  event.preventDefault();
}

export function labelForView(view) {
  return navItems.find((item) => item.id === view)?.label || "Settings";
}

export function getInitials(name) {
  return String(name || "Game")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export function resolveBackdropMedia(value) {
  if (!value) {
    return "";
  }
  const source = normalizeSteamAssetUrl(value, "backdrop");
  return toAssetUrl(String(source).replace("t_cover_big", "t_1080p").replace("t_thumb", "t_1080p"));
}

export function resolveCoverMedia(value) {
  if (!value) {
    return "";
  }
  const source = normalizeSteamAssetUrl(value, "cover");
  return toAssetUrl(String(source).replace("t_thumb", "t_cover_big"));
}

export function resolvePosterMedia(value) {
  if (!value) {
    return "";
  }

  return toAssetUrl(
    String(normalizeSteamAssetUrl(value, "cover"))
      .replace("t_thumb", "t_cover_big_2x")
      .replace("t_cover_big", "t_cover_big_2x")
  );
}

export function resolveSteamLogoMedia(...values) {
  for (const value of values) {
    const source = String(value || "").trim();
    if (!source) {
      continue;
    }
    const match = source.match(/\/apps\/(\d+)\//i);
    if (!match) {
      continue;
    }
    const host = source.includes("shared.fastly.steamstatic.com")
      ? "shared.fastly.steamstatic.com"
      : "shared.akamai.steamstatic.com";
    return toAssetUrl(`https://${host}/store_item_assets/steam/apps/${match[1]}/logo.png`);
  }
  return "";
}

export function resolveSteamLibraryHeaderMedia(...values) {
  return resolveSteamLibraryHeaderMediaCandidates(...values)[0] || "";
}

export function resolveSteamLibraryHeaderMediaCandidates(...values) {
  const candidates = [];

  for (const value of values) {
    const source = String(normalizeSteamAssetUrl(value, "header") || "").trim();
    if (!source) {
      continue;
    }

    if (/\/apps\/\d+\/[^/]+\/[^/]+$/i.test(source)) {
      candidates.push(toAssetUrl(source.replace(/\/[^/]+$/, "/library_hero.jpg")));
      candidates.push(toAssetUrl(source.replace(/\/[^/]+$/, "/library_header.jpg")));
      candidates.push(toAssetUrl(source.replace(/\/[^/]+$/, "/header.jpg")));
      candidates.push(toAssetUrl(source.replace(/\/[^/]+$/, "/header_2x.jpg")));
    }
  }

  const appId = extractSteamAppId(...values);
  if (appId) {
    let host = "shared.akamai.steamstatic.com";
    for (const value of values) {
      const source = String(value || "").trim();
      if (source.includes("shared.fastly.steamstatic.com")) {
        host = "shared.fastly.steamstatic.com";
        break;
      }
    }

    candidates.push(toAssetUrl(`https://${host}/store_item_assets/steam/apps/${appId}/library_hero.jpg`));
    candidates.push(toAssetUrl(`https://${host}/store_item_assets/steam/apps/${appId}/library_header.jpg`));
    candidates.push(toAssetUrl(`https://${host}/store_item_assets/steam/apps/${appId}/header.jpg`));
    candidates.push(toAssetUrl(`https://${host}/store_item_assets/steam/apps/${appId}/header_2x.jpg`));
  }

  return [...new Set(candidates)];
}

function normalizeSteamAssetUrl(value, kind = "generic") {
  const source = String(value || "").trim();
  if (!source) {
    return "";
  }

  const normalized = source.replace(/\\/g, "/");
  const appIdMatch = normalized.match(/\/(?:apps|librarycache|app)\/(\d+)(?:\/|$)/i);
  if (!appIdMatch) {
    return source;
  }

  const appId = appIdMatch[1];
  const host = normalized.includes("shared.fastly.steamstatic.com")
    ? "shared.fastly.steamstatic.com"
    : "shared.akamai.steamstatic.com";
  const canonicalBase = `https://${host}/store_item_assets/steam/apps/${appId}`;
  const fileName = normalized.split("/").pop() || "";
  const hasKnownExtension = /\.[a-z0-9]{2,6}(?:\?.*)?$/i.test(fileName);
  const hasQuery = source.includes("?");

  if (hasKnownExtension || hasQuery) {
    return source;
  }

  if (kind === "cover") {
    return `${canonicalBase}/library_600x900_2x.jpg`;
  }

  if (kind === "backdrop") {
    return `${canonicalBase}/library_hero.jpg`;
  }

  if (kind === "header") {
    return `${canonicalBase}/library_header.jpg`;
  }

  return source;
}

export function extractSteamAppId(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === "") {
      continue;
    }

    const numericAppId = Number(value);
    if (Number.isInteger(numericAppId) && numericAppId > 0) {
      return numericAppId;
    }

    const source = String(value || "").trim();
    if (!source) {
      continue;
    }

    const normalized = source.replace(/\\/g, "/");
    const match = normalized.match(/\/(?:apps|librarycache|app)\/(\d+)(?:\/|$)/i);
    if (match) {
      return Number(match[1]);
    }
  }

  return 0;
}

export function resolveSteamSmallCapsuleMedia(...values) {
  return resolveSteamSmallCapsuleMediaCandidates(...values)[0] || "";
}

export function resolveSteamSmallCapsuleMediaCandidates(...values) {
  const appId = extractSteamAppId(...values);
  if (!appId) {
    return [];
  }

  let host = "shared.akamai.steamstatic.com";
  for (const value of values) {
    const source = String(value || "").trim();
    if (source.includes("shared.fastly.steamstatic.com")) {
      host = "shared.fastly.steamstatic.com";
      break;
    }
  }

  return [
    toAssetUrl(`https://${host}/store_item_assets/steam/apps/${appId}/capsule_231x87_2x.jpg`),
    toAssetUrl(`https://${host}/store_item_assets/steam/apps/${appId}/capsule_231x87.jpg`),
  ];
}

export function resolveGenericMedia(value) {
  if (!value) {
    return "";
  }
  return toAssetUrl(String(value));
}

export function buildBackdropStyle(value) {
  const media = resolveBackdropMedia(value) || resolveCoverMedia(value);
  if (!media) {
    return undefined;
  }
  return { backgroundImage: `url("${media}")` };
}

export function clampMediaPosition(value, fallback = 50) {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }
  const nextValue = Number(value);
  if (!Number.isFinite(nextValue)) {
    return fallback;
  }
  return Math.max(0, Math.min(100, nextValue));
}

export function clampMediaZoom(value, fallback = 100) {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }
  const nextValue = Number(value);
  if (!Number.isFinite(nextValue)) {
    return fallback;
  }
  return Math.max(100, Math.min(250, nextValue));
}

export function buildBackdropPresentationStyle(value, positionX, positionY, zoom) {
  const media = resolveBackdropMedia(value) || resolveCoverMedia(value);
  if (!media) {
    return undefined;
  }

  const clampedX = clampMediaPosition(positionX);
  const clampedY = clampMediaPosition(positionY);
  const clampedZoom = clampMediaZoom(zoom) / 100;

  return {
    backgroundImage: `url("${media}")`,
    backgroundPosition: `${clampedX}% ${clampedY}%`,
    transformOrigin: `${clampedX}% ${clampedY}%`,
    "--media-zoom": String(clampedZoom),
  };
}

export function buildPosterPresentationStyle(positionX, positionY, zoom) {
  const clampedX = clampMediaPosition(positionX);
  const clampedY = clampMediaPosition(positionY);
  const clampedZoom = clampMediaZoom(zoom) / 100;

  return {
    objectPosition: `${clampedX}% ${clampedY}%`,
    transformOrigin: `${clampedX}% ${clampedY}%`,
    transform: `scale(${clampedZoom})`,
  };
}

export function buildLogoPresentationStyle(positionX, positionY, zoom) {
  const clampedX = clampMediaPosition(positionX);
  const clampedY = clampMediaPosition(positionY);
  const clampedZoom = clampMediaZoom(zoom) / 100;
  const panX = ((clampedX - 50) / 50) * 70;
  const panY = ((clampedY - 50) / 50) * 50;

  return {
    "--logo-pan-x": `${panX}%`,
    "--logo-pan-y": `${panY}%`,
    "--logo-zoom": String(clampedZoom),
  };
}

export function buildPosterBackgroundStyle(value, positionX, positionY, zoom) {
  const media = resolveCoverMedia(value) || resolveBackdropMedia(value);
  if (!media) {
    return undefined;
  }

  const clampedX = clampMediaPosition(positionX);
  const clampedY = clampMediaPosition(positionY);
  const clampedZoom = clampMediaZoom(zoom) / 100;

  return {
    backgroundImage: `url("${media}")`,
    backgroundPosition: `${clampedX}% ${clampedY}%`,
    transformOrigin: `${clampedX}% ${clampedY}%`,
    "--media-zoom": String(clampedZoom),
  };
}

export function setPlaytimeDisplayMode(mode) {
  playtimeDisplayMode = String(mode || "standard").toLowerCase() === "hours_only"
    ? "hours_only"
    : "standard";
}

export function formatDurationLong(totalSeconds) {
  if (playtimeDisplayMode === "hours_only") {
    return formatDurationHoursOnly(totalSeconds);
  }

  const seconds = Math.max(0, Math.round(totalSeconds || 0));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  if (hours > 0) {
    return `${formatWholeNumber(hours)}h ${minutes}m`;
  }

  if (minutes > 0) {
    return `${minutes}m`;
  }

  if (remainingSeconds > 0) {
    return `${remainingSeconds}s`;
  }

  return `${minutes}m`;
}

export function formatDurationDetailed(totalSeconds) {
  if (playtimeDisplayMode === "hours_only") {
    return formatDurationHoursOnly(totalSeconds);
  }

  const seconds = Math.max(0, Math.round(totalSeconds || 0));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  if (hours > 0) {
    return `${formatWholeNumber(hours)}h ${minutes}m ${remainingSeconds}s`;
  }

  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  }

  return `${remainingSeconds}s`;
}

function formatWholeNumber(value) {
  return Number(value || 0).toLocaleString("en-US");
}

function formatDurationHoursOnly(totalSeconds) {
  const seconds = Math.max(0, Number(totalSeconds || 0));
  if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.round(seconds % 60);

    if (minutes > 0) {
      return `${minutes}m`;
    }

    if (remainingSeconds > 0) {
      return `${remainingSeconds}s`;
    }

    return "0m";
  }

  const hours = seconds / 3600;
  const roundedHours = Math.round(hours * 10) / 10;
  return `${roundedHours.toLocaleString("id-ID", {
    minimumFractionDigits: roundedHours % 1 === 0 ? 0 : 1,
    maximumFractionDigits: 1,
  })}h`;
}

export function formatTodayDateLabel() {
  const now = new Date();
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const dayName = days[now.getDay()];
  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const yyyy = now.getFullYear();
  return `${dayName}, ${dd}/${mm}/${yyyy}`;
}

export function formatCurrentWeekRangeLabel() {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const distanceToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

  const monday = new Date(now);
  monday.setDate(now.getDate() - distanceToMonday);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const formatDate = (d) => {
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  };

  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const mondayDayName = days[monday.getDay()];
  const sundayDayName = days[sunday.getDay()];

  return `${mondayDayName}, ${formatDate(monday)} – ${sundayDayName}, ${formatDate(sunday)}`;
}

export function formatSessionDay(timestamp) {
  if (!timestamp) return "";
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(Number(timestamp) * 1000));
}

export function formatSessionClock(timestamp) {
  if (!timestamp) return "";
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(Number(timestamp) * 1000)).replace(":", ".");
}
