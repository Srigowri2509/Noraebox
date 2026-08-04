import { useState, useEffect } from "react";
import { api } from "../api";

console.log("🔥 THIS ROOM MODAL IS BEING USED");

export default function RoomModal({ room, onClose, onStart, onExtend, onCancel }) {
  // All state hooks must be declared at the top level (before any early returns)
  const [hasActiveSession, setHasActiveSession] = useState(false);
  const [loadingSession, setLoadingSession] = useState(true);
  const [remainingMinutes, setRemainingMinutes] = useState(null);
  const [useCustom, setUseCustom] = useState(false);
  const [selectedMinutes, setSelectedMinutes] = useState(60);

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

  if (!room) return null;

  // Room is "free" if there's no active session
  const isFree = !hasActiveSession;

  const handleConfirm = () => {
    if (isFree) onStart(selectedMinutes);
    else onExtend(selectedMinutes);
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

        {/* Time Select Mode Toggle */}
        <div className="flex justify-center mb-6">
          <div className="flex gap-2 bg-gray-100 rounded-lg p-1">
            <button
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
              onClick={() => {
                setUseCustom(true);
                setSelectedMinutes(15);
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
        </div>

        {/* BUTTON: Confirm */}
        <button
          onClick={handleConfirm}
          className="w-full py-4 rounded-xl text-white text-xl font-semibold 
                     bg-purple-600 hover:bg-purple-700 
                     transition-all shadow-md active:scale-95 cursor-pointer"
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
