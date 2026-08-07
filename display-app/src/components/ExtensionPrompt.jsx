import React, { useState } from "react";
import { api } from "../api";

export default function ExtensionPrompt({ roomId, options = [30, 60], onClose, onExtended }) {
  const [submitting, setSubmitting] = useState(null);
  const [error, setError] = useState("");

  const extend = async (minutes) => {
    setSubmitting(minutes);
    setError("");
    try {
      await api(`/rooms/${roomId}/extend`, {
        method: "POST",
        body: JSON.stringify({ add_minutes: minutes }),
      });
      onExtended?.(minutes);
      onClose();
    } catch (err) {
      setError(err?.message || "Could not extend the session");
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <div className="display-modal-backdrop display-modal-backdrop--urgent">
      <section className="display-modal extension-prompt" role="alertdialog" aria-modal="true" aria-label="Extend session">
        <p className="display-modal__eyebrow">Your session is nearly over</p>
        <h2>Seems like you are having fun!</h2>
        <p>Would you like to extend your session?</p>
        <div className="extension-prompt__options">
          {options.map((minutes) => (
            <button type="button" key={minutes} onClick={() => extend(minutes)} disabled={submitting !== null}>
              {submitting === minutes
                ? "Adding..."
                : minutes === 60
                  ? "Extend by 1 hour"
                  : `Extend by ${minutes} minutes`}
            </button>
          ))}
        </div>
        {error ? <p className="display-modal__message display-modal__message--error">{error}</p> : null}
        <button type="button" className="extension-prompt__decline" onClick={onClose} disabled={submitting !== null}>Not now</button>
      </section>
    </div>
  );
}
