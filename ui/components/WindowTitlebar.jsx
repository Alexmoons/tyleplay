import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ArrowLeftIcon, ArrowRightIcon, ArrowUpIcon, CloseIcon, MaximizeIcon, MinimizeIcon, RefreshIcon, RestoreIcon } from "./icons";

export default function WindowTitlebar({
  isMaximized,
  onMinimize,
  onToggleMaximize,
  onClose,
  canGoBack = false,
  canGoForward = false,
  canGoUp = true,
  onGoBack,
  onGoForward,
  onGoUp,
  onRefresh,
}) {
  const [menuPosition, setMenuPosition] = useState(null);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuPosition) {
      return undefined;
    }

    function handlePointerDown(event) {
      if (!menuRef.current?.contains(event.target)) {
        setMenuPosition(null);
      }
    }

    function handleEscape(event) {
      if (event.key === "Escape") {
        setMenuPosition(null);
      }
    }

    function clampMenuPosition() {
      if (!menuRef.current) {
        return;
      }

      const menuRect = menuRef.current.getBoundingClientRect();
      const maxX = Math.max(12, window.innerWidth - menuRect.width - 12);
      const maxY = Math.max(12, window.innerHeight - menuRect.height - 12);
      setMenuPosition((current) => (
        current
          ? {
              x: Math.min(current.x, maxX),
              y: Math.min(current.y, maxY),
            }
          : current
      ));
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    window.addEventListener("resize", clampMenuPosition);
    clampMenuPosition();

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
      window.removeEventListener("resize", clampMenuPosition);
    };
  }, [menuPosition]);

  function openSystemMenu(event) {
    event.preventDefault();
    event.stopPropagation();
    setMenuPosition({
      x: event.clientX,
      y: event.clientY,
    });
  }

  function handleMenuAction(action) {
    setMenuPosition(null);
    action?.();
  }

  async function handleDragStart(event) {
    if (event.button !== 0) {
      return;
    }

    try {
      event.preventDefault();
      await getCurrentWindow().startDragging();
    } catch {}
  }

  return (
    <header className="window-titlebar" onContextMenu={openSystemMenu}>
      <div className="window-nav-controls">
        <button
          type="button"
          className="window-nav-control"
          disabled={!canGoBack}
          onClick={onGoBack}
          aria-label="Go back"
          title="Back"
        >
          <ArrowLeftIcon />
        </button>
        <button
          type="button"
          className="window-nav-control"
          disabled={!canGoForward}
          onClick={onGoForward}
          aria-label="Go forward"
          title="Forward"
        >
          <ArrowRightIcon />
        </button>
        <button
          type="button"
          className="window-nav-control"
          disabled={!canGoUp}
          onClick={onGoUp}
          aria-label="Go up"
          title="Up"
        >
          <ArrowUpIcon />
        </button>
        <button
          type="button"
          className="window-nav-control"
          onClick={onRefresh}
          aria-label="Refresh page"
          title="Refresh"
        >
          <RefreshIcon />
        </button>
      </div>

      <div
        className="window-titlebar-drag"
        onPointerDown={handleDragStart}
      />
      <div className="window-controls">
        <button type="button" className="window-control" aria-label="Minimize window" onClick={onMinimize}>
          <MinimizeIcon />
        </button>
        <button type="button" className="window-control" aria-label="Maximize window" onClick={onToggleMaximize}>
          {isMaximized ? <RestoreIcon /> : <MaximizeIcon />}
        </button>
        <button type="button" className="window-control window-control-close" aria-label="Close window" onClick={onClose}>
          <CloseIcon />
        </button>
      </div>

      {menuPosition && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={menuRef}
              className="window-system-menu"
              role="menu"
              aria-label="Window controls"
              style={{ left: menuPosition.x, top: menuPosition.y }}
            >
              <button
                type="button"
                className="window-system-menu-item"
                role="menuitem"
                onClick={() => handleMenuAction(onToggleMaximize)}
              >
                {isMaximized ? <RestoreIcon /> : <MaximizeIcon />}
                <span>{isMaximized ? "Restore" : "Maximize"}</span>
              </button>
              <button type="button" className="window-system-menu-item is-disabled" role="menuitem" disabled>
                <span className="window-system-menu-spacer" aria-hidden="true" />
                <span>Move</span>
              </button>
              <button type="button" className="window-system-menu-item is-disabled" role="menuitem" disabled>
                <span className="window-system-menu-spacer" aria-hidden="true" />
                <span>Size</span>
              </button>
              <button
                type="button"
                className="window-system-menu-item"
                role="menuitem"
                onClick={() => handleMenuAction(onMinimize)}
              >
                <MinimizeIcon />
                <span>Minimize</span>
              </button>
              <div className="window-system-menu-separator" aria-hidden="true" />
              <button
                type="button"
                className="window-system-menu-item is-danger"
                role="menuitem"
                onClick={() => handleMenuAction(onClose)}
              >
                <CloseIcon />
                <span>Close</span>
                <small>Alt+F4</small>
              </button>
            </div>,
            document.body
          )
        : null}
    </header>
  );
}
