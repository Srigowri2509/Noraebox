import React from "react";
import { useRoom } from "../context/RoomContext";

export default function RoomSelection() {
  const { setRoomId } = useRoom();
  const demoRooms = [
    "13698756-bff4-49d1-8d61-cf8fba7c4333",
    "room-2",
    "room-3",
  ];
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="bg-slate-900/60 rounded-xl p-8">
        <h3 className="text-white mb-4">Select Room</h3>
        <div className="flex gap-3">
          {demoRooms.map((r) => (
            <button key={r} onClick={() => { setRoomId(r); localStorage.setItem("roomId", r); }} className="px-4 py-2 bg-purple-600 rounded">Open</button>
          ))}
        </div>
      </div>
    </div>
  );
}
