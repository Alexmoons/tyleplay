import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { invoke } from "./lib/tauri";
import "./styles.css";

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Uncaught runtime error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: "40px", color: "#ffffff", background: "#161616", minHeight: "100vh", fontFamily: "sans-serif" }}>
          <h2 style={{ fontSize: "20px", marginBottom: "12px" }}>Application Render Error</h2>
          <p style={{ color: "#ff6b6b", marginBottom: "16px" }}>{String(this.state.error?.message || this.state.error)}</p>
          <pre style={{ background: "#0e0e0e", padding: "16px", borderRadius: "8px", overflow: "auto", fontSize: "12px", color: "#ccc" }}>
            {this.state.error?.stack}
          </pre>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{ padding: "10px 24px", background: "#7068ff", color: "#ffffff", border: "none", borderRadius: "9999px", cursor: "pointer", marginTop: "20px", fontWeight: "600" }}
          >
            Reload Application
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
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
