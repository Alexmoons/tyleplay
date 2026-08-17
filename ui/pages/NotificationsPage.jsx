import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeftIcon, BellIcon, ChevronLeftIcon, ChevronRightIcon } from "../components/icons";
import { buildPaginationItems, preventPagerFocus } from "../lib/game-helpers";
import { formatNotificationDetail, resolveNotificationTone } from "../lib/notifications";

const NOTIFICATIONS_PAGE_SIZE = 15;

function NotificationTooltipAnchor({ as: Component = "span", className = "", tooltip, children }) {
  const [position, setPosition] = useState(null);
  const delayRef = useRef(null);
  const pendingPositionRef = useRef(null);
  const isVisibleRef = useRef(false);

  function handlePointerMove(event) {
    const nextPosition = {
      x: event.clientX + 12,
      y: event.clientY + 12,
    };
    pendingPositionRef.current = nextPosition;

    if (isVisibleRef.current) {
      setPosition(nextPosition);
      return;
    }

    if (delayRef.current) {
      return;
    }

    delayRef.current = window.setTimeout(() => {
      isVisibleRef.current = true;
      setPosition(pendingPositionRef.current || nextPosition);
      delayRef.current = null;
    }, 1000);
  }

  function handlePointerLeave() {
    if (delayRef.current) {
      window.clearTimeout(delayRef.current);
      delayRef.current = null;
    }
    pendingPositionRef.current = null;
    isVisibleRef.current = false;
    setPosition(null);
  }

  useEffect(() => () => {
    if (delayRef.current) {
      window.clearTimeout(delayRef.current);
    }
  }, []);

  return (
    <>
      <Component
        className={className}
        onPointerEnter={handlePointerMove}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        onBlur={handlePointerLeave}
      >
        {children}
      </Component>
      {position && tooltip && typeof document !== "undefined"
        ? createPortal(
            <span
              className="archive-tooltip-bubble"
              style={{
                left: `${position.x}px`,
                top: `${position.y}px`,
              }}
            >
              {tooltip}
            </span>,
            document.body
          )
        : null}
    </>
  );
}

export default function NotificationsPage({ notifications, onBack }) {
  const items = Array.isArray(notifications) ? notifications : [];
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / NOTIFICATIONS_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginationItems = buildPaginationItems(currentPage, totalPages);
  const pagedItems = useMemo(
    () => items.slice((currentPage - 1) * NOTIFICATIONS_PAGE_SIZE, currentPage * NOTIFICATIONS_PAGE_SIZE),
    [currentPage, items]
  );

  useEffect(() => {
    setPage(1);
  }, [items.length]);

  return (
    <div className="notifications-page">

      <header className="page-header notifications-page-header">
        <div className="page-heading">
          <h1>Notifications</h1>
        </div>
        <div className="notifications-page-meta">
          <span>{items.length} items</span>
        </div>
      </header>

      <section className="library-panel notifications-panel">
        {pagedItems.length ? (
          <div className="notifications-page-list">
            {pagedItems.map((item) => (
              <article key={item.id} className="notifications-page-item">
                <i className={`dashboard-notification-dot is-${resolveNotificationTone(item.kind)}`} aria-hidden="true" />
                <div className="notifications-page-copy">
                  <NotificationTooltipAnchor
                    as="strong"
                    className="notifications-page-title"
                    tooltip={item.game_name || "Unknown game"}
                  >
                    {item.game_name || "Unknown game"}
                  </NotificationTooltipAnchor>
                  <span>{formatNotificationDetail(item.kind, item.created_at, item.duration_seconds)}</span>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="dashboard-notification-empty notifications-page-empty">
            <BellIcon />
            <strong>No notifications</strong>
            <span>Nothing new right now.</span>
          </div>
        )}

        {items.length > NOTIFICATIONS_PAGE_SIZE ? (
          <footer className="archive-footer">
            <span>
              {Math.min((currentPage - 1) * NOTIFICATIONS_PAGE_SIZE + 1, items.length)}
              {" - "}
              {Math.min(currentPage * NOTIFICATIONS_PAGE_SIZE, items.length)}
              {" of "}
              {items.length} notifications
            </span>
            <div className="pager" role="navigation" aria-label="Notifications pagination">
              <button
                type="button"
                aria-label="Previous notifications page"
                disabled={currentPage <= 1}
                onMouseDown={preventPagerFocus}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
              >
                <ChevronLeftIcon />
              </button>
              {paginationItems.map((item) => (
                item.type === "ellipsis" ? (
                  <span key={`notifications-page-${item.key}`} className="pager-ellipsis" aria-hidden="true">...</span>
                ) : (
                  <button
                    key={`notifications-page-${item.value}`}
                    type="button"
                    className={currentPage === item.value ? "is-active" : ""}
                    aria-label={`Notifications page ${item.value}`}
                    aria-pressed={currentPage === item.value}
                    onMouseDown={preventPagerFocus}
                    onClick={() => setPage(item.value)}
                  >
                    {item.value}
                  </button>
                )
              ))}
              <button
                type="button"
                aria-label="Next notifications page"
                disabled={currentPage >= totalPages}
                onMouseDown={preventPagerFocus}
                onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
              >
                <ChevronRightIcon />
              </button>
            </div>
          </footer>
        ) : null}
      </section>
    </div>
  );
}
