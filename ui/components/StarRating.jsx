import React, { useState } from "react";
import { StarIcon } from "./icons";

export default function StarRating({
  value = 0,
  onChange = null,
  readOnly = false,
  size = "md",
  showLabel = false,
  noShape = false,
  className = "",
}) {
  const [hoverValue, setHoverValue] = useState(0);
  const currentRating = hoverValue || value || 0;

  const starSizes = {
    sm: "w-3.5 h-3.5",
    md: "w-5 h-5",
    lg: "w-6 h-6",
  };

  const currentStarSize = starSizes[size] || starSizes.md;

  if (readOnly) {
    if (!value || value <= 0) return null;
    return (
      <div className={`inline-flex items-center gap-1 text-[#ffffff] text-xs font-semibold border-0 ${noShape ? "p-0 bg-transparent" : "bg-[#161616] px-2.5 py-1 rounded-full shadow-sm"} ${className}`}>
        <StarIcon className={`${currentStarSize} text-amber-400`} fill="currentColor" />
        <span>{value} / 5</span>
      </div>
    );
  }

  return (
    <div className={`inline-flex items-center gap-1.5 border-0 ${noShape ? "p-0 bg-transparent" : "bg-[#161616] hover:bg-[#1f1f1f] transition-colors px-3 py-1.5 rounded-full"} ${className}`}>
      <div className="flex items-center gap-1" onMouseLeave={() => setHoverValue(0)}>
        {[1, 2, 3, 4, 5].map((star) => {
          const isFilled = star <= currentRating;
          return (
            <button
              key={star}
              type="button"
              className="cursor-pointer p-0.5 text-gray-400 hover:scale-110 transition-transform focus:outline-none"
              onMouseEnter={() => setHoverValue(star)}
              onClick={() => onChange?.(star === value ? null : star)}
              title={`Rate ${star} star${star > 1 ? "s" : ""}`}
            >
              <StarIcon
                className={`${currentStarSize} ${isFilled ? "text-amber-400" : "text-gray-600 hover:text-amber-300"}`}
                fill={isFilled ? "currentColor" : "none"}
              />
            </button>
          );
        })}
      </div>
      {showLabel && (
        <span className="text-xs font-medium text-[#ffffff] ml-1">
          {currentRating > 0 ? `${currentRating} / 5 Stars` : "Not Rated"}
        </span>
      )}
      {value > 0 && !readOnly && (
        <button
          type="button"
          onClick={() => onChange?.(null)}
          className="ml-1 text-[10px] uppercase font-bold text-gray-400 hover:text-rose-400 cursor-pointer transition-colors"
          title="Clear Rating"
        >
          Clear
        </button>
      )}
    </div>
  );
}
