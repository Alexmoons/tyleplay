import React from "react";

export default function LibraryCardSkeleton({ viewMode = "poster" }) {
  if (viewMode === "list") {
    return (
      <article className="game-card game-card-list is-skeleton-card" aria-hidden="true">
        <div className="game-card-hitarea game-card-hitarea-list">
          <div className="game-row-media">
            <div className="game-row-poster game-row-poster-fallback" />
          </div>
          <div className="game-row-body">
            <div className="game-row-head">
              <h3 className="is-skeleton" />
            </div>
            <div className="game-row-stats">
              <div className="game-row-stat">
                <span className="is-skeleton" />
                <strong className="is-skeleton" />
              </div>
              <div className="game-row-stat">
                <span className="is-skeleton" />
                <strong className="is-skeleton" />
              </div>
            </div>
          </div>
        </div>
      </article>
    );
  }

  return (
    <article className="game-card is-skeleton-card" aria-hidden="true">
      <div className="game-poster-wrap">
        <div className="game-poster game-poster-fallback" />
      </div>
      <div className="game-card-body">
        <h3 className="is-skeleton" />
        <div className="game-subline">
          <span className="is-skeleton" />
          <span className="is-skeleton" />
        </div>
        <div className="game-meta-row">
          <span className="game-time is-skeleton" />
        </div>
      </div>
    </article>
  );
}
