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
