import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { invoke } from "./lib/tauri";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

async function revealMainWindowAfterBoot() {
  try {
    const shouldShow = await invoke("should_show_main_window_on_boot");
    if (!shouldShow) {
      return;
    }

    await new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
    await new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
    await invoke("show_main_window");
  } catch {
    // Ignore boot reveal failures; the backend still controls autostart-hidden behavior.
  }
}

revealMainWindowAfterBoot();
