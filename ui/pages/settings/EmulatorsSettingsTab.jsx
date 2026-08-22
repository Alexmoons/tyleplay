import React, { useEffect, useState } from "react";
import { invoke } from "../../lib/tauri";
import {
  CheckCircleIcon,
  FolderIcon,
  GamepadIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
} from "../../components/icons";

function cleanDisplayArgs(args) {
  if (!args) return "";
  return String(args)
    .replace(/--\s*["']?\{rom_path\}["']?/gi, "")
    .replace(/["']?\{rom_path\}["']?/gi, "")
    .replace(/--\s*$/g, "")
    .trim();
}

const EMULATOR_PRESETS = [
  {
    name: "PCSX2",
    platform: "PlayStation 2",
    defaultArgs: "",
    hint: "Sony PlayStation 2",
  },
];

export default function EmulatorsSettingsTab({ onNotify }) {
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingProfile, setEditingProfile] = useState(null);
  const [formData, setFormData] = useState({
    name: "",
    platform: "",
    exePath: "",
    defaultArgs: "",
  });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pickingExe, setPickingExe] = useState(false);

  useEffect(() => {
    loadProfiles();
  }, []);

  async function loadProfiles() {
    setLoading(true);
    try {
      const data = await invoke("get_emulator_profiles");
      const cleaned = (Array.isArray(data) ? data : []).map((p) => ({
        ...p,
        defaultArgs: cleanDisplayArgs(p.defaultArgs || p.default_args || ""),
        default_args: cleanDisplayArgs(p.defaultArgs || p.default_args || ""),
      }));
      setProfiles(cleaned);
    } catch (err) {
      onNotify?.({
        tone: "danger",
        title: "Failed to load emulators",
        message: err?.message || String(err),
      });
    } finally {
      setLoading(false);
    }
  }

  function handleOpenAdd(preset = null) {
    if (preset) {
      setFormData({
        name: preset.name,
        platform: preset.platform || "",
        exePath: "",
        defaultArgs: cleanDisplayArgs(preset.defaultArgs || ""),
      });
    } else {
      setFormData({
        name: "",
        platform: "",
        exePath: "",
        defaultArgs: "",
      });
    }
    setEditingProfile(null);
    setIsModalOpen(true);
  }

  function handleOpenEdit(profile) {
    setEditingProfile(profile);
    setFormData({
      name: profile.name,
      platform: profile.platform || "",
      exePath: profile.exePath || profile.exe_path || "",
      defaultArgs: cleanDisplayArgs(profile.defaultArgs || profile.default_args || ""),
    });
    setIsModalOpen(true);
  }

  async function handleBrowseExe() {
    setPickingExe(true);
    try {
      const path = await invoke("pick_exe_path");
      if (path) {
        setFormData((prev) => ({ ...prev, exePath: path }));
      }
    } catch (err) {
      onNotify?.({
        tone: "danger",
        title: "Error choosing executable",
        message: err?.message || String(err),
      });
    } finally {
      setPickingExe(false);
    }
  }

  async function handleSave(e) {
    e.preventDefault();
    const name = formData.name.trim();
    const exePath = formData.exePath.trim();

    if (!name || !exePath) {
      onNotify?.({
        tone: "warning",
        title: "Missing required fields",
        message: "Emulator name and executable path are required.",
      });
      return;
    }

    setSaving(true);
    try {
      await invoke("save_emulator_profile", {
        input: {
          id: editingProfile ? editingProfile.id : null,
          name,
          platform: formData.platform.trim() || null,
          exePath,
          defaultArgs: formData.defaultArgs.trim() || null,
        },
      });

      // Wait 5 seconds to allow database and linked records to finish updating
      await new Promise((resolve) => setTimeout(resolve, 5000));

      onNotify?.({
        tone: "success",
        title: editingProfile ? "Emulator updated" : "Emulator added",
        message: `Saved configuration for ${name}.`,
      });

      setIsModalOpen(false);
      await loadProfiles();
    } catch (err) {
      onNotify?.({
        tone: "danger",
        title: "Failed to save emulator",
        message: err?.message || String(err),
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(profile) {
    if (!window.confirm(`Are you sure you want to delete emulator "${profile.name}"?`)) {
      return;
    }

    try {
      await invoke("delete_emulator_profile", { id: profile.id });
      onNotify?.({
        tone: "success",
        title: "Emulator removed",
        message: `Removed ${profile.name}.`,
      });
      await loadProfiles();
    } catch (err) {
      onNotify?.({
        tone: "danger",
        title: "Failed to delete emulator",
        message: err?.message || String(err),
      });
    }
  }

  return (
    <>
      {/* 1. Configured Profiles Big Shape */}
      <section className="settings-panel-card">
        <strong className="settings-panel-title">
          Configured Emulators {profiles.length > 0 ? `(${profiles.length})` : ""}
        </strong>

        {loading ? (
          <div className="py-6 text-center text-sm text-gray-400">Loading emulators...</div>
        ) : profiles.length === 0 ? (
          <div className="py-6 text-center text-sm text-gray-400">
            No emulators configured yet. Click the preset below to configure an emulator.
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "0.85rem", paddingTop: "0.25rem" }}>
            {profiles.map((profile) => (
              <div
                key={profile.id}
                style={{
                  background: "#1f1f1f",
                  borderRadius: "14px",
                  padding: "1rem 1.15rem",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                }}
              >
                <div>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "0.5rem" }}>
                    <div>
                      <h4 style={{ margin: 0, fontSize: "1rem", fontWeight: 700, color: "#ffffff" }}>{profile.name}</h4>
                      {profile.platform && (
                        <span style={{
                          display: "inline-block",
                          marginTop: "0.3rem",
                          padding: "0.15rem 0.6rem",
                          borderRadius: "9999px",
                          fontSize: "0.75rem",
                          fontWeight: 600,
                          background: "rgba(255, 255, 255, 0.08)",
                          color: "#e5e7eb",
                        }}>
                          {profile.platform}
                        </span>
                      )}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(profile)}
                        className="action-button action-button-secondary"
                        style={{ padding: "0.4rem", minHeight: "auto", borderRadius: "9999px" }}
                        title="Edit profile"
                      >
                        <PencilIcon className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(profile)}
                        className="action-button action-button-secondary"
                        style={{ padding: "0.4rem", minHeight: "auto", borderRadius: "9999px", color: "#f87171" }}
                        title="Delete profile"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <div style={{ marginTop: "0.75rem", display: "grid", gap: "0.25rem", fontSize: "0.78rem", color: "#9ca3af", fontFamily: "monospace", wordBreak: "break-all" }}>
                    <p style={{ margin: 0 }}>
                      <span style={{ color: "#6b7280" }}>Path:</span> {profile.exePath || profile.exe_path}
                    </p>
                    {(profile.defaultArgs || profile.default_args) && (
                      <p style={{ margin: 0 }}>
                        <span style={{ color: "#6b7280" }}>Args:</span> {profile.defaultArgs || profile.default_args}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 2. Quick Presets Big Shape */}
      <section className="settings-panel-card">
        <strong className="settings-panel-title">Quick Setup Presets</strong>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "0.75rem", paddingTop: "0.25rem" }}>
          {EMULATOR_PRESETS.map((preset) => {
            const isConfigured = profiles.some(
              (p) => (p.name || "").trim().toLowerCase() === preset.name.trim().toLowerCase()
            );

            return (
              <button
                key={preset.name}
                type="button"
                disabled={isConfigured}
                onClick={() => !isConfigured && handleOpenAdd(preset)}
                style={{
                  background: isConfigured ? "#191919" : "#1f1f1f",
                  borderRadius: "14px",
                  padding: "0.9rem 1.1rem",
                  border: isConfigured ? "1px solid rgba(255, 255, 255, 0.05)" : "0",
                  cursor: isConfigured ? "default" : "pointer",
                  textAlign: "left",
                  transition: "all 0.18s ease",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.3rem",
                  boxShadow: isConfigured ? "none" : "0 2px 8px rgba(0,0,0,0.25)",
                  opacity: isConfigured ? 0.7 : 1,
                }}
                onMouseEnter={(e) => {
                  if (!isConfigured) {
                    e.currentTarget.style.background = "#282828";
                    e.currentTarget.style.transform = "translateY(-1px)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isConfigured) {
                    e.currentTarget.style.background = "#1f1f1f";
                    e.currentTarget.style.transform = "translateY(0)";
                  }
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
                  <span style={{ fontWeight: 700, color: isConfigured ? "#cccccc" : "#ffffff", fontSize: "0.95rem" }}>
                    {preset.name}
                  </span>
                  {isConfigured ? (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.25rem",
                        color: "#4ade80",
                        fontSize: "0.72rem",
                        fontWeight: 600,
                        background: "rgba(74, 222, 128, 0.12)",
                        padding: "0.15rem 0.5rem",
                        borderRadius: "9999px",
                      }}
                    >
                      <CheckCircleIcon className="w-3.5 h-3.5" />
                      <span>Configured</span>
                    </span>
                  ) : (
                    <span style={{ color: "#818cf8", fontSize: "1.1rem", lineHeight: 1, display: "flex", alignItems: "center" }}>
                      <PlusIcon className="w-4 h-4" />
                    </span>
                  )}
                </div>
                <p style={{ margin: 0, fontSize: "0.8rem", color: isConfigured ? "#6b7280" : "#9ca3af" }}>{preset.hint}</p>
              </button>
            );
          })}
        </div>
      </section>

      {/* Modal Dialog for Add/Edit */}
      {isModalOpen && (
        <div
          className="confirm-modal-overlay"
          role="presentation"
          onClick={() => !saving && setIsModalOpen(false)}
        >
          <section
            className="confirm-modal"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
            style={{ maxWidth: "520px", width: "100%" }}
          >
            <div className="confirm-modal-head">
              <strong style={{ fontSize: "1.1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <GamepadIcon className="w-5 h-5 text-indigo-400" />
                {editingProfile ? `Edit Emulator: ${editingProfile.name}` : "Add Emulator Profile"}
              </strong>
            </div>

            <form onSubmit={handleSave} style={{ display: "grid", gap: "1rem", marginTop: "0.5rem" }}>
              <label className="edit-game-field">
                <span className="edit-game-field-label">Emulator Name *</span>
                <input
                  type="text"
                  required
                  placeholder="e.g. PCSX2"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  autoComplete="off"
                />
              </label>

              <label className="edit-game-field">
                <span className="edit-game-field-label">Platform / System</span>
                <input
                  type="text"
                  placeholder="e.g. PlayStation 2"
                  value={formData.platform}
                  onChange={(e) => setFormData({ ...formData, platform: e.target.value })}
                  autoComplete="off"
                />
              </label>

              <label className="edit-game-field">
                <span className="edit-game-field-label">Executable Path (.exe) *</span>
                <div className="edit-game-input-with-action">
                  <input
                    type="text"
                    required
                    placeholder="e.g. D:\Emulators\PCSX2\pcsx2-qt.exe"
                    value={formData.exePath}
                    onChange={(e) => setFormData({ ...formData, exePath: e.target.value })}
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    className="action-button action-button-browse"
                    onClick={handleBrowseExe}
                    disabled={pickingExe}
                  >
                    <FolderIcon />
                    <span>{pickingExe ? "Browsing..." : "Browse"}</span>
                  </button>
                </div>
              </label>

              <label className="edit-game-field">
                <span className="edit-game-field-label">Additional Launch Arguments (Optional)</span>
                <input
                  type="text"
                  placeholder="e.g. -fullscreen"
                  value={formData.defaultArgs}
                  onChange={(e) => setFormData({ ...formData, defaultArgs: e.target.value })}
                  autoComplete="off"
                />
              </label>

              <div className="confirm-modal-actions" style={{ marginTop: "0.5rem" }}>
                <button
                  type="button"
                  className="action-button action-button-secondary"
                  onClick={() => setIsModalOpen(false)}
                  disabled={saving}
                >
                  <span>Cancel</span>
                </button>
                <button
                  type="submit"
                  className="action-button action-button-primary"
                  disabled={saving}
                >
                  <span>{saving ? "Saving..." : "Save Emulator"}</span>
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
