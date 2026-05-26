import React, { useState, useEffect } from "react";
import Display from "./screens/Display";
import RoomSelectModal from "./components/RoomSelectModal";
import AppErrorBoundary from "./components/AppErrorBoundary";
import { ensureDeviceRegistered } from "./init/registerDevice";
import { api, API_BASE } from "./api";
import updateService from "./services/updateService";

const STARTUP_TIMEOUT_MS = 20000;

export default function App() {
  const [roomId, setRoomId] = useState(null);
  const [isRegistering, setIsRegistering] = useState(true);
  const [deviceInfo, setDeviceInfo] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [showRoomSelect, setShowRoomSelect] = useState(false);
  const [startupError, setStartupError] = useState("");
  const [startupDetails, setStartupDetails] = useState("");

  const handleStartupFailure = (message, details = "") => {
    console.error("Display App startup failure:", message, details);
    setStartupError(message);
    setStartupDetails(details);
    setIsRegistering(false);
  };

  // Log only — do not replace the whole UI on benign async errors (updates, network blips).
  useEffect(() => {
    const onError = (event) => {
      console.error("Display App runtime error:", event?.error || event?.message);
    };
    const onUnhandledRejection = (event) => {
      console.error("Display App unhandled rejection:", event?.reason);
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, []);

  useEffect(() => {
    updateService.scheduleDailyCheck(3, 0);
    return () => updateService.stopScheduledChecks();
  }, []);

  useEffect(() => {
    let isMounted = true;
    const timeoutId = window.setTimeout(() => {
      if (!isMounted) return;
      handleStartupFailure(
        "Startup timed out.",
        `Could not finish initialization in ${STARTUP_TIMEOUT_MS / 1000}s. Check backend reachability at ${API_BASE}.`
      );
    }, STARTUP_TIMEOUT_MS);

    (async () => {
      try {
        const result = await ensureDeviceRegistered();
        if (!isMounted) return;

        if (result && result.error) {
          handleStartupFailure("Device registration failed.", result.error);
          return;
        }

        setDeviceInfo(result.device);

        try {
          const roomsRes = await api("/rooms");
          const roomsData = Array.isArray(roomsRes) ? roomsRes : roomsRes.data || [];
          setRooms(roomsData);
        } catch (error) {
          console.error("Error fetching rooms:", error);
          setRooms([]);
        }

        if (result.assigned && result.room_id) {
          localStorage.setItem("room_id", result.room_id);
          localStorage.setItem("roomId", result.room_id);
          setRoomId(result.room_id);
          setShowRoomSelect(false);
        } else {
          const savedRoom =
            localStorage.getItem("room_id") || localStorage.getItem("roomId");
          if (savedRoom) {
            setRoomId(savedRoom);
            setShowRoomSelect(false);
          } else {
            setShowRoomSelect(true);
            setRoomId(null);
          }
        }
      } catch (error) {
        console.error("Error in device registration:", error);
        if (!isMounted) return;
        const savedRoom =
          localStorage.getItem("room_id") || localStorage.getItem("roomId");
        if (savedRoom) {
          setRoomId(savedRoom);
          setShowRoomSelect(false);
        } else {
          setShowRoomSelect(true);
          setRoomId(null);
        }
      } finally {
        if (isMounted) {
          window.clearTimeout(timeoutId);
          setIsRegistering(false);
        }
      }
    })();

    return () => {
      isMounted = false;
      window.clearTimeout(timeoutId);
    };
  }, []);

  /** RoomSelectModal already calls assign-room API — only update local state (no reload). */
  const handleRoomSelect = (selectedRoomId) => {
    if (!selectedRoomId) return;
    localStorage.setItem("roomId", selectedRoomId);
    localStorage.setItem("room_id", selectedRoomId);
    setRoomId(selectedRoomId);
    setShowRoomSelect(false);
  };

  if (startupError) {
    return (
      <div className="startup-error-screen">
        <div className="startup-error-card">
          <h1 className="startup-error-title">Display App Startup Error</h1>
          <p className="startup-error-message">{startupError}</p>
          <p className="startup-error-meta">API endpoint: {API_BASE}</p>
          {startupDetails ? <pre className="startup-error-details">{startupDetails}</pre> : null}
          <button type="button" className="startup-error-retry" onClick={() => window.location.reload()}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (isRegistering) {
    return (
      <div className="startup-loading-screen">
        <div className="startup-loading-card">
          <h1 className="startup-loading-title">Norebox Display</h1>
          <p className="startup-loading-subtitle">Connecting to server…</p>
          <p className="startup-error-meta">{API_BASE}</p>
        </div>
      </div>
    );
  }

  if (showRoomSelect || !roomId) {
    return (
      <RoomSelectModal
        rooms={rooms}
        device={deviceInfo}
        onSelect={handleRoomSelect}
        onClose={() => alert("Please select a room to continue.")}
      />
    );
  }

  return (
    <AppErrorBoundary>
      <Display roomId={roomId} />
    </AppErrorBoundary>
  );
}
