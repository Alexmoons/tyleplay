import React, { useEffect, useState } from "react";
import { formatDurationLong } from "../lib/game-helpers";
import { CloseIcon } from "./icons";

// Global module-scoped state to guarantee single IPC listener and single toast queue
let activeToasts = [];
const subscribers = new Set();
let isGlobalListenerInitialized = false;
const recentEventTimes = new Map();

function notifySubscribers() {
  subscribers.forEach((callback) => callback([...activeToasts]));
}

function initGlobalTauriListener() {
  if (isGlobalListenerInitialized) return;
  isGlobalListenerInitialized = true;

  import("@tauri-apps/api/event")
    .then(({ listen }) => {
      listen("game-session-event", (event) => {
        const payload = event?.payload;
        if (!payload) return;

        const isStarted = payload.event_type === "started";
        const gameName = payload.game_name || "Unknown Game";
        const sessionSecs = payload.session_duration_seconds || 0;
        const totalSecs = payload.total_play_time_seconds || 0;
        const timestampStr =
          payload.timestamp_str ||
          new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

        const eventKey = `${gameName}_${isStarted ? "start" : "end"}`;
        const now = Date.now();

        // Strictly drop duplicate events arriving within 4 seconds
        const lastTime = recentEventTimes.get(eventKey) || 0;
        if (now - lastTime < 4000) {
          return;
        }
        recentEventTimes.set(eventKey, now);

        const toastId = now + Math.random();
        const newToast = {
          id: toastId,
          key: eventKey,
          isStarted,
          gameName,
          sessionSecs,
          totalSecs,
          timestampStr,
        };

        // Keep only 1 active toast at a time
        activeToasts = [newToast];
        notifySubscribers();

        setTimeout(() => {
          activeToasts = activeToasts.filter((t) => t.id !== toastId);
          notifySubscribers();
        }, 6000);
      });
    })
    .catch((err) => {
      console.error("Failed to initialize global game-session-event listener:", err);
    });
}

// Initialize listener immediately on module load
initGlobalTauriListener();

export default function GameSessionToast() {
  const [toasts, setToasts] = useState(activeToasts);

  useEffect(() => {
    subscribers.add(setToasts);
    setToasts([...activeToasts]);
    return () => {
      subscribers.delete(setToasts);
    };
  }, []);

  const removeToast = (id) => {
    activeToasts = activeToasts.filter((t) => t.id !== id);
    notifySubscribers();
  };

  if (toasts.length === 0) return null;

  return (
    <div
      className="game-session-toast-container"
      style={{
        position: "fixed",
        bottom: "20px",
        right: "20px",
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        width: "310px",
        maxWidth: "calc(100vw - 32px)",
        pointerEvents: "none",
      }}
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="game-session-toast-card animate-toast-slide-in"
          style={{
            pointerEvents: "auto",
            backgroundColor: "#161616",
            border: 0,
            borderRadius: "12px",
            padding: "10px 14px",
            boxShadow: "0 8px 24px rgba(0, 0, 0, 0.6), 0 2px 6px rgba(0, 0, 0, 0.3)",
            display: "flex",
            flexDirection: "column",
            gap: "1px",
            color: "#ffffff",
            fontFamily: "inherit",
            width: "100%",
            boxSizing: "border-box",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1px" }}>
            <span
              style={{
                fontSize: "11px",
                fontWeight: 600,
                color: toast.isStarted ? "#a095ff" : "#4ade80",
              }}
            >
              {toast.isStarted ? "Game Started" : "Game Ended"}
            </span>
            <button
              type="button"
              onClick={() => removeToast(toast.id)}
              style={{
                background: "none",
                border: 0,
                color: "rgba(255, 255, 255, 0.4)",
                cursor: "pointer",
                padding: "2px",
                borderRadius: "4px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              className="hover:text-white transition-colors"
              title="Close"
            >
              <CloseIcon className="w-3 h-3" />
            </button>
          </div>

          <h4
            style={{
              fontSize: "13px",
              fontWeight: 600,
              color: "#ffffff",
              margin: "0 0 1px 0",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              lineHeight: 1.2,
            }}
          >
            {toast.gameName}
          </h4>

          <div style={{ fontSize: "11px", color: "rgba(255, 255, 255, 0.65)", fontWeight: 400, lineHeight: 1.2 }}>
            {toast.isStarted ? (
              <span>{toast.timestampStr}</span>
            ) : (
              <span>{toast.timestampStr} | Duration: {formatDurationLong(toast.sessionSecs)}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
