import React, { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "../../lib/tauri";
import {
  CalendarIcon,
  CameraIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  ClockIcon,
  FacebookIcon,
  GithubIcon,
  InstagramIcon,
  MailIcon,
  PencilIcon,
  PhoneIcon,
  TagIcon,
  TelegramIcon,
} from "../../components/icons";
import { DEFAULT_USER_SETTINGS, persistUserSettings } from "./user-settings-storage";

const MAX_AVATAR_SIZE_BYTES = 2 * 1024 * 1024;
const MAX_BIO_LENGTH = 150;



export default function UserSettingsTab({
  onNotify,
  userSettings,
  onUserSettingsSaved,
  onDirtyChange,
  onRequestConfirm,
}) {
  const fileInputRef = useRef(null);
  const [savedSettings, setSavedSettings] = useState(() => userSettings || DEFAULT_USER_SETTINGS);
  const [draftSettings, setDraftSettings] = useState(() => userSettings || DEFAULT_USER_SETTINGS);
  const [isSaving, setIsSaving] = useState(false);

  const isDirty = useMemo(() => JSON.stringify(savedSettings) !== JSON.stringify(draftSettings), [draftSettings, savedSettings]);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  useEffect(() => {
    const nextSettings = userSettings || DEFAULT_USER_SETTINGS;
    setSavedSettings(nextSettings);
    setDraftSettings(nextSettings);
  }, [userSettings]);

  function updateField(field, value) {
    setDraftSettings((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function handleAvatarClick() {
    fileInputRef.current?.click();
  }

  function handleAvatarChange(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    const mime = String(file.type || "").toLowerCase();
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(mime)) {
      onNotify?.({
        tone: "danger",
        title: "Unsupported avatar format.",
        message: "Use JPG, PNG, or WEBP.",
      });
      return;
    }

    if (Number(file.size || 0) > MAX_AVATAR_SIZE_BYTES) {
      onNotify?.({
        tone: "danger",
        title: "Avatar too large.",
        message: "Maximum file size is 2MB.",
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      updateField("avatarDataUrl", String(reader.result || DEFAULT_USER_SETTINGS.avatarDataUrl));
      onNotify?.({
        tone: "success",
        title: "Avatar updated.",
        message: "Preview applied. Save changes to keep it.",
      });
    };
    reader.onerror = () => {
      onNotify?.({
        tone: "danger",
        title: "Unable to read avatar.",
        message: "Please try another image.",
      });
    };
    reader.readAsDataURL(file);
  }

  async function performSave() {
    setIsSaving(true);
    try {
      const nextSettings = {
        ...draftSettings,
        bio: String(draftSettings.bio || "").slice(0, MAX_BIO_LENGTH),
      };
      const saved = await persistUserSettings(nextSettings);
      setSavedSettings(saved);
      onUserSettingsSaved?.(saved);
      onNotify?.({
        tone: "success",
        title: "User settings saved.",
        message: "Profile information has been updated.",
      });
    } catch (error) {
      onNotify?.({
        tone: "danger",
        title: "Unable to save user settings.",
        message: error?.message || String(error),
      });
    } finally {
      setIsSaving(false);
    }
  }

  function handleSave() {
    const fn = String(draftSettings.fullName || "").trim();
    const un = String(draftSettings.username || "").trim();
    const dn = String(draftSettings.displayName || "").trim();

    if (!fn || !un || !dn) {
      const missing = [];
      if (!fn) missing.push("Full Name");
      if (!un) missing.push("Username");
      if (!dn) missing.push("Display Name");

      onNotify?.({
        tone: "danger",
        title: "Required Fields Missing",
        message: `Please fill in required profile field(s): ${missing.join(", ")}.`,
      });
      return;
    }

    onRequestConfirm?.({
      title: "Save User Settings",
      message: "Save changes to your local user profile?",
      confirmLabel: "Save Changes",
      cancelLabel: "Cancel",
      tone: "primary",
      onConfirm: performSave,
    });
  }

  function handleDiscard() {
    onRequestConfirm?.({
      title: "Discard User Changes",
      message: "Discard all unsaved changes in User settings?",
      confirmLabel: "Discard Changes",
      cancelLabel: "Keep Editing",
      tone: "danger",
      onConfirm: () => {
        setDraftSettings(savedSettings);
        onNotify?.({
          tone: "info",
          title: "Changes discarded.",
          message: "User profile reverted to the last saved version.",
        });
      },
    });
  }

  return (
    <section className="user-settings-page">
      <div className="user-settings-grid">
        <div className="user-settings-column">
          <section className="user-settings-card">
            <div className="user-settings-card-head">
              <h2>Profile Information</h2>
            </div>

            <div className="user-profile-layout">
              <div className="user-avatar-panel">
                <div className="user-avatar-shell">
                  <img className="user-avatar-image" src={draftSettings.avatarDataUrl} alt={`${draftSettings.displayName} avatar`} />
                  <button type="button" className="user-avatar-edit" aria-label="Upload profile photo" onClick={handleAvatarClick}>
                    <PencilIcon />
                  </button>
                </div>
                <p>JPG, PNG or WEBP</p>
                <span>Max size 2MB</span>
                <button type="button" className="user-avatar-upload" onClick={handleAvatarClick}>
                  <CameraIcon />
                  <span>Upload Photo</span>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                  className="user-avatar-input"
                  onChange={handleAvatarChange}
                />
              </div>

              <div className="user-profile-form">
                <ProfileField label="Full Name" required>
                  <input value={draftSettings.fullName} placeholder="Alex Moons" onChange={(event) => updateField("fullName", event.target.value)} />
                </ProfileField>

                <ProfileField label="Username" required>
                  <input value={draftSettings.username} placeholder="alexmoons" onChange={(event) => updateField("username", event.target.value)} />
                </ProfileField>

                <ProfileField label="Display Name" required>
                  <input value={draftSettings.displayName} placeholder="Artyle" onChange={(event) => updateField("displayName", event.target.value)} />
                </ProfileField>

                <ProfileField label="Bio">
                  <div className="user-bio-wrap">
                    <textarea
                      value={draftSettings.bio}
                      placeholder="Gamer. Developer. Explorer. Tracking every adventure, one game at a time."
                      maxLength={MAX_BIO_LENGTH}
                      onChange={(event) => updateField("bio", event.target.value)}
                    />
                    <span>{String(draftSettings.bio || "").length}/{MAX_BIO_LENGTH}</span>
                  </div>
                </ProfileField>
              </div>
            </div>
          </section>

          <section className="user-settings-card">
            <div className="user-settings-card-head">
              <h2>Contact Information</h2>
            </div>
            <div className="user-contact-grid">
              <ProfileInputCard
                label="Email"
                icon={<MailIcon />}
                value={draftSettings.email}
                placeholder="alexmoons.artyle@gmail.com"
                onChange={(value) => updateField("email", value)}
              />
              <ProfileInputCard
                label="Phone"
                icon={<PhoneIcon />}
                value={draftSettings.phone}
                placeholder="+123456789"
                onChange={(value) => updateField("phone", value)}
              />
            </div>
          </section>
        </div>

        <div className="user-settings-column user-settings-column-side">
          <section className="user-settings-card">
            <div className="user-settings-card-head">
              <h2>Account Information</h2>
            </div>
            <div className="user-account-list">
              <AccountInfoRow icon={<CalendarIcon />} label="Member Since" value={draftSettings.memberSince} />
              <AccountInfoRow icon={<ClockIcon />} label="Last Login" value={draftSettings.lastLogin} />
              <AccountInfoRow
                icon={<CheckCircleIcon />}
                label="Account Status"
                value={
                  draftSettings.accountStatus === "-" ? "-" : (
                    <span className={`user-status-pill ${draftSettings.accountStatus === "Inactive" ? "is-inactive" : ""}`}>
                      <span className={`user-status-dot ${draftSettings.accountStatus === "Inactive" ? "is-inactive" : ""}`} />
                      <span>{draftSettings.accountStatus}</span>
                    </span>
                  )
                }
              />
              <AccountInfoRow icon={<TagIcon />} label="User ID" value={draftSettings.userId} />
            </div>
          </section>

          <section className="user-settings-card">
            <div className="user-settings-card-head">
              <h2>Social Links</h2>
            </div>
            <div className="user-social-grid">
              <SocialField
                icon={<GithubIcon />}
                type="github"
                value={draftSettings.github}
                onChange={(value) => updateField("github", value)}
                placeholder="your-username"
              />
              <SocialField
                icon={<InstagramIcon />}
                type="instagram"
                value={draftSettings.instagram}
                onChange={(value) => updateField("instagram", value)}
                placeholder="your-username"
              />
              <SocialField
                icon={<FacebookIcon />}
                type="facebook"
                value={draftSettings.facebook}
                onChange={(value) => updateField("facebook", value)}
                placeholder="your-username"
              />
              <SocialField
                icon={<TelegramIcon />}
                type="telegram"
                value={draftSettings.telegram}
                onChange={(value) => updateField("telegram", value)}
                placeholder="your-username"
              />
            </div>
          </section>
        </div>
      </div>

      <div className="user-settings-actions">
        <button type="button" className="action-button action-button-browse" disabled={!isDirty || isSaving} onClick={handleDiscard}>
          <span>Discard Changes</span>
        </button>
        <button type="button" className="action-button action-button-primary" disabled={!isDirty || isSaving} onClick={handleSave}>
          <span>{isSaving ? "Saving..." : "Save Changes"}</span>
        </button>
      </div>
    </section>
  );
}

function ProfileField({ label, hint, required, children }) {
  return (
    <label className="user-profile-field">
      <span className="user-profile-label">
        {label}
        {required ? <span className="user-required-asterisk">*</span> : null}
      </span>
      <div className="user-profile-control">{children}</div>
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

function ProfileInputCard({ label, icon, value, placeholder, onChange }) {
  return (
    <label className="user-contact-card">
      <span>{label}</span>
      <div className="user-contact-input">
        <i>{icon}</i>
        <input value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
      </div>
    </label>
  );
}

function SocialField({ icon, type = "github", value, onChange, placeholder }) {
  return (
    <label className={`user-social-card user-social-card-simple user-social-card-${type}`}>
      <i>{icon}</i>
      <input value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function AccountInfoRow({ icon, label, value }) {
  return (
    <div className="user-account-row">
      <div className="user-account-label">
        <i>{icon}</i>
        <span>{label}</span>
      </div>
      <div className="user-account-value">{value}</div>
    </div>
  );
}

