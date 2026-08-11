import React from "react";
import { NavIcon } from "./icons";

function renderFormattedCaption(caption) {
  if (typeof caption !== "string") {
    return caption;
  }

  const match = caption.match(/^([+-]?\d+%?|\+[0-9]+%?|\-[0-9]+%?)\s+(.*)$/);
  if (match) {
    const [, val, rest] = match;
    const isPositive = val.startsWith("+") || (!val.startsWith("-") && val !== "0" && val !== "0%");
    const isNegative = val.startsWith("-");
    const colorClass = isPositive
      ? "text-[#70d580] font-bold"
      : isNegative
      ? "text-[#e6a08f] font-bold"
      : "text-gray-400";

    return (
      <span className="truncate">
        <span className={colorClass}>{val}</span>{" "}
        <span className="text-gray-400 opacity-80">{rest}</span>
      </span>
    );
  }

  return <span className="text-gray-400 opacity-80 truncate">{caption}</span>;
}

export default function SummaryCard({ icon, tone, label, value, caption, loading, onClick, active }) {
  const iconColor =
    tone === "accent"
      ? "text-sky-400"
      : tone === "purple"
      ? "text-purple-400"
      : tone === "gold"
      ? "text-amber-400"
      : "text-emerald-400";

  return (
    <article
      className={`summary-card${onClick ? " cursor-pointer transition-all active:scale-[0.98]" : ""}${active ? " ring-1 ring-emerald-500/60 bg-[#1f1f1f]" : ""}`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onClick(); } } : undefined}
    >
      <div className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-wider mb-1">
        <span className={`w-4 h-4 flex items-center justify-center shrink-0 ${iconColor}`}>
          <NavIcon type={icon} className="w-4 h-4" />
        </span>
        <span className="truncate text-gray-400">{label}</span>
      </div>

      <div className="my-auto py-0.5">
        <div className={`text-xl lg:text-2xl font-black text-white tracking-tight leading-snug break-words ${loading ? "is-skeleton" : ""}`}>
          {loading ? "" : value}
        </div>
      </div>

      <div className="mt-1 flex items-center gap-1.5 text-xs font-semibold min-h-[18px]">
        {renderFormattedCaption(caption)}
      </div>
    </article>
  );
}
