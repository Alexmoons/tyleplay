import React, { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  Archive,
  ChartColumn,
  LayoutDashboard,
  Library,
  Settings,
  Trophy,
} from "lucide-react";
import { navItems } from "../lib/game-helpers";
import appLogo from "../../src/picture/tyleplay2.png";
import {
  DEFAULT_USER_SETTINGS,
  USER_SETTINGS_UPDATED_EVENT,
  fetchUserSettings,
  normalizeUserSettings,
} from "../pages/settings/user-settings-storage";

export default function Sidebar({ activeView, onNavigate }) {
  const [userSettings, setUserSettings] = useState(DEFAULT_USER_SETTINGS);

  useEffect(() => {
    let cancelled = false;

    async function loadUserSettings() {
      try {
        const nextSettings = await fetchUserSettings();
        if (!cancelled) {
          setUserSettings(normalizeUserSettings(nextSettings));
        }
      } catch {
        if (!cancelled) {
          setUserSettings(DEFAULT_USER_SETTINGS);
        }
      }
    }

    function handleUpdated(event) {
      if (event?.detail) {
        setUserSettings(normalizeUserSettings(event.detail));
        return;
      }
      loadUserSettings();
    }

    loadUserSettings();
    window.addEventListener(USER_SETTINGS_UPDATED_EVENT, handleUpdated);
    return () => {
      cancelled = true;
      window.removeEventListener(USER_SETTINGS_UPDATED_EVENT, handleUpdated);
    };
  }, []);

  const profileName = String(userSettings.displayName || userSettings.fullName || "User").trim();
  const statusLabel = String(userSettings.accountStatus || "Active").trim();
  const initials = profileName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("") || "U";

  const allNavItems = [
    ...navItems,
    { id: "settings", label: "Settings" }
  ];

  return (
    <aside className="w-[240px] flex-shrink-0 bg-[#0a0a0a] flex flex-col justify-between h-full z-10 transition-all duration-300 border-r border-[#1a1a1a]">
      <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0">
        
        {/* Logo Section - drag region for window movement */}
        <div
          className="flex items-center gap-3 px-6 py-6 overflow-hidden group mb-2"
          data-tauri-drag-region
          onPointerDown={async (e) => {
            if (e.button !== 0) return;
            try {
              e.preventDefault();
              await getCurrentWindow().startDragging();
            } catch {}
          }}
          style={{ cursor: "default" }}
        >
          <div className="h-9 w-9 rounded-xl bg-[#1e1e1e] flex items-center justify-center flex-shrink-0 shadow-md">
            <img src={appLogo} alt="TylePlay logo" className="w-5 h-5 object-contain" />
          </div>
          <h1 className="text-xl font-black tracking-tight text-white whitespace-nowrap">
            Tyle<span className="text-[#558467]">Play</span>
          </h1>
        </div>

        {/* Navigation */}
        <nav className="px-3 space-y-1" aria-label="Primary">
          {allNavItems.map((item) => {
            const isActive = item.id === activeView;
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={isActive}
                onClick={() => onNavigate(item.id)}
                style={isActive ? { background: "rgba(112, 104, 255, 0.18)", borderRadius: "9999px" } : {}}
                className={`w-full flex items-center gap-4 px-4 py-2.5 text-sm transition-all cursor-pointer group ${
                  isActive
                    ? "text-white font-bold"
                    : "text-[#8b92a0] hover:text-white hover:bg-white/[0.05] font-medium rounded-full"
                }`}
              >
                <span className={isActive ? "text-[#a89eff]" : "text-[#6b7280] group-hover:text-gray-300 transition-colors"}>
                  <SidebarNavIcon id={item.id} />
                </span>
                <span className="whitespace-nowrap">{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom Section: Profile */}
      <div className="flex-shrink-0 px-4 py-4 border-t border-[#1a1a1a]">
        <div className="flex items-center gap-3 px-2">
          {userSettings.avatarDataUrl ? (
            <img src={userSettings.avatarDataUrl} alt={`${profileName} avatar`} className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-[#558467] text-white font-black text-xs flex items-center justify-center flex-shrink-0">
              {initials}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-white truncate">{profileName}</p>
            <p className="text-[10px] text-[#8faea7] truncate">{statusLabel}</p>
          </div>
        </div>
      </div>
    </aside>
  );
}

function SidebarNavIcon({ id }) {
  switch (id) {
    case "dashboard":
      return <LayoutDashboard size={20} />;
    case "library":
      return <Library size={20} />;
    case "archive":
      return <Archive size={20} />;
    case "stats":
      return <ChartColumn size={20} />;
    case "achievements":
      return <Trophy size={20} />;
    case "settings":
      return <Settings size={20} />;
    default:
      return <LayoutDashboard size={20} />;
  }
}
