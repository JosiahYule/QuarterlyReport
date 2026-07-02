// Swaps the tab favicon to a "Q1"–"Q4" glyph rendered inline as SVG, so the
// tab always identifies the quarter on screen without shipping four static
// image files. Mirrors the existing document.title-per-quarter pattern.
function faviconDataUrl(label) {
  // A plain glyph on a transparent background disappears on dark tab bars, so
  // it sits on a white plate — visible against light or dark browser chrome.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">` +
    `<rect width="100" height="100" rx="20" fill="#ffffff"/>` +
    `<rect x="1" y="1" width="98" height="98" rx="19" fill="none" stroke="#e5e3df" stroke-width="2"/>` +
    `<text x="50" y="72" font-family="Georgia, 'Times New Roman', Times, serif" ` +
    `font-size="58" font-weight="600" text-anchor="middle" fill="#14110d">${label}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

let lastLabel = null;

export function setFavicon(label) {
  if (label === lastLabel) return;
  lastLabel = label;
  let link = document.querySelector('link[rel="icon"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  link.type = "image/svg+xml";
  link.href = faviconDataUrl(label);
}
