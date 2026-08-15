import { useState, useEffect } from "react";
import { api } from "../api";

console.log("🔥 THIS ROOM MODAL IS BEING USED");

export default function RoomModal({ room, onClose, onStart, onExtend, onCancel, onRequestExtension }) {
  // All state hooks must be declared at the top level (before any early returns)
  const [hasActiveSession, setHasActiveSession] = useState(false);
  const [loadingSession, setLoadingSession] = useState(true);
  const [remainingMinutes, setRemainingMinutes] = useState(null);
  const [useCustom, setUseCustom] = useState(false);
  const [selectedMinutes, setSelectedMinutes] = useState(60);
  const [sendingPrompt, setSendingPrompt] = useState(false);
  const [promptSent, setPromptSent] = useState(false);

  useEffect(() => {
    if (!room) {
      setLoadingSession(false);
      setHasActiveSession(false);
      return;
    }
    
    // Fetch session data to check if there's an active session
    const fetchSession = async () => {
      try {
        const sessionData = await api(`/rooms/${room.id}/session`);
        const session = sessionData.session;
        // Check if there's an active session
        const isActive = session && (session.status === 'active' || session.status === 'playing' || session.status === 'completed');
        setHasActiveSession(isActive);
        if (isActive && session) {
          if (session.session_end_time) {
            const rem = Math.max(0, (new Date(session.session_end_time).getTime() - Date.now()) / 60000);
            setRemainingMinutes(Math.ceil(rem));
          } else if (session.session_start_time && session.total_minutes) {
            const elapsed = (Date.now() - new Date(session.session_start_time).getTime()) / 60000;
            setRemainingMinutes(Math.max(0, Math.ceil(session.total_minutes - elapsed)));
          } else {
            setRemainingMinutes(session.total_minutes ?? null);
          }
        } else {
          setRemainingMinutes(null);
        }
      } catch (error) {
        console.error("Error fetching session:", error);
        setHasActiveSession(false);
      } finally {
        setLoadingSession(false);
      }
    };

    fetchSession();
  }, [room]);

  // Prompt delivery is scoped to the selected room. Do not carry the
  // confirmation/disabled state over when the operator opens another TV.
  useEffect(() => {
    setSendingPrompt(false);
    setPromptSent(false);
  }, [room?.id]);

  if (!room) return null;

  // Room is "free" if there's no active session
  const isFree = !hasActiveSession;
  const minutesToSubmit = Number(selectedMinutes);
  const hasValidMinutes = Number.isInteger(minutesToSubmit) && minutesToSubmit > 0;

  const handleConfirm = () => {
    if (!hasValidMinutes) return;
    if (isFree) onStart(minutesToSubmit);
    else onExtend(minutesToSubmit);
  };

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-200"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-3xl shadow-xl w-[520px] px-10 py-10 border border-gray-100 animate-fadeIn scale-anim"
      >
        {/* Title */}
        <h2 className="text-3xl font-semibold text-center text-gray-800">
          {room.name}
        </h2>

        {/* Subtitle */}
        <p className="text-xl text-purple-600 text-center mt-2 mb-4 font-medium">
          {loadingSession ? "Loading..." : (isFree ? "Start room session" : "Add time to session")}
        </p>
        {!loadingSession && !isFree && remainingMinutes != null ? (
          <p className="text-center text-gray-500 mb-8 text-lg">
            Currently <span className="font-semibold text-gray-700">{remainingMinutes} min</span> remaining
          </p>
        ) : (
          <div className="mb-10" />
        )}

        {!loadingSession && !isFree && onRequestExtension ? (
          <div className="mb-8 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-center">
            <p className="mb-3 text-sm font-medium text-amber-800">
              Schedule this anytime. It will appear during the final 5 minutes.
            </p>
            <button
              type="button"
              disabled={sendingPrompt || promptSent}
              onClick={async () => {
                setSendingPrompt(true);
                try {
                  await onRequestExtension();
                  setPromptSent(true);
                } finally {
                  setSendingPrompt(false);
                }
              }}
              className="w-full rounded-xl bg-amber-500 px-4 py-3 font-semibold text-white transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {sendingPrompt
                ? "Scheduling..."
                : promptSent
                  ? "Extension prompt scheduled"
                  : "Schedule extension prompt"}
            </button>
          </div>
        ) : null}

        {/* Time Select Mode Toggle */}
        <div className="flex justify-center mb-6">
          <div className="flex gap-2 bg-gray-100 rounded-lg p-1">
            <button
              type="button"
              onClick={() => {
                setUseCustom(false);
                setSelectedMinutes(60);
              }}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                !useCustom
                  ? "bg-white text-purple-600 shadow-sm"
                  : "text-gray-600 hover:text-gray-800"
              }`}
            >
              Quick Select
            </button>
            <button
              type="button"
              onClick={() => {
                setUseCustom(true);
                setSelectedMinutes("");
              }}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                useCustom
                  ? "bg-white text-purple-600 shadow-sm"
                  : "text-gray-600 hover:text-gray-800"
              }`}
            >
              Custom Minutes
            </button>
          </div>
        </div>

        {/* Tap-only duration choices */}
        <div className="mb-10 flex flex-col items-center">
          <label className="mb-4 text-lg font-semibold tracking-wide text-gray-700">
            {isFree ? "SESSION DURATION" : "TIME TO ADD"}
          </label>
          <div className="grid w-full grid-cols-3 gap-3">
            {(useCustom ? [15, 30, 60] : [60, 90, 120]).map((duration) => (
              <button
                type="button"
                key={duration}
                onClick={() => setSelectedMinutes(duration)}
                className={`rounded-xl border px-3 py-4 text-lg font-semibold transition-all ${
                  selectedMinutes === duration
                    ? "border-purple-600 bg-purple-600 text-white shadow-md"
                    : "border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100"
                }`}
              >
                {useCustom
                  ? `${duration} min`
                  : duration === 60
                    ? "1 hr"
                    : duration === 90
                      ? "1.5 hr"
                      : "2 hr"}
              </button>
            ))}
          </div>

          {useCustom ? (
            <div className="mt-5 w-full">
              <label
                htmlFor="custom-session-minutes"
                className="mb-2 block text-sm font-semibold text-gray-700"
              >
                Enter any number of minutes
              </label>
              <div className="relative">
                <input
                  id="custom-session-minutes"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoFocus
                  value={selectedMinutes}
                  onChange={(event) => {
                    const digitsOnly = event.target.value.replace(/\D/g, "");
                    setSelectedMinutes(digitsOnly === "" ? "" : Number(digitsOnly));
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && hasValidMinutes) handleConfirm();
                  }}
                  placeholder="For example: 51"
                  className="w-full rounded-xl border-2 border-purple-200 bg-white px-4 py-4 pr-24 text-xl font-semibold text-gray-900 outline-none transition focus:border-purple-600 focus:ring-4 focus:ring-purple-100"
                  aria-describedby="custom-session-minutes-help"
                />
                <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 font-semibold text-gray-500">
                  minutes
                </span>
              </div>
              <p id="custom-session-minutes-help" className="mt-2 text-sm text-gray-500">
                Enter any positive whole number, such as 2, 45, 51, or 67.
              </p>
            </div>
          ) : null}
        </div>

        {/* BUTTON: Confirm */}
        <button
          type="button"
          onClick={handleConfirm}
          disabled={!hasValidMinutes}
          className="w-full py-4 rounded-xl text-white text-xl font-semibold 
                     bg-purple-600 hover:bg-purple-700 
                     transition-all shadow-md active:scale-95 cursor-pointer
                     disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500 disabled:shadow-none"
        >
          {isFree ? "Start Session" : "Add Time"}
        </button>

        {/* BUTTON: Cancel Session (only show if there's an active session) */}
        {!loadingSession && !isFree && onCancel && (
          <button
            onClick={handleCancel}
            className="w-full py-4 rounded-xl text-white text-xl font-semibold 
                       bg-red-600 hover:bg-red-700 
                       transition-all shadow-md active:scale-95 cursor-pointer mt-4"
          >
            Cancel Session
          </button>
        )}

        {/* BUTTON: Close */}
        <button
          onClick={onClose}
          className="w-full py-4 rounded-xl text-gray-700 text-xl font-medium 
                     bg-white border border-gray-300 mt-4  
                     hover:bg-gray-100 transition-all active:scale-95 cursor-pointer"
        >
          Close
        </button>
      </div>
    </div>
  );
}
