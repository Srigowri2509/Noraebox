import { useMemo } from "react";

function shortUuid(uuid) {
  if (!uuid) return "—";
  const s = String(uuid);
  return s.length > 8 ? `${s.slice(0, 8)}…` : s;
}

function deviceLabel(device) {
  if (!device) return "";
  const name = String(device.name || "").trim();
  if (name && name.toLowerCase() !== "unnamed") return name;
  // Tablets register without a name, so fall back to a friendly type label
  // (e.g. "Tablet a1b2c3d4…") instead of a bare UUID.
  const typeLabel =
    device.device_type === "tablet"
      ? "Tablet"
      : device.device_type === "display"
      ? "Display"
      : "Device";
  return `${typeLabel} ${shortUuid(device.device_uuid)}`;
}

function isDisplay(device) {
  return device?.device_type === "display";
}

function isTablet(device) {
  return device?.device_type === "tablet";
}

function SlotSelect({ label, icon, room, devices, slotDevice, deviceType, onAssign, onDelete }) {
  const options = useMemo(() => {
    const pool = devices.filter(
      (d) =>
        (deviceType === "display" ? isDisplay(d) : isTablet(d)) &&
        (!d.room_id || d.room_id === room.id)
    );
    return pool.sort((a, b) => deviceLabel(a).localeCompare(deviceLabel(b)));
  }, [devices, room.id, deviceType]);

  const handleChange = async (e) => {
    const nextId = e.target.value;
    if (slotDevice?.id && nextId !== slotDevice.id) {
      await onAssign(slotDevice.id, null);
    }
    if (nextId && nextId !== slotDevice?.id) {
      await onAssign(nextId, room.id);
    }
  };

  return (
    <label className="device-slot">
      <span className="device-slot__label">
        <span className="device-slot__icon" aria-hidden>
          {icon}
        </span>
        {label}
      </span>
      <div className="device-slot__row">
        <select
          className="device-slot__select"
          value={slotDevice?.id || ""}
          onChange={handleChange}
        >
          <option value="">— Unassigned —</option>
          {options.map((d) => (
            <option key={d.id} value={d.id}>
              {deviceLabel(d)}
              {d.room_id && d.room_id !== room.id ? " (other)" : ""}
            </option>
          ))}
        </select>
        {slotDevice?.id ? (
          <button
            type="button"
            className="device-slot__delete"
            title="Delete this device"
            onClick={() => onDelete(slotDevice.id)}
          >
            🗑
          </button>
        ) : null}
      </div>
    </label>
  );
}

export default function DeviceRoomPanel({ rooms, devices, onAssign, onDelete, onDeleteUnassigned }) {
  const roomSlots = useMemo(() => {
    const map = new Map();
    for (const room of rooms) {
      map.set(room.id, { room, display: null, tablet: null });
    }
    for (const device of devices) {
      if (!device.room_id || !map.has(device.room_id)) continue;
      const slot = map.get(device.room_id);
      if (isDisplay(device)) slot.display = device;
      else if (isTablet(device)) slot.tablet = device;
    }
    return Array.from(map.values());
  }, [rooms, devices]);

  const unassigned = useMemo(() => {
    const list = devices.filter((d) => !d.room_id);
    return {
      display: list.filter(isDisplay),
      tablet: list.filter(isTablet),
      other: list.filter((d) => !isDisplay(d) && !isTablet(d)),
    };
  }, [devices]);

  const unassignedCount =
    unassigned.display.length + unassigned.tablet.length + unassigned.other.length;

  if (!rooms.length) {
    return (
      <p className="device-panel-empty">No rooms loaded. Devices will appear once rooms are available.</p>
    );
  }

  return (
    <section className="device-room-panel">
      <header className="device-room-panel__header">
        <h2 className="device-room-panel__title">Device assignments</h2>
        <p className="device-room-panel__hint">
          One display TV and one tablet per room. Pick a device in each slot — no long list to scroll.
        </p>
      </header>

      <div className="device-room-grid">
        {roomSlots.map(({ room, display, tablet }) => (
          <article key={room.id} className="device-room-card">
            <h3 className="device-room-card__name">{room.name || `Room ${shortUuid(room.id)}`}</h3>
            <SlotSelect
              label="Display"
              icon="📺"
              room={room}
              devices={devices}
              slotDevice={display}
              deviceType="display"
              onAssign={onAssign}
              onDelete={onDelete}
            />
            <SlotSelect
              label="Tablet"
              icon="📱"
              room={room}
              devices={devices}
              slotDevice={tablet}
              deviceType="tablet"
              onAssign={onAssign}
              onDelete={onDelete}
            />
          </article>
        ))}
      </div>

      {unassignedCount > 0 && (
        <details className="device-unassigned">
          <summary className="device-unassigned__summary">
            Unassigned devices ({unassigned.display.length} display, {unassigned.tablet.length}{" "}
            tablet
            {unassigned.other.length > 0 ? `, ${unassigned.other.length} other` : ""})
          </summary>
          <div className="device-unassigned__body">
            <button
              type="button"
              className="device-unassigned__clear"
              onClick={onDeleteUnassigned}
            >
              🗑 Delete all unassigned devices ({unassignedCount})
            </button>
            {unassigned.display.length > 0 && (
              <div className="device-unassigned__group">
                <span className="device-unassigned__group-label">📺 Display</span>
                <div className="device-unassigned__chips">
                  {unassigned.display.map((d) => (
                    <span key={d.id} className="device-chip device-chip--display">
                      {deviceLabel(d)}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {unassigned.tablet.length > 0 && (
              <div className="device-unassigned__group">
                <span className="device-unassigned__group-label">📱 Tablet</span>
                <div className="device-unassigned__chips">
                  {unassigned.tablet.map((d) => (
                    <span key={d.id} className="device-chip device-chip--tablet">
                      {deviceLabel(d)}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {unassigned.other.length > 0 && (
              <div className="device-unassigned__group">
                <span className="device-unassigned__group-label">Other</span>
                <div className="device-unassigned__chips">
                  {unassigned.other.map((d) => (
                    <span key={d.id} className="device-chip">
                      {deviceLabel(d)}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </details>
      )}
    </section>
  );
}
