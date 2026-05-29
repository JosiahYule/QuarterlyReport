import React from "react";

export function EmptyNote() {
  return (
    <div className="empty-note">
      <svg
        className="empty-note-icon"
        viewBox="0 0 40 40"
        fill="none"
        aria-hidden="true"
        focusable="false"
      >
        <rect x="8" y="10" width="24" height="3" rx="1.5" fill="currentColor" opacity=".18" />
        <rect x="8" y="17" width="18" height="3" rx="1.5" fill="currentColor" opacity=".12" />
        <rect x="8" y="24" width="21" height="3" rx="1.5" fill="currentColor" opacity=".08" />
      </svg>
      <span>No notes yet.</span>
    </div>
  );
}

export function EmptyData({ label = "No data available." }) {
  return (
    <div className="empty-note">
      <svg
        className="empty-note-icon"
        viewBox="0 0 40 40"
        fill="none"
        aria-hidden="true"
        focusable="false"
      >
        <circle cx="20" cy="20" r="12" stroke="currentColor" strokeWidth="1.5" opacity=".2" />
        <line x1="20" y1="14" x2="20" y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity=".35" />
        <circle cx="20" cy="25.5" r="1.25" fill="currentColor" opacity=".35" />
      </svg>
      <span>{label}</span>
    </div>
  );
}
