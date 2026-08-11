import React from "react";

export default function LoadingIndicator({ label = "Loading...", className = "", compact = false }) {
  return (
    <div className={`loading-indicator${compact ? " is-compact" : ""}${className ? ` ${className}` : ""}`} role="status" aria-live="polite">
      <div className="dotted-loader" aria-hidden="true">
        <div className="dotted-loader-square">
          {Array.from({ length: 8 }, (_, index) => <span key={`loader-dot-${index}`} />)}
        </div>
        <div className="dotted-loader-center-dot" />
      </div>
      {label ? <span className="loading-indicator-label">{label}</span> : null}
    </div>
  );
}
