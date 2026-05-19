"use client";

import { VBT } from "@/lib/audit/brand";

/**
 * Minimalist SVG icon set for the recommendations slide. Each icon is built
 * inline so it can pick up the brand palette without requiring any external
 * asset. Designed to read clearly at ~32px in a card header.
 */

const COMMON_PROPS = {
  width: 28,
  height: 28,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: VBT.terracotta600,
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function RecoIcon({ name, size = 28 }: { name: string; size?: number }) {
  const props = { ...COMMON_PROPS, width: size, height: size };
  switch (name) {
    case "robots_sitemap":
      // map + pin
      return (
        <svg {...props}>
          <path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z" />
          <path d="M9 3v15M15 6v15" />
          <circle cx="6" cy="11" r="1.2" />
        </svg>
      );
    case "depth":
      // tree / hierarchy
      return (
        <svg {...props}>
          <rect x="9" y="3" width="6" height="4" rx="1" />
          <rect x="3" y="14" width="6" height="4" rx="1" />
          <rect x="9" y="14" width="6" height="4" rx="1" />
          <rect x="15" y="14" width="6" height="4" rx="1" />
          <path d="M12 7v3M6 14v-1h12v1M12 10v3" />
        </svg>
      );
    case "http_codes":
      // server stack
      return (
        <svg {...props}>
          <rect x="3" y="4" width="18" height="6" rx="1.5" />
          <rect x="3" y="14" width="18" height="6" rx="1.5" />
          <circle cx="7" cy="7" r="0.8" fill={VBT.terracotta600} />
          <circle cx="7" cy="17" r="0.8" fill={VBT.terracotta600} />
          <path d="M11 7h7M11 17h7" />
        </svg>
      );
    case "hreflang":
      // globe with flag
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18" />
        </svg>
      );
    case "canonical":
      // chain link
      return (
        <svg {...props}>
          <path d="M10 13a4 4 0 005.66 0l3-3a4 4 0 00-5.66-5.66L11 7" />
          <path d="M14 11a4 4 0 00-5.66 0l-3 3a4 4 0 005.66 5.66L13 17" />
        </svg>
      );
    case "llms_txt":
      // sparkle / AI
      return (
        <svg {...props}>
          <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6z" />
          <path d="M18 16l.8 2.2L21 19l-2.2.8L18 22l-.8-2.2L15 19l2.2-.8z" />
        </svg>
      );
    case "response_time":
      // speedometer
      return (
        <svg {...props}>
          <path d="M3 14a9 9 0 0118 0" />
          <path d="M12 14l5-5" />
          <circle cx="12" cy="14" r="1.3" fill={VBT.terracotta600} />
        </svg>
      );
    case "html_weight":
      // document / archive
      return (
        <svg {...props}>
          <path d="M6 3h9l5 5v12a1 1 0 01-1 1H6a1 1 0 01-1-1V4a1 1 0 011-1z" />
          <path d="M15 3v5h5M9 13h6M9 16h6M9 19h4" />
        </svg>
      );
    case "titles_meta":
      // tag
      return (
        <svg {...props}>
          <path d="M3 12V5a2 2 0 012-2h7l9 9-9 9z" />
          <circle cx="8" cy="8" r="1.4" />
        </svg>
      );
    case "titles_duplicate":
    case "meta_duplicate":
    case "h1_duplicate":
      // two stacked rectangles
      return (
        <svg {...props}>
          <rect x="3" y="3" width="13" height="13" rx="1.5" />
          <rect x="8" y="8" width="13" height="13" rx="1.5" />
        </svg>
      );
    case "hn_structure":
      // outline / list
      return (
        <svg {...props}>
          <path d="M3 5h18M6 10h15M6 15h15M9 20h12" />
          <circle cx="4" cy="10" r="0.8" fill={VBT.terracotta600} />
          <circle cx="4" cy="15" r="0.8" fill={VBT.terracotta600} />
          <circle cx="7" cy="20" r="0.8" fill={VBT.terracotta600} />
        </svg>
      );
    case "hn_hierarchy":
      // stairs going down
      return (
        <svg {...props}>
          <path d="M3 21h4v-4h4v-4h4V9h4V5h4" />
        </svg>
      );
    case "linking_global":
      // network / graph
      return (
        <svg {...props}>
          <circle cx="12" cy="6" r="2" />
          <circle cx="5" cy="18" r="2" />
          <circle cx="19" cy="18" r="2" />
          <path d="M12 8l-6 8M12 8l6 8M7 18h10" />
        </svg>
      );
    case "broken_links":
      // broken chain
      return (
        <svg {...props}>
          <path d="M7 7L4 10M17 17l3-3" />
          <path d="M10 14l4-4" />
          <path d="M14 7l3-3a4 4 0 015.66 5.66l-2 2" />
          <path d="M10 17l-3 3a4 4 0 01-5.66-5.66l2-2" />
        </svg>
      );
    case "orphans":
      // isolated node
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="3" />
          <path d="M4 4l4 4M20 4l-4 4M4 20l4-4M20 20l-4-4" strokeDasharray="2 2" />
        </svg>
      );
    case "anchors":
      // quote / anchor text
      return (
        <svg {...props}>
          <path d="M3 7h6M3 12h12M3 17h8" />
          <path d="M14 6l4 4-4 4" />
        </svg>
      );
    case "image_alt":
      // image with frame
      return (
        <svg {...props}>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <circle cx="9" cy="10" r="1.5" />
          <path d="M21 16l-5-5-9 9" />
        </svg>
      );
    case "image_size_attr":
      // ruler / dimensions
      return (
        <svg {...props}>
          <rect x="3" y="3" width="18" height="18" rx="1.5" />
          <path d="M3 8h2M3 12h2M3 16h2M8 21v-2M12 21v-2M16 21v-2" />
        </svg>
      );
    case "image_weight":
      // weight / dumbbell
      return (
        <svg {...props}>
          <rect x="3" y="9" width="2.5" height="6" rx="0.5" fill={VBT.terracotta600} />
          <rect x="18.5" y="9" width="2.5" height="6" rx="0.5" fill={VBT.terracotta600} />
          <rect x="6" y="11" width="12" height="2" />
        </svg>
      );
    // Section cover icons (used on section-cover slides)
    case "compass":
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="9" />
          <path d="M16 8l-3 5-5 3 3-5z" fill={VBT.terracotta600} stroke="none" />
        </svg>
      );
    case "speed":
      return (
        <svg {...props}>
          <path d="M3 14a9 9 0 0118 0" />
          <path d="M12 14l5-5" />
          <circle cx="12" cy="14" r="1.3" fill={VBT.terracotta600} />
        </svg>
      );
    case "tag":
      return (
        <svg {...props}>
          <path d="M3 12V5a2 2 0 012-2h7l9 9-9 9z" />
          <circle cx="8" cy="8" r="1.4" />
        </svg>
      );
    case "outline":
      return (
        <svg {...props}>
          <path d="M3 5h18M6 10h15M6 15h15M9 20h12" />
        </svg>
      );
    case "graph":
      return (
        <svg {...props}>
          <circle cx="12" cy="6" r="2" />
          <circle cx="5" cy="18" r="2" />
          <circle cx="19" cy="18" r="2" />
          <path d="M12 8l-6 8M12 8l6 8M7 18h10" />
        </svg>
      );
    case "image":
      return (
        <svg {...props}>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <circle cx="9" cy="10" r="1.5" />
          <path d="M21 16l-5-5-9 9" />
        </svg>
      );
    default:
      // generic checkmark-in-circle
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="9" />
          <path d="M8 12l3 3 5-6" />
        </svg>
      );
  }
}

// Map subcategory label to the right icon. Best-effort fuzzy match; falls back
// to a generic icon for anything we haven't classified yet.
export function iconForReco(subLabel: string): string {
  const s = subLabel.toLowerCase();
  if (s.includes("robots")) return "robots_sitemap";
  if (s.includes("profondeur")) return "depth";
  if (s.includes("codes http")) return "http_codes";
  if (s.includes("hreflang")) return "hreflang";
  if (s.includes("canonical")) return "canonical";
  if (s.includes("llms")) return "llms_txt";
  if (s.includes("temps") || s.includes("chargement")) return "response_time";
  if (s.includes("poids") && s.includes("page")) return "html_weight";
  if (s.includes("poids") && s.includes("image")) return "image_weight";
  if (s.includes("title") && s.includes("double")) return "titles_duplicate";
  if (s.includes("meta") && s.includes("double")) return "meta_duplicate";
  if (s.includes("h1") && s.includes("double")) return "h1_duplicate";
  if (s.includes("title") || s.includes("meta description") || s.includes("balises")) return "titles_meta";
  if (s.includes("structures") && s.includes("hn")) return "hn_structure";
  if (s.includes("saut") || s.includes("hiérarchie")) return "hn_hierarchy";
  if (s.includes("maillage")) return "linking_global";
  if (s.includes("rompu")) return "broken_links";
  if (s.includes("orphelin") || s.includes("peu de lien")) return "orphans";
  if (s.includes("ancre")) return "anchors";
  if (s.includes("alt")) return "image_alt";
  if (s.includes("width") || s.includes("height") || s.includes("dimensions") || s.includes("largeur")) return "image_size_attr";
  return "default";
}
