import React from "react";
import { labelForView } from "../lib/game-helpers";

export default function PlaceholderPage({ activeView }) {
  const label = labelForView(activeView);
  const isComingSoon = activeView === "achievements";

  return (
    <section className="library-panel placeholder-panel">
      <header className="page-header">
        <div className="page-heading">
          <h1>{label}</h1>
          <p>{isComingSoon ? "Coming Soon" : "Coming Soon"}</p>
        </div>
      </header>
    </section>
  );
}
