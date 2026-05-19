// Parse Screaming Frog FR "Exporter en bloc > Liens > Liens entrants Tous"
// (liens_entrants_tous.csv).
//
// COLUMN VALUES OBSERVED IN REAL FR EXPORTS (don't trust the user-facing
// spec : the values are localised):
//
//   • Type             "Hyperlien" (FR) / "Hyperlink" (EN) / "Lien hypertexte"
//                      Also: "CSS", "Canonique HTML", "Hreflang HTML",
//                      "Hreflang HTTP", "Iframe", "Image", "JavaScript",
//                      "Redirection HTTP" : all to be excluded.
//   • Position du lien (←dedicated column, not "Chemin du lien")
//                      "Contenu" (the only one we keep),
//                      "Navigation", "En-tête", "Tête", "Pied de page".
//   • Code de statut   the HTTP status of the *destination* of the link.
//                      We use this to surface broken links straight out
//                      of this file : Screaming Frog's Bulk Issues export
//                      doesn't always carry "broken internal links" as a
//                      named file, but every <a href> with a non-2xx
//                      destination shows up here.
//   • Origine du lien  "HTML" / "HTTP" : this is the link delivery
//                      format, NOT internal/external. To tell internal
//                      apart from external, compare hostnames between
//                      Source and Destination.
//
// The file can easily reach 80+ MB (this user shipped 27 MB / 89 k rows
// at 1 000 pages crawled), so we stream with Papaparse `step`.

import Papa from "papaparse";
import type { AnchorDestinationSummary, AnchorRow } from "./types";

const SOURCE_KEYS = ["source", "url source", "page source", "from"];
const DESTINATION_KEYS = ["destination", "url de destination", "to"];
const ANCHOR_KEYS = ["ancrage", "anchor", "anchor text", "texte d'ancre", "texte de l'ancre", "texte de l ancre"];
// Fallback: when Ancrage is empty (typical case of <a><img></a>), use the
// image alt as the link's accessible name : Google and the LLMs treat the
// alt as the effective anchor text in that case.
const ALT_KEYS = ["texte alt", "alt", "alt text", "image alt"];
const TYPE_KEYS = ["type", "type de lien", "link type"];
const POSITION_KEYS = ["position du lien", "link position", "emplacement du lien", "position"];
const PATH_KEYS = ["chemin du lien", "link path", "type de chemin"];
const STATUS_KEYS = ["code de statut", "status code", "code http", "code de statut http"];
const STATUS_TEXT_KEYS = ["statut", "status"];

// FR + EN values for "this row is an <a href>" Type column.
const HYPERLINK_TYPES = ["hyperlien", "hyperlink", "lien hypertexte", "ahref"];
// FR + EN values that count as "body content" Position (everything else ,
// Navigation, En-tête, Tête, Pied de page, Sidebar, Aside : is dropped).
const BODY_POSITIONS = [
  "contenu", "content",
  "body", "main", "article", "section",
  "corps", "principal",
];
// Generic anchors that signal a low-quality link no matter the rest.
// Used to flag low-quality contextual anchors AND to filter them out of
// the over-optimisation ranking (templated CTAs would otherwise show up
// as fake over-optimisation patterns on every site).
const GENERIC_ANCHORS = new Set([
  // 'In place of an anchor' generics
  "ici", "cliquez", "cliquez ici", "cliquer ici",
  "here", "click", "click here", "this", "this link", "link", "lien", "site",
  // Read-more variants
  "en savoir plus", "lire la suite", "voir plus", "plus", "lire",
  "decouvrir", "decouvrir plus", "voir",
  "plus d informations", "plus d'informations",
  "read more", "learn more", "more", "see more",
  // Returning / back
  "retour", "revenir sur la page d accueil", "revenir sur la page d'accueil",
  "retour a l accueil", "retour a l'accueil",
]);

// Templated CTA labels — these repeat across the site as part of layout
// templates (footer CTAs, blog/article boxes, lead magnets). They're
// emitted as a true <a> hyperlink in body content but they're NOT
// editorial anchors. We exclude them from the diversity score so a
// /contact/ page with 200 'Nous contacter' CTAs doesn't get flagged as
// over-optimised when it's actually just the template behaving normally.
const TEMPLATE_CTA_ANCHORS = new Set([
  // Contact CTAs
  "nous contacter", "contactez-nous", "contactez nous", "contact", "prendre contact",
  "contacter un expert", "contacter notre equipe", "demande de contact",
  // Demo / sales CTAs
  "demander une demo", "obtenir une demo", "reserver une demo", "demande de demo",
  "demander un devis", "obtenir un devis", "demande de devis",
  "demander une demonstration", "reserver une demonstration",
  "request a demo", "book a demo",
  // Resource downloads
  "recevoir la plaquette", "telecharger la plaquette", "telecharger le pdf",
  "recevoir le livre blanc", "telecharger le livre blanc",
  "recevoir le guide", "telecharger le guide",
  "recevoir le modele", "telecharger le modele", "telecharger le template",
  "telecharger l etude de cas", "telecharger l'etude de cas",
  "recevoir l etude de cas", "recevoir l'etude de cas",
  // Newsletter
  "s abonner a la newsletter", "s'abonner a la newsletter",
  "s inscrire a la newsletter", "s'inscrire a la newsletter",
  "s abonner", "s'abonner", "s inscrire", "s'inscrire",
  "abonnez-vous", "inscription",
  // Video / media
  "visionner la video", "voir la video", "regarder la video", "lancer la video",
  // Generic CTAs that templates use
  "decouvrir l offre", "decouvrir l'offre", "decouvrir nos solutions",
  "essayer gratuitement", "commencer", "commencer maintenant", "demarrer",
  "see all", "voir tout", "voir tous", "tout voir",
]);

// CSS-path / link-path fragments that indicate the link is part of a
// listing card (article preview, blog card, product card…) rather than
// a real anchor in body text. We exclude these from the contextual
// anchor analysis because they wrap a whole card visually.
const CARD_PATH_FRAGMENTS = [
  "article", "card", "post", "blog-item", "blog__item", "blog_card",
  "post-card", "post__card", "product-card", "product__card",
  "tile", "thumbnail", "preview", "listing", "list__item",
];

// CSS-path / link-path fragments that indicate the link is styled as a
// button (templated CTA) rather than a contextual anchor.
const BUTTON_PATH_FRAGMENTS = [
  "button", "btn", "cta", "call-to-action", "calltoaction",
];

// Local copy of parse-internal.ts's isPaginationUrl to avoid a circular
// dependency between the two parsers.
function isPaginationUrlInline(url: string): boolean {
  try {
    const u = new URL(url);
    const params = u.searchParams;
    for (const key of ["pagination", "page", "paged", "p", "start", "offset"]) {
      const v = params.get(key);
      if (v && /^\d+$/.test(v)) return true;
    }
    if (/\/(page|p)\/\d+\/?$/i.test(u.pathname)) return true;
    return false;
  } catch {
    return false;
  }
}

function normalizeKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/^﻿/, "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[‘’‚‛ʼ]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function pick(rec: Record<string, string>, aliases: string[]): string | null {
  for (const a of aliases) {
    const v = rec[normalizeKey(a)];
    if (v !== undefined && v !== "") return v;
  }
  return null;
}

function isGeneric(anchor: string): boolean {
  const norm = normalizeKey(anchor || "");
  if (!norm) return false;
  return GENERIC_ANCHORS.has(norm);
}

function isTemplateCta(anchor: string): boolean {
  const norm = normalizeKey(anchor || "");
  if (!norm) return false;
  return TEMPLATE_CTA_ANCHORS.has(norm);
}

// True when the link wraps an image and has no own text content.
// Detected via Texte Alt being present while Ancrage is empty — that's
// how SF FR represents <a><img alt="…"></a>. Such links are NOT
// editorial anchors so we exclude them from the diversity calc and from
// the 'empty anchors are bad' signal.
function isImageWrappingLink(rawAnchor: string, altText: string): boolean {
  return !rawAnchor.trim() && !!altText.trim();
}

// True when the Chemin du lien (XPath selector) points to a templated
// card / button — listing tiles, CTA buttons, etc. — rather than to a
// genuine in-body anchor. We use this to keep only editorial links in
// the diversity ranking.
function isCardLikePath(path: string): boolean {
  if (!path) return false;
  const norm = path.toLowerCase();
  return CARD_PATH_FRAGMENTS.some((f) => norm.includes(f));
}

function isButtonLikePath(path: string): boolean {
  if (!path) return false;
  const norm = path.toLowerCase();
  return BUTTON_PATH_FRAGMENTS.some((f) => norm.includes(f));
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

function isSameDomain(source: string, destination: string): boolean {
  const a = hostname(source);
  const b = hostname(destination);
  if (!a || !b) return false;
  return a === b;
}

// A broken or redirected link discovered in the same stream that powers
// the anchor analysis. We surface these so the "Liens rompus" and
// "Liens 301 internes" slides work even when the Issues ZIP is missing the
// codes_de_reponse_* files.
export type BrokenLink = {
  source: string;
  destination: string;
  anchor: string;
  status: number;
  origin: "internal" | "external";
};

// An internal redirect we want to surface: page A has an <a href> to
// page B which returns 3xx. The fix is to update A's link to point
// straight at the redirect target.
export type RedirectedLink = {
  source: string;
  destination: string;
  anchor: string;
  status: number; // 301 / 302 / 307 / 308
};

// An internal link still emitted in HTTP (mixed content risk on an
// HTTPS site).
export type HttpLink = {
  source: string;
  destination: string;
  anchor: string;
};

export type AnchorsParseResult = {
  rows: AnchorRow[];
  by_destination: Map<string, AnchorDestinationSummary>;
  // Diagnostics: raw lines vs. rows that passed every filter.
  total_links_raw: number;
  total_links_filtered: number;     // every Position=Contenu HTML hyperlink
  total_editorial_links: number;    // editorial subset (excl. CTAs / cards / buttons / image links)
  empty_editorial_anchors: number;  // editorial links with neither Ancrage nor Texte Alt
  // Per-rejection counters so the import UI can explain WHY rows were
  // dropped. Helps catch future SF locale / format drift early.
  filtered_breakdown: {
    not_hyperlink: number;
    not_body_position: number;
    no_destination: number;
    non_200: number;
    external: number;
    // New : detailed contextual-anchor filtering buckets
    template_cta: number;        // CTA wording from the templated list
    image_wrapping: number;      // <a><img alt="…"></a>
    card_path: number;           // /article/, /post-card/, …
    button_path: number;         // /button/, /btn-/, /cta/, …
    pagination_dest: number;     // destination is a /page/N URL
  };
  broken_links: BrokenLink[];
  redirected_links: RedirectedLink[];
  http_links: HttpLink[];
  filename: string | null;
};

const MAX_FILTERED_ROWS = 50_000;
const MAX_BROKEN_LINKS = 5_000;
const MAX_REDIRECT_LINKS = 5_000;
const MAX_HTTP_LINKS = 2_000;

type Accumulator = {
  count: number;
  anchors: Map<string, number>;
};

function streamAndFilter(
  text: string,
  onAnchorRow: (row: AnchorRow) => void,
  onBrokenLink: (link: BrokenLink) => void,
  onRedirect: (link: RedirectedLink) => void,
  onHttpLink: (link: HttpLink) => void,
  setStats: (stats: AnchorsParseResult["filtered_breakdown"] & { raw: number; filtered: number }) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let raw = 0;
    let filtered = 0;
    let broken = 0;
    let redirected = 0;
    let httpLinks = 0;
    const breakdown = {
      not_hyperlink: 0,
      not_body_position: 0,
      no_destination: 0,
      non_200: 0,
      external: 0,
      template_cta: 0,
      image_wrapping: 0,
      card_path: 0,
      button_path: 0,
      pagination_dest: 0,
    };
    let aborted = false;
    Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: "greedy",
      delimitersToGuess: [",", ";", "\t", "|"],
      transformHeader: normalizeKey,
      transform: (v) => (typeof v === "string" ? v.trim() : v),
      step: ({ data }: { data: Record<string, string> }, parser) => {
        raw++;
        const type = normalizeKey(pick(data, TYPE_KEYS) || "");
        // Skip non-hyperlink rows (CSS, JS, Image, Iframe, Redirection HTTP,
        // Hreflang HTML, Canonique HTML…). When the Type column is missing,
        // we don't filter : better to keep too much than drop everything.
        if (type && !HYPERLINK_TYPES.some((t) => type === t || type.includes(t))) {
          breakdown.not_hyperlink++;
          return;
        }
        const dest = pick(data, DESTINATION_KEYS);
        if (!dest || !/^https?:\/\//i.test(dest)) {
          breakdown.no_destination++;
          return;
        }
        // Skip pagination destinations (?pagination=2, /page/3/...) : they
        // pollute the diversity ranking with article/?pagination=2 etc.
        if (isPaginationUrlInline(dest)) {
          breakdown.no_destination++;
          return;
        }
        const src = pick(data, SOURCE_KEYS) || "";
        // We keep the raw Ancrage and the Texte Alt separately so we can
        // distinguish three cases on the destination-anchor slide :
        //   • rawAnchor present : real editorial anchor
        //   • rawAnchor empty AND altText present : image-wrapping link
        //     (NOT counted as 'empty contextual anchor')
        //   • rawAnchor empty AND altText empty : truly empty link — a
        //     genuine accessibility/SEO problem
        const rawAnchor = pick(data, ANCHOR_KEYS) || "";
        const altText = pick(data, ALT_KEYS) || "";
        const anchor = rawAnchor || altText;
        const pathStr = pick(data, PATH_KEYS) || "";
        const statusStr = pick(data, STATUS_KEYS);
        const statusCode = statusStr ? parseInt(statusStr, 10) : 200;
        const internal = src ? isSameDomain(src, dest) : true;

        // Broken-link harvest (4xx / 5xx). Fires for both internal and
        // external destinations and is independent of the body-position
        // filter : a broken nav link is still a broken link.
        if (statusCode >= 400 && broken < MAX_BROKEN_LINKS) {
          broken++;
          onBrokenLink({
            source: src,
            destination: dest,
            anchor,
            status: statusCode,
            origin: internal ? "internal" : "external",
          });
        }

        // Redirect-link harvest (3xx). Internal only : these are the
        // links you want to update to skip the redirect chain.
        if (statusCode >= 300 && statusCode < 400 && internal && redirected < MAX_REDIRECT_LINKS) {
          redirected++;
          onRedirect({
            source: src,
            destination: dest,
            anchor,
            status: statusCode,
          });
        }

        // Mixed-content harvest: internal links still emitted as http://
        // even though the site is served over https://. Both source and
        // destination must be internal for this to be actionable.
        if (
          internal &&
          dest.startsWith("http://") &&
          (!src || src.startsWith("https://")) &&
          httpLinks < MAX_HTTP_LINKS
        ) {
          httpLinks++;
          onHttpLink({ source: src, destination: dest, anchor });
        }

        // Anchor analysis : only contextual, internal, 200-OK links count.
        const position = normalizeKey(pick(data, POSITION_KEYS) || "");
        if (position && !BODY_POSITIONS.some((p) => position === p || position.includes(p))) {
          breakdown.not_body_position++;
          return;
        }
        if (!internal) {
          breakdown.external++;
          return;
        }
        if (statusCode >= 300) {
          breakdown.non_200++;
          return;
        }
        // Templated CTA labels — keep them in the parser output but flag
        // them so the diversity calc can exclude them. We don't drop the
        // row outright because the empty-anchor signal in the rest of
        // the analyzer still needs visibility into them.
        const isCta = isTemplateCta(anchor);
        if (isCta) breakdown.template_cta++;
        // Image-wrapping link (a wrapping img with alt). Not an editorial
        // anchor.
        const isImageLink = isImageWrappingLink(rawAnchor, altText);
        if (isImageLink) breakdown.image_wrapping++;
        // Card / button paths (Chemin du lien contains article|card|button|btn|cta…)
        const cardLike = isCardLikePath(pathStr);
        const buttonLike = isButtonLikePath(pathStr);
        if (cardLike) breakdown.card_path++;
        if (buttonLike) breakdown.button_path++;

        filtered++;
        onAnchorRow({
          source: src,
          destination: dest,
          anchor,
          position: position || "",
          // Now richer flags so the analyzer can decide what to keep in
          // the diversity calc.
          is_generic: isGeneric(anchor),
          is_empty: !rawAnchor.trim() && !altText.trim(),
          is_template_cta: isCta,
          is_image_link: isImageLink,
          is_card_like: cardLike,
          is_button_like: buttonLike,
          link_path: pathStr,
        });

        if (filtered >= MAX_FILTERED_ROWS && !aborted) {
          aborted = true;
          parser.abort();
        }
      },
      complete: () => {
        setStats({ raw, filtered, ...breakdown });
        resolve();
      },
      error: (err: Error) => reject(err),
    });
  });
}

export async function parseAnchorsCsv(file: File): Promise<AnchorsParseResult> {
  const text = await file.text();
  return parseAnchorsCsvText(text, file.name);
}

export async function parseAnchorsCsvText(textRaw: string, filename: string | null): Promise<AnchorsParseResult> {
  const text = textRaw.replace(/^﻿/, "");

  const keptRows: AnchorRow[] = [];
  const brokenLinks: BrokenLink[] = [];
  const redirectedLinks: RedirectedLink[] = [];
  const httpLinks: HttpLink[] = [];
  const aggregator = new Map<string, Accumulator>();
  let stats: AnchorsParseResult["filtered_breakdown"] & { raw: number; filtered: number } = {
    raw: 0, filtered: 0,
    not_hyperlink: 0, not_body_position: 0, no_destination: 0, non_200: 0, external: 0,
    template_cta: 0, image_wrapping: 0, card_path: 0, button_path: 0, pagination_dest: 0,
  };

  await streamAndFilter(
    text,
    (row) => {
      keptRows.push(row);
      // Aggregate by destination, but ONLY for rows that count as
      // editorial anchors. Templated CTAs, image-wrapping links, card
      // wrappers and button-styled links all skew the diversity score
      // without representing genuine editorial decisions.
      const isEditorial = !row.is_template_cta && !row.is_image_link
        && !row.is_card_like && !row.is_button_like;
      if (!isEditorial) return;
      let entry = aggregator.get(row.destination);
      if (!entry) {
        entry = { count: 0, anchors: new Map() };
        aggregator.set(row.destination, entry);
      }
      entry.count++;
      const key = (row.anchor || "(vide)").trim();
      entry.anchors.set(key, (entry.anchors.get(key) || 0) + 1);
    },
    (link) => { brokenLinks.push(link); },
    (link) => { redirectedLinks.push(link); },
    (link) => { httpLinks.push(link); },
    (s) => { stats = s; },
  );

  const summary: Map<string, AnchorDestinationSummary> = new Map();
  for (const [dest, e] of aggregator.entries()) {
    const unique = e.anchors.size;
    const diversity = e.count > 0 ? unique / e.count : 0;
    let dominant = "";
    let dominantCount = 0;
    for (const [a, c] of e.anchors.entries()) {
      if (c > dominantCount) { dominant = a; dominantCount = c; }
    }
    summary.set(dest, {
      destination: dest,
      inlinks_count: e.count,
      unique_anchors: unique,
      diversity_ratio: Math.round(diversity * 1000) / 1000,
      dominant_anchor: dominant,
      dominant_anchor_count: dominantCount,
      dominant_anchor_pct: e.count > 0 ? Math.round((dominantCount / e.count) * 1000) / 10 : 0,
    });
  }

  // True editorial links count = sum of inlinks across aggregator entries
  // (those that passed the editorial filter inside the streaming step).
  const totalEditorialLinks = [...aggregator.values()].reduce(
    (s, e) => s + e.count, 0,
  );
  // Empty editorial anchors = links with no Ancrage AND no Texte Alt,
  // not in a card/button context, not a template CTA. Surfaced as a
  // dedicated metric for the synthesis ("X% of editorial anchors are
  // empty").
  const emptyEditorialAnchors = keptRows.filter((r) =>
    r.is_empty && !r.is_template_cta && !r.is_image_link && !r.is_card_like && !r.is_button_like,
  ).length;

  return {
    rows: keptRows,
    by_destination: summary,
    total_links_raw: stats.raw,
    total_links_filtered: stats.filtered,
    total_editorial_links: totalEditorialLinks,
    empty_editorial_anchors: emptyEditorialAnchors,
    filtered_breakdown: {
      not_hyperlink: stats.not_hyperlink,
      not_body_position: stats.not_body_position,
      no_destination: stats.no_destination,
      non_200: stats.non_200,
      external: stats.external,
      template_cta: stats.template_cta,
      image_wrapping: stats.image_wrapping,
      card_path: stats.card_path,
      button_path: stats.button_path,
      pagination_dest: stats.pagination_dest,
    },
    broken_links: brokenLinks,
    redirected_links: redirectedLinks,
    http_links: httpLinks,
    filename,
  };
}

export function pickWorstDestinations(
  summary: Map<string, AnchorDestinationSummary>,
  minInlinks = 10,
  limit = 15,
): AnchorDestinationSummary[] {
  const out = [...summary.values()].filter((s) => s.inlinks_count >= minInlinks);
  out.sort((a, b) => {
    const dDiv = a.diversity_ratio - b.diversity_ratio;
    if (dDiv !== 0) return dDiv;
    return b.inlinks_count - a.inlinks_count;
  });
  return out.slice(0, limit);
}

export function pickTopConcentratedDestinations(
  summary: Map<string, AnchorDestinationSummary>,
  minInlinks = 5,
  limit = 6,
): AnchorDestinationSummary[] {
  const out = [...summary.values()].filter((s) => s.inlinks_count >= minInlinks);
  out.sort((a, b) => b.dominant_anchor_pct - a.dominant_anchor_pct);
  return out.slice(0, limit);
}
