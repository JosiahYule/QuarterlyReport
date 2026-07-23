import { AGENCIES, QUARTERS } from "../config.js";

export const VIEW_LABELS = {
  social: "Social Media",
  web: "Website",
  paid: "Paid Media",
  trends: "Trends",
};

// Builds the command palette's grouped, filtered command list. Pure so the
// filtering behaviour is testable without rendering the palette.
//
// Each item: { id, label, meta, current, kind, payload }
//   kind "navigate" → payload merged into URL state
//   kind "copy-link" / "admin" → handled by the palette
export function buildCommands(query, { agency, quarter, view }) {
  const q = query.trim().toLowerCase();
  const matches = (...hay) => !q || hay.join(" ").toLowerCase().includes(q);

  const views = Object.entries(VIEW_LABELS)
    .filter(([id, label]) => matches(label, "view report", id))
    .map(([id, label]) => ({
      id: `view-${id}`,
      label,
      meta: "View",
      current: view === id,
      kind: "navigate",
      payload: { view: id },
    }));

  const agencies = Object.entries(AGENCIES)
    .filter(([key, cfg]) => matches(cfg.name, cfg.label, "agency", key))
    .map(([key, cfg]) => ({
      id: `agency-${key}`,
      label: cfg.name,
      meta: "Agency",
      badge: key,
      badgeLabel: cfg.label,
      current: agency === key,
      kind: "navigate",
      payload: { agency: key },
    }));

  const quarters = QUARTERS.filter(item =>
    matches(item.label, String(item.year), item.rangeLabel, "quarter")
  ).map(item => ({
    id: `quarter-${item.suffix}`,
    label: `${item.label} ${item.year}`,
    meta: item.rangeLabel,
    current: quarter === item.suffix,
    kind: "navigate",
    payload: { quarter: item.suffix },
  }));

  const actions = [
    matches("copy link share url", "copy") && {
      id: "copy-link",
      label: "Copy link to this view",
      meta: "Action",
      kind: "copy-link",
    },
    matches("open admin edit sign in", "admin") && {
      id: "open-admin",
      label: "Open admin",
      meta: "Action",
      kind: "admin",
    },
  ].filter(Boolean);

  return [
    { label: "Views", items: views },
    { label: "Agencies", items: agencies },
    { label: "Quarters", items: quarters },
    { label: "Actions", items: actions },
  ].filter(group => group.items.length > 0);
}
