// Visibili'tea brand tokens — synced to the canonical Design System
// (colors_and_type.css). Source : the design ZIP the consultant authored.
// Hex values match 1:1 so the audit deck renders in the brand's exact
// palette and any future tweak in the DS file gets mirrored here.

export const VBT = {
  // Terracotta (primary brand ramp, derived from the logo "V" body).
  terracotta50:  "#fdf3ec",
  terracotta100: "#fae0cd",
  terracotta200: "#f4bf99",
  terracotta300: "#ec9a64",
  terracotta400: "#e07a3e",
  terracotta500: "#d36a2c",   // core brand
  terracotta600: "#b9551f",
  terracotta700: "#92421a",
  terracotta800: "#6b3115",

  // Amber / ochre (secondary, logo highlights + leaves).
  amber50:  "#fcf6e6",
  amber100: "#f7e7b8",
  amber200: "#efd07f",
  amber300: "#e7b94e",
  amber400: "#dba432",   // core amber
  amber500: "#c08820",
  amber600: "#966819",
  amber700: "#6c4a14",

  // Brick (accent, depth, hover for terracotta).
  brick50:  "#fbeeec",
  brick100: "#f3cdc7",
  brick200: "#e29a8d",
  brick300: "#cc6a58",
  brick400: "#b34833",
  brick500: "#993820",   // deep brick
  brick600: "#7a2c19",

  // Cream / paper (slide backgrounds).
  cream50:  "#fdfaf4",
  cream100: "#f9f2e6",
  cream200: "#f1e6d1",

  // Ink / warm-biased neutrals (text, borders, divider lines).
  ink:       "#1a1814",   // ink-800 in the DS, primary text
  inkSoft:   "#2a2722",   // ink-700, slightly softer
  ink2:      "#5f5a4e",   // ink-500, secondary
  ink3:      "#8a8475",   // ink-400, tertiary / captions
  paper:     "#fdfaf4",   // cream-50
  paperEdge: "#e6d4b3",   // cream-300, hairlines
  zinc:      "#8a8475",   // alias for ink-400

  // Status (DS semantic palette). Used in KPI tiles, chart fills, ribbons.
  good:    "#2f7d4f",
  goodBg:  "#e6f3eb",
  warn:    "#c98410",
  warnBg:  "#fcf2dc",
  bad:     "#b3331a",
  badBg:   "#fbe3dd",
  info:    "#2a6f8e",
  infoBg:  "#e1eef5",

  // Semantic urgency aliases used by Kanban lanes / scatter dots / pills.
  // Mapped to the DS semantic palette so everything stays cohesive
  // (no neon red/blue dropped on a warm cream slide).
  sigRed:    "#b3331a",
  sigOrange: "#c98410",
  sigGreen:  "#2f7d4f",
  sigBlue:   "#2a6f8e",
} as const;

// Typography tokens : single source of truth for the slide deck so every
// slide reads from the same hierarchy. Numbers are in CSS px, authored
// against the 1600×900 slide canvas. Mirrors the DS modular scale (~1.2/1.25).
export const VBT_TYPO = {
  heroNumber:  72,  // cover score, sparse hero KPIs
  pageTitle:   38,  // h2 in slide header (DS --fs-3xl)
  subhead:     24,  // section eyebrows, large takeaways (DS --fs-xl)
  body:        16,  // primary text content (DS --fs-base)
  bodySm:      14,  // table / dense (DS --fs-sm)
  caption:     12,  // labels / footnotes (DS --fs-xs)
  micro:       11,  // ALL CAPS labels / metadata
} as const;

export const VBT_SPACING = {
  slidePadX: 80,
  slidePadXTight: 56,
  slidePadY: 48,
} as const;

export const VBT_NAME = "Visibili'tea";

// ---------------------------------------------------------------------------
// Design-system "look" helpers — the distinctive Visibili'tea signature:
// thick ink borders + HARD offset shadows (no blur) + pills + sticker badges
// + organic blob icons. Lifted straight from the DS preview components
// (cards.html / buttons.html / badges-tags.html).
// ---------------------------------------------------------------------------

const INK = "#1a1814";

// Hard, blur-less offset shadow in the brand ink (the core DS signature).
export function hardShadow(n: number, color: string = INK): string {
  return `${n}px ${n}px 0 ${color}`;
}

// Card : surface + thin ink border + hard shadow + generous radius.
export const VBT_CARD = {
  border: `1.5px solid ${INK}`,
  borderRadius: 18,
  boxShadow: hardShadow(5),
} as const;

// Smaller card / tile (KPI, kanban card…).
export const VBT_CARD_SM = {
  border: `1.5px solid ${INK}`,
  borderRadius: 14,
  boxShadow: hardShadow(3),
} as const;

// Sticker badge : 2px ink border, pill, small hard shadow.
export const VBT_BADGE = {
  border: `2px solid ${INK}`,
  borderRadius: 999,
  boxShadow: hardShadow(3),
} as const;

// Ribbon : soft tinted pill, no shadow (used for inline labels).
export const VBT_RIBBON = {
  borderRadius: 999,
} as const;

// Organic "blob" radius for icon containers (rotate them a few degrees).
export const VBT_BLOB_RADIUS = "18px 22px 16px 24px / 22px 16px 24px 18px";

// Font-family stacks. The DS pins everything on Montserrat + Poppins
// (titles + body). No Calistoga, no JetBrains Mono : the mono stack
// uses the OS system mono.
export const VBT_FONT = {
  // Display moments (cover hero, big KPI figures) : Montserrat 800 with
  // very tight tracking, the same recipe the DS uses for .vt-h1.
  display: "var(--font-vbt-title), 'Montserrat', system-ui, -apple-system, 'Segoe UI', sans-serif",
  // Titles / structural type : Montserrat 600-800.
  title:   "var(--font-vbt-title), 'Montserrat', system-ui, -apple-system, 'Segoe UI', sans-serif",
  // Body copy : Poppins 400-500.
  body:    "var(--font-vbt-body), 'Poppins', system-ui, -apple-system, 'Segoe UI', sans-serif",
  // Mono : system stack only.
  mono:    "ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
} as const;

// Severity → palette (background, foreground, ARGB strings for ExcelJS).
// Synced to the DS semantic palette so the XLSX matches the slide rendering.
export const SEVERITY = {
  critical: { bg: "#fbe3dd", fg: "#7a2c19", argbBg: "FFFBE3DD", argbFg: "FF7A2C19" },
  high:     { bg: "#fcecdd", fg: "#92421a", argbBg: "FFFCECDD", argbFg: "FF92421A" },
  medium:   { bg: "#fcf2dc", fg: "#6c4a14", argbBg: "FFFCF2DC", argbFg: "FF6C4A14" },
  low:      { bg: "#f4f1e6", fg: "#5f5a4e", argbBg: "FFF4F1E6", argbFg: "FF5F5A4E" },
  info:     { bg: "#e1eef5", fg: "#2a6f8e", argbBg: "FFE1EEF5", argbFg: "FF2A6F8E" },
} as const;
