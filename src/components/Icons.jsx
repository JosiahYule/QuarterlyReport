import React from "react";

// Inline SVG icons — consistent 1.5px stroke aligned to the type, replacing
// platform-dependent unicode glyphs (▾ ↑ ↓ ↕ ✕ ✓) that render with
// different weights and baselines across operating systems.

function Svg({ children, className = "", style }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
      style={style}
    >
      {children}
    </svg>
  );
}

export const IconCaret = (props) => (
  <Svg {...props}><path d="M4 6.25 8 10.25 12 6.25" /></Svg>
);

export const IconArrowUp = (props) => (
  <Svg {...props}><path d="M8 13V3M3.75 7.25 8 3l4.25 4.25" /></Svg>
);

export const IconArrowDown = (props) => (
  <Svg {...props}><path d="M8 3v10M3.75 8.75 8 13l4.25-4.25" /></Svg>
);

export const IconFlat = (props) => (
  <Svg {...props}><path d="M3.5 8h9" /></Svg>
);

export const IconClose = (props) => (
  <Svg {...props}><path d="M4 4l8 8M12 4l-8 8" /></Svg>
);

export const IconCheck = (props) => (
  <Svg {...props}><path d="M3 8.5 6.5 12 13 4.5" /></Svg>
);

export const IconSort = (props) => (
  <Svg {...props}><path d="M5 6.5 8 3.5l3 3M5 9.5l3 3 3-3" /></Svg>
);

export function DirIcon({ dir, ...props }) {
  if (dir === "up") return <IconArrowUp {...props} />;
  if (dir === "down") return <IconArrowDown {...props} />;
  return <IconFlat {...props} />;
}
