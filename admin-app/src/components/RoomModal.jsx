import { useState } from "react";

console.log("🔥 THIS ROOM MODAL IS BEING USED");

export default function RoomModal({ room, onClose, onStart, onExtend, onCancel }) {
  if (!room) return null;

  const isFree = !room.is_active;
  const [hours, setHours] = useState(1);
  const [minutes, setMinutes] = useState(0);
  const [useCustom, setUseCustom] = useState(false);
  const [customMinutes, setCustomMinutes] = useState(30);

  const handleConfirm = () => {
    let total;
    if (useCustom) {
      total = parseInt(customMinutes) || 0;
    } else {
      total = hours * 60 + minutes;
    }
    
    if (total <= 0) {
      alert("Please enter a valid time (greater than 0 minutes)");
      return;
    }
    
    if (isFree) onStart(total);
    else onExtend(total);
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
        <p className="text-xl text-purple-600 text-center mt-2 mb-10 font-medium">
          {isFree ? "Start room session" : "Extend room time"}
        </p>

        {/* Time Select Mode Toggle */}
        <div className="flex justify-center mb-6">
          <div className="flex gap-2 bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setUseCustom(false)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                !useCustom
                  ? "bg-white text-purple-600 shadow-sm"
                  : "text-gray-600 hover:text-gray-800"
              }`}
            >
              Quick Select
            </button>
            <button
              onClick={() => setUseCustom(true)}
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

        {/* Time Select */}
        {!useCustom ? (
          <div className="grid grid-cols-2 gap-8 mb-10 justify-items-center">
            {/* HOURS */}
            <div className="flex flex-col items-center">
              <label className="text-gray-700 font-semibold text-lg mb-2 tracking-wide">
                HOURS
              </label>
              <select
                value={hours}
                onChange={(e) => setHours(parseInt(e.target.value))}
                className="p-3 w-32 rounded-xl border border-gray-300 bg-white text-lg text-gray-800 shadow-sm hover:border-purple-400 focus:border-purple-500 focus:ring-2 focus:ring-purple-300 outline-none transition-all cursor-pointer"
              >
                {[0, 1, 2, 3, 4, 5].map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </div>

            {/* MINUTES */}
            <div className="flex flex-col items-center">
              <label className="text-gray-700 font-semibold text-lg mb-2 tracking-wide">
                MINUTES
              </label>
              <select
                value={minutes}
                onChange={(e) => setMinutes(parseInt(e.target.value))}
                className="p-3 w-32 rounded-xl border border-gray-300 bg-white text-lg text-gray-800 shadow-sm hover:border-purple-400 focus:border-purple-500 focus:ring-2 focus:ring-purple-300 outline-none transition-all cursor-pointer"
              >
                {[0, 15, 30, 45].map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ) : (
          <div className="mb-10 flex flex-col items-center">
            <label className="text-gray-700 font-semibold text-lg mb-4 tracking-wide">
              TOTAL MINUTES
            </label>
            <input
              type="number"
              min="1"
              max="600"
              value={customMinutes}
              onChange={(e) => setCustomMinutes(e.target.value)}
              placeholder="Enter minutes"
              className="p-4 w-48 rounded-xl border border-gray-300 bg-white text-2xl text-gray-800 text-center shadow-sm hover:border-purple-400 focus:border-purple-500 focus:ring-2 focus:ring-purple-300 outline-none transition-all"
            />
            <div className="mt-4 flex gap-2 flex-wrap justify-center">
              {[15, 30, 60, 90, 120, 180].map((m) => (
                <button
                  key={m}
                  onClick={() => setCustomMinutes(m)}
                  className="px-3 py-1 text-sm rounded-lg bg-purple-100 text-purple-700 hover:bg-purple-200 transition-all"
                >
                  {m} min
                </button>
              ))}
            </div>
          </div>
        )}

        {/* BUTTON: Confirm */}
        <button
          onClick={handleConfirm}
          className="w-full py-4 rounded-xl text-white text-xl font-semibold 
                     bg-purple-600 hover:bg-purple-700 
                     transition-all shadow-md active:scale-95 cursor-pointer"
        >
          Confirm
        </button>

        {/* BUTTON: Cancel Session (only show if room is active) */}
        {!isFree && onCancel && (
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
