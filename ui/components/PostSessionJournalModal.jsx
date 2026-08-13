import React, { useState } from "react";
import { CheckIcon, PencilIcon, InfoCircleIcon } from "./icons";
import { formatDurationDetailed, formatSessionDay, formatSessionClock } from "../lib/game-helpers";
import { invoke } from "../lib/tauri";

function isCrossMidnightSession(session) {
  if (!session) return false;
  const startTs = Number(session.raw_started_at || session.started_at || 0);
  const endTs = Number(session.raw_ended_at || session.ended_at || 0);
  if (startTs <= 0 || endTs <= 0 || endTs <= startTs) return false;

  const startDate = new Date(startTs * 1000).toDateString();
  const endDate = new Date(endTs * 1000).toDateString();
  return startDate !== endDate;
}

export default function PostSessionJournalModal({
  isOpen,
  onClose,
  session,
  game,
  onSaved,
}) {
  if (!isOpen || !game) return null;

  const initialNote = session?.note || "";
  const hasExistingNote = Boolean(initialNote.trim());
  const [isEditing, setIsEditing] = useState(!hasExistingNote);
  const [note, setNote] = useState(initialNote);
  const [saving, setSaving] = useState(false);
  const isCrossMidnight = isCrossMidnightSession(session);

  const rawStart = Number(session?.raw_started_at || session?.started_at || 0);
  const rawEnd = Number(session?.raw_ended_at || session?.ended_at || 0);
  const rawDuration = Number(session?.raw_duration_seconds || session?.duration_seconds || 0);

  const startDateStr = rawStart ? formatSessionDay(rawStart) : null;
  const endDateStr = rawEnd ? formatSessionDay(rawEnd) : null;
  const isDifferentDate = startDateStr && endDateStr && startDateStr !== endDateStr;

  const dateLabel = isDifferentDate
    ? `${startDateStr} – ${endDateStr}`
    : startDateStr;

  const sessionClockLabel = rawStart
    ? `${formatSessionClock(rawStart)} - ${rawEnd ? formatSessionClock(rawEnd) : "Now"}`
    : null;

  const durationLabel = rawDuration
    ? formatDurationDetailed(rawDuration)
    : null;

  async function handleSave() {
    setSaving(true);
    try {
      await invoke("update_session_note", {
        sessionId: Number(session?.id || 0),
        note: note.trim() || null,
      });
      onSaved?.();
      onClose?.();
    } catch (err) {
      console.error("Failed to save session note:", err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-lg bg-[#161616] text-[#ffffff] rounded-[14px] shadow-2xl p-6 relative border-0 overflow-hidden">
        
        {/* Header */}
        <div className="pb-4 border-b border-white/5 mb-5">
          <h2 className="text-xl font-bold text-white tracking-tight mt-0">
            {game.name}
          </h2>
        </div>

        <div className="space-y-5">
          {/* Session Details */}
          <div className="space-y-2 text-xs text-gray-300">
            {dateLabel && (
              <div className="flex items-center gap-3">
                <span className="text-gray-400 font-medium min-w-[70px]">Date:</span>
                <span className="text-white font-semibold">{dateLabel}</span>
              </div>
            )}
            {sessionClockLabel && (
              <div className="flex items-center gap-3">
                <span className="text-gray-400 font-medium min-w-[70px]">Session:</span>
                <span className="text-white font-semibold">{sessionClockLabel}</span>
              </div>
            )}
            {durationLabel && (
              <div className="flex items-center gap-3">
                <span className="text-gray-400 font-medium min-w-[70px]">Duration:</span>
                <span className="text-white font-semibold">{durationLabel}</span>
              </div>
            )}
          </div>

          {/* Cross Midnight Warning / Notice */}
          {isCrossMidnight && (
            <div className="flex items-start gap-2 text-purple-300/80 text-xs leading-relaxed">
              <InfoCircleIcon className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
              <span>
                This session spans across midnight. Since it is recorded as a single play session, this note will be attached to the entire session and displayed across both split entries in the history table.
              </span>
            </div>
          )}

          {/* Note Area */}
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-300">
                {isEditing ? (hasExistingNote ? "Edit Note" : "Add Note") : "Note"}
              </label>
              {isEditing && (
                <span className={`text-[11px] font-mono ${note.length >= 950 ? "text-amber-400 font-bold" : "text-gray-400"}`}>
                  {note.length} / 1000
                </span>
              )}
            </div>

            {isEditing ? (
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={1000}
                placeholder="Record your achievements, notes, or thoughts for this session..."
                rows={6}
                className="w-full bg-[#1f1f1f] text-white text-sm rounded-xl p-3.5 border-0 focus:outline-none focus:ring-2 focus:ring-purple-500/50 resize-none transition-all placeholder:text-gray-500 min-h-[160px]"
                autoFocus
              />
            ) : (
              <div className="w-full bg-[#1f1f1f] text-white text-sm rounded-xl p-3.5 border border-white/5 min-h-[160px] max-h-[300px] overflow-y-auto whitespace-pre-wrap leading-relaxed select-text">
                {note}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/5">
            {isEditing ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    if (hasExistingNote) {
                      setNote(initialNote);
                      setIsEditing(false);
                    } else {
                      onClose();
                    }
                  }}
                  className="rr-btn rr-btn-idle rr-btn-lg"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={handleSave}
                  className="rr-btn rr-btn-save rr-btn-lg"
                >
                  <CheckIcon className="w-4 h-4" />
                  <span>{saving ? "Saving..." : "Save"}</span>
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  className="rr-btn rr-btn-idle rr-btn-lg"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="rr-btn rr-btn-save rr-btn-lg"
                >
                  <PencilIcon className="w-4 h-4" />
                  <span>Edit</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
