// Visibili'tea brand tokens — derived from the logo (terracotta, amber, brick).
// Used by the audit slide viewer + Excel export so the deliverable looks
// native to the consultant's brand.

export const VBT = {
  // Terracotta (primary)
  terracotta50:  "#FAEDE3",
  terracotta100: "#F5D5BA",
  terracotta200: "#EBB78D",
  terracotta300: "#DD9866",
  terracotta400: "#D17E47",
  terracotta500: "#C46B30",
  terracotta600: "#A55720",
  terracotta700: "#7E411A",
  terracotta800: "#5A2D11",

  // Amber (secondary)
  amber50:  "#FBF4DE",
  amber100: "#F2E3B3",
  amber200: "#E5CD83",
  amber300: "#D8B962",
  amber400: "#CCA744",
  amber500: "#A68526",
  amber600: "#7C621A",
  amber700: "#534111",

  // Brick (accent / depth)
  brick50:  "#F8E4E0",
  brick100: "#E5BDB5",
  brick200: "#CD9089",
  brick300: "#B97168",
  brick400: "#A55448",
  brick500: "#85382F",
  brick600: "#642720",

  // Neutrals for printable slides
  ink:     "#241712",
  inkSoft: "#5C4A41",
  paper:   "#FFFCF7",
  paperEdge:"#EFE4D8",
  zinc:    "#9A9189",

  // Status (used in charts + KPI tiles, harmonized to the warm palette)
  good:  "#5C8B4D",   // sage green that fits the warm palette
  warn:  "#D8B962",   // amber 300
  bad:   "#A55448",   // brick 400
  info:  "#C46B30",   // terracotta 500

  // Semantic urgency palette (4.6) : crisp signal colors that read well at
  // a glance in cards / lanes / scatter dots. Used by priority lanes, KPI
  // tone overrides and scatter colorings.
  sigRed:    "#DC2626",
  sigOrange: "#EA580C",
  sigGreen:  "#16A34A",
  sigBlue:   "#2563EB",
} as const;

// Typography tokens (4.1, 4.13) : single source of truth for the deck so
// every slide reads from the same hierarchy. Numbers are in CSS px, all
// authored against the 1600×900 slide canvas.
export const VBT_TYPO = {
  heroNumber:  72,  // cover score, sparse hero KPIs
  pageTitle:   36,  // h2 in slide header
  subhead:     22,  // section eyebrows, large takeaways
  body:        17,  // primary text content
  bodySm:      14,  // table / dense
  caption:     12,  // labels / footnotes
  micro:       10,  // ALL CAPS labels / metadata
} as const;

export const VBT_SPACING = {
  slidePadX: 80,    // 4.14 — horizontal breathing room (cover/section)
  slidePadXTight: 56, // for data slides where we need slightly more space for charts
  slidePadY: 48,    // vertical padding
} as const;

export const VBT_NAME = "Visibili'tea";

// Severity → palette (background, foreground, fill for Excel — argb)
export const SEVERITY = {
  critical: { bg: "#F8E4E0", fg: "#642720", argbBg: "FFF8E4E0", argbFg: "FF642720" },
  high:     { bg: "#FBE9D6", fg: "#7E411A", argbBg: "FFFBE9D6", argbFg: "FF7E411A" },
  medium:   { bg: "#FBF4DE", fg: "#7C621A", argbBg: "FFFBF4DE", argbFg: "FF7C621A" },
  low:      { bg: "#F4F1E6", fg: "#534111", argbBg: "FFF4F1E6", argbFg: "FF534111" },
  info:     { bg: "#F1ECE6", fg: "#5C4A41", argbBg: "FFF1ECE6", argbFg: "FF5C4A41" },
} as const;
