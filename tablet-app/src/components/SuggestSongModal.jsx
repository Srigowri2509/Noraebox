import React, { useState } from "react";
import { api } from "../api";

const inputStyle = {
  background: "rgba(15, 23, 42, 0.5)",
  border: "2px solid rgba(100, 116, 139, 0.25)",
  borderRadius: "50px",
  boxShadow: "0 2px 8px rgba(0,0,0,0.15), inset 0 1px 3px rgba(0,0,0,0.1)",
  height: "48px",
  paddingLeft: "20px",
  paddingRight: "20px",
  fontSize: "14px",
  color: "#fff",
  outline: "none",
  width: "100%",
  transition: "border-color 0.2s, box-shadow 0.2s",
};

const inputFocusStyle = {
  borderColor: "rgba(139, 92, 246, 0.6)",
  boxShadow: "0 2px 8px rgba(0,0,0,0.15), inset 0 1px 3px rgba(0,0,0,0.1), 0 0 0 3px rgba(139,92,246,0.15)",
};

const inputBlurStyle = {
  borderColor: "rgba(100, 116, 139, 0.25)",
  boxShadow: "0 2px 8px rgba(0,0,0,0.15), inset 0 1px 3px rgba(0,0,0,0.1)",
};

export default function SuggestSongModal({ isOpen, onClose, prefillTitle, prefillArtist, prefillLanguage, roomId }) {
  const [title, setTitle] = useState(prefillTitle || "");
  const [artist, setArtist] = useState(prefillArtist || "");
  const [language, setLanguage] = useState(prefillLanguage || "");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  React.useEffect(() => {
    if (isOpen) {
      setTitle(prefillTitle || "");
      setArtist(prefillArtist || "");
      setLanguage(prefillLanguage || "");
      setSubmitted(false);
    }
  }, [isOpen, prefillTitle, prefillArtist, prefillLanguage]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;

    setSubmitting(true);
    try {
      await api("/songs/suggestions", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          artist: artist.trim() || null,
          language: language.trim() || null,
          room_id: roomId || null,
        }),
      });
      setSubmitted(true);
    } catch (err) {
      console.error("Error submitting song suggestion:", err);
      alert("Failed to submit suggestion. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleFocus = (e) => {
    Object.assign(e.target.style, inputFocusStyle);
  };
  const handleBlur = (e) => {
    Object.assign(e.target.style, inputBlurStyle);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)" }}
      onClick={onClose}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "420px",
          margin: "0 20px",
          background: "linear-gradient(160deg, #1a1740 0%, #0d1224 100%)",
          borderRadius: "32px",
          border: "1px solid rgba(139,92,246,0.2)",
          boxShadow: "0 0 60px rgba(124,58,237,0.15), 0 30px 60px rgba(0,0,0,0.5)",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {submitted ? (
          <div style={{ padding: "40px 32px", textAlign: "center" }}>
            <div
              style={{
                width: 64, height: 64, borderRadius: "50%",
                background: "rgba(34,197,94,0.12)", border: "2px solid rgba(34,197,94,0.3)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 28, color: "#22c55e", margin: "0 auto 16px",
              }}
            >
              ✓
            </div>
            <p style={{ color: "#22c55e", fontWeight: 700, fontSize: 18, margin: "0 0 8px" }}>
              Thanks for your suggestion!
            </p>
            <p style={{ color: "#94a3b8", fontSize: 13, margin: "0 0 20px" }}>
              We'll review <span style={{ color: "#fff", fontWeight: 500 }}>"{title}"</span> and add it if available.
            </p>
            <button
              onClick={onClose}
              style={{
                padding: "10px 28px", borderRadius: 50, border: "none",
                background: "#334155", color: "#fff", fontSize: 13,
                fontWeight: 600, cursor: "pointer",
              }}
            >
              Close
            </button>
          </div>
        ) : (
          <>
            {/* Header */}
            <div style={{ padding: "28px 32px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 22 }}>💡</span>
                <span style={{ color: "#fff", fontWeight: 800, fontSize: 20 }}>Suggest a Song</span>
              </div>
              <button
                onClick={onClose}
                style={{
                  width: 36, height: 36, borderRadius: "50%", border: "none",
                  background: "rgba(255,255,255,0.06)", color: "#94a3b8",
                  fontSize: 16, cursor: "pointer", display: "flex",
                  alignItems: "center", justifyContent: "center",
                  transition: "background 0.2s, color 0.2s",
                }}
                onMouseEnter={(e) => { e.target.style.background = "rgba(255,255,255,0.12)"; e.target.style.color = "#fff"; }}
                onMouseLeave={(e) => { e.target.style.background = "rgba(255,255,255,0.06)"; e.target.style.color = "#94a3b8"; }}
              >
                ✕
              </button>
            </div>

            <p style={{ padding: "8px 32px 0", color: "#94a3b8", fontSize: 13, lineHeight: 1.5, margin: 0 }}>
              Can't find what you're looking for? Let us know and we'll try to add it.
            </p>

            {/* Form */}
            <form onSubmit={handleSubmit} style={{ padding: "20px 32px 28px" }}>
              <div style={{ marginBottom: 18 }}>
                <label style={{ display: "block", color: "#cbd5e1", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
                  Song Title *
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Enter song name..."
                  required
                  autoFocus
                  style={{ ...inputStyle, "::placeholder": { color: "#475569" } }}
                  onFocus={handleFocus}
                  onBlur={handleBlur}
                />
              </div>

              <div style={{ marginBottom: 18 }}>
                <label style={{ display: "block", color: "#cbd5e1", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
                  Artist
                </label>
                <input
                  type="text"
                  value={artist}
                  onChange={(e) => setArtist(e.target.value)}
                  placeholder="Artist name (optional)"
                  style={inputStyle}
                  onFocus={handleFocus}
                  onBlur={handleBlur}
                />
              </div>

              <div style={{ marginBottom: 24 }}>
                <label style={{ display: "block", color: "#cbd5e1", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
                  Language
                </label>
                <input
                  type="text"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  placeholder="e.g. Telugu, Hindi, English..."
                  style={inputStyle}
                  onFocus={handleFocus}
                  onBlur={handleBlur}
                />
              </div>

              <button
                type="submit"
                disabled={!title.trim() || submitting}
                style={{
                  width: "100%",
                  height: 50,
                  borderRadius: 50,
                  border: "none",
                  color: "#fff",
                  fontSize: 15,
                  fontWeight: 700,
                  letterSpacing: "0.03em",
                  cursor: !title.trim() || submitting ? "not-allowed" : "pointer",
                  opacity: !title.trim() || submitting ? 0.4 : 1,
                  background: !title.trim() || submitting
                    ? "#475569"
                    : "linear-gradient(135deg, #7c3aed, #ec4899)",
                  boxShadow: !title.trim() || submitting
                    ? "none"
                    : "0 4px 20px rgba(124,58,237,0.4), 0 0 40px rgba(236,72,153,0.15)",
                  transition: "transform 0.15s, opacity 0.2s, box-shadow 0.2s",
                }}
                onMouseEnter={(e) => { if (title.trim() && !submitting) e.target.style.transform = "scale(1.02)"; }}
                onMouseLeave={(e) => { e.target.style.transform = "scale(1)"; }}
              >
                {submitting ? "Submitting..." : "SUBMIT SUGGESTION"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
