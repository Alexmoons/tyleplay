export const DASHBOARD_NOTIFICATION_LIMIT = 15;

export function resolveNotificationTone(kind) {
  switch (String(kind || "").toLowerCase()) {
    case "played":
      return "recent";
    case "added":
      return "added";
    case "deleted":
      return "deleted";
    case "restored":
      return "restored";
    case "permanently_deleted":
      return "deleted";
    default:
      return "recent";
  }
}

export function formatNotificationDetail(kind, timestamp) {
  const prefix = resolveNotificationPrefix(kind);
  return `${prefix} ${formatRelativeTime(timestamp)}`;
}

function resolveNotificationPrefix(kind) {
  switch (String(kind || "").toLowerCase()) {
    case "added":
      return "Added";
    case "deleted":
      return "Deleted";
    case "restored":
      return "Restored";
    case "permanently_deleted":
      return "Permanently deleted";
    case "played":
    default:
      return "Played";
  }
}

export function formatRelativeTime(timestamp) {
  const value = Number(timestamp || 0);
  if (!value) {
    return "just now";
  }

  const diffSeconds = Math.max(0, Math.floor(Date.now() / 1000) - value);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffSeconds / 3600);
  const diffDays = Math.floor(diffSeconds / 86400);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);
  const diffYears = Math.floor(diffDays / 365);

  if (diffSeconds < 60) {
    return formatAgo(diffSeconds, "second");
  }
  if (diffMinutes < 60) {
    return formatAgo(diffMinutes, "minute");
  }
  if (diffHours < 24) {
    return formatAgo(diffHours, "hour");
  }
  if (diffDays < 7) {
    return formatAgo(diffDays, "day");
  }
  if (diffDays < 30) {
    return formatAgo(diffWeeks, "week");
  }
  if (diffDays < 365) {
    return formatAgo(diffMonths, "month");
  }
  return formatAgo(diffYears, "year");
}

function formatAgo(value, unit) {
  const safeValue = Math.max(1, Number(value || 0));
  return `${safeValue} ${safeValue === 1 ? unit : `${unit}s`} ago`;
}
