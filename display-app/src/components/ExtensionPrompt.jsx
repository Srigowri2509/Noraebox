import React, { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";

export default function ExtensionPrompt({ roomId, options = [30, 60], onClose, onExtended }) {
  const [submitting, setSubmitting] = useState(null);
  const [error, setError] = useState("");
  const buttonRefs = useRef([]);

  useEffect(() => {
    const timer = window.setTimeout(() => buttonRefs.current[0]?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const handleRemoteNavigation = useCallback((event) => {
    const keyByCode = {
      19: "ArrowUp",
      20: "ArrowDown",
      21: "ArrowLeft",
      22: "ArrowRight",
      37: "ArrowLeft",
      38: "ArrowUp",
      39: "ArrowRight",
      40: "ArrowDown",
    };
    const key = event.key === "Unidentified" ? keyByCode[event.keyCode] : event.key;
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(key)) return;
    event.preventDefault();
    const buttons = buttonRefs.current.filter(Boolean);
    if (!buttons.length) return;
    const currentIndex = Math.max(0, buttons.indexOf(document.activeElement));
    let nextIndex = currentIndex;
    if (key === "Home") nextIndex = 0;
    else if (key === "End") nextIndex = buttons.length - 1;
    else if (key === "ArrowLeft" || key === "ArrowUp") {
      nextIndex = (currentIndex - 1 + buttons.length) % buttons.length;
    } else {
      nextIndex = (currentIndex + 1) % buttons.length;
    }
    buttons[nextIndex]?.focus();
  }, []);

  const extend = async (minutes) => {
    setSubmitting(minutes);
    setError("");
    try {
      await api(`/rooms/${roomId}/extend`, {
        method: "POST",
        body: JSON.stringify({ add_minutes: minutes, source: "guest_prompt" }),
      });
      onExtended?.(minutes);
      onClose();
    } catch (err) {
      console.error("Could not extend the session", err);
      setError("Could not add time. Select Not now to continue, or try again.");
      window.setTimeout(() => buttonRefs.current[options.length]?.focus(), 0);
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <div className="display-modal-backdrop display-modal-backdrop--urgent">
      <section className="display-modal extension-prompt" role="alertdialog" aria-modal="true" aria-label="Extend session" onKeyDown={handleRemoteNavigation}>
        <p className="display-modal__eyebrow">Your session is nearly over</p>
        <h2>Seems like you are having fun!</h2>
        <p>Would you like to extend your session?</p>
        <div className="extension-prompt__options">
          {options.map((minutes, index) => (
            <button
              type="button"
              key={minutes}
              ref={(element) => { buttonRefs.current[index] = element; }}
              onClick={() => extend(minutes)}
              disabled={submitting !== null}
            >
              {submitting === minutes
                ? "Adding..."
                : minutes === 60
                  ? "Extend by 1 hour"
                  : `Extend by ${minutes} minutes`}
            </button>
          ))}
        </div>
        {error ? <p className="display-modal__message display-modal__message--error">{error}</p> : null}
        <button
          type="button"
          ref={(element) => { buttonRefs.current[options.length] = element; }}
          className="extension-prompt__decline"
          onClick={onClose}
          disabled={submitting !== null}
        >
          Not now
        </button>
      </section>
    </div>
  );
}
