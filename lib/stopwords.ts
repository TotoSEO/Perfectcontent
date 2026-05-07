// Mirror of backend/app/services/term_freq.py — keep in sync.

export const STOPWORDS_FR = new Set<string>([
  "a", "à", "ai", "ait", "as", "au", "aux", "avec", "avoir", "ce", "ces",
  "cet", "cette", "ceux", "ci", "comme", "d", "dans", "de", "des", "donc",
  "du", "elle", "elles", "en", "entre", "es", "est", "et", "été", "être",
  "eu", "il", "ils", "j", "je", "l", "la", "le", "les", "leur", "leurs",
  "lui", "m", "ma", "mais", "me", "mes", "mon", "n", "ne", "ni", "nos",
  "notre", "nous", "on", "ont", "ou", "où", "par", "pas", "plus", "pour",
  "près", "puis", "qu", "quand", "que", "quel", "quelle", "quelles", "quels",
  "qui", "quoi", "s", "sa", "sans", "se", "sera", "ses", "si", "soit",
  "son", "sont", "sous", "soyons", "sur", "t", "ta", "te", "tes", "toi",
  "ton", "tous", "tout", "toute", "toutes", "tu", "un", "une", "vos", "votre",
  "vous", "y", "étée", "étées", "étés", "étant", "j'", "n'", "l'",
  "d'", "qu'", "s'", "m'", "t'", "c'", "jusqu",
  "deux", "trois", "quatre", "cinq", "dix",
  "fait", "faire", "fais", "faut", "peut", "peuvent", "peux", "doit", "doivent",
  "veut", "veux", "veulent", "voir", "vu", "voit",
  "très", "bien", "même", "déjà", "alors", "encore", "aussi", "ainsi", "puisque",
  "lorsque", "lorsqu", "tandis", "depuis", "vers", "chez", "selon", "afin",
  "non", "oui",
]);

export const STOPWORDS_EN = new Set<string>([
  "the", "a", "an", "and", "or", "of", "to", "in", "is", "are", "was", "were",
  "be", "been", "being", "by", "for", "with", "as", "it", "this", "that",
  "these", "those", "from", "at", "on", "but", "not", "can", "will", "do",
  "does", "did", "have", "has", "had", "you", "your", "we", "our", "they",
  "their", "i", "my", "me", "if", "than", "then", "so", "too", "very",
  "just", "more", "most", "other", "some", "such", "no", "nor", "only",
  "own", "same", "should", "now", "also", "any", "all", "each", "few",
  "into", "out", "up", "down", "off", "over", "under", "again", "further",
  "while", "after", "before", "between", "during", "above", "below",
  "about", "against",
]);

export const STOPWORDS_WEB = new Set<string>([
  "https", "http", "www", "url", "href", "src", "ftp", "mailto",
  "blob", "localhost",
  "com", "fr", "org", "net", "eu", "io", "co", "uk", "de", "es", "it",
  "html", "htm", "css", "json", "xml", "rss", "pdf", "jpg", "jpeg", "png",
  "gif", "svg", "webp", "mp4", "webm", "ico",
  "alt", "img", "div", "span", "head", "body", "meta", "link",
  "lang", "type", "name", "value", "id", "class",
  "content", "markdown", "source", "title", "desc", "description",
  "menu", "nav", "footer", "header", "aside", "main", "section",
  "cookie", "cookies", "newsletter", "copyright", "sitemap",
  "wp", "admin", "login", "logout", "register", "search",
  "page", "pages", "voir", "lire", "cliquer", "cliquez", "ici",
  "blog", "article", "articles", "post", "posts",
  "mso", "fareast", "minor", "latin", "endnoteref",
  "data", "info", "infos",
]);

const ALL_STOPWORDS = new Set<string>([...STOPWORDS_FR, ...STOPWORDS_EN, ...STOPWORDS_WEB]);

const WORD_RE = /[a-zA-ZàâäéèêëïîôöùûüÿñçœÀÂÄÉÈÊËÏÎÔÖÙÛÜŸÑÇŒ][a-zA-ZàâäéèêëïîôöùûüÿñçœÀÂÄÉÈÊËÏÎÔÖÙÛÜŸÑÇŒ\-']*/g;
const MIN_WORD_LEN = 3;

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

export function tokenize(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(WORD_RE)) {
    const w = m[0].toLowerCase().replace(/^['-]+|['-]+$/g, "");
    if (w.length < MIN_WORD_LEN) continue;
    if (ALL_STOPWORDS.has(w)) continue;
    if (ALL_STOPWORDS.has(stripAccents(w))) continue;
    out.push(w);
  }
  return out;
}

export function countTerms(text: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const w of tokenize(text)) {
    counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  return counts;
}

const ESCAPE_RE = /[.*+?^${}()|[\]\\]/g;
function escapeRegex(s: string): string {
  return s.replace(ESCAPE_RE, "\\$&");
}

/**
 * Count whole-word occurrences of any of the given surface forms in a plain
 * text. Used to mirror the BM25 backend targets, which carry a list of
 * surfaces (so "agence", "agences" both count toward the same target).
 *
 * For multi-word surfaces (n-grams), the match is also case-insensitive but
 * with whitespace-tolerant separators so HTML→text quirks don't drop hits.
 */
export function countSurfaces(plainText: string, surfaces: string[]): number {
  if (!surfaces.length || !plainText) return 0;
  const lowered = plainText.toLowerCase();
  let total = 0;
  for (const s of surfaces) {
    const surface = s.toLowerCase().trim();
    if (!surface) continue;
    let pattern: RegExp;
    if (surface.includes(" ")) {
      const tokens = surface.split(/\s+/).map(escapeRegex);
      pattern = new RegExp(`\\b${tokens.join("\\s+")}\\b`, "gu");
    } else {
      pattern = new RegExp(`(?<![\\p{L}-])${escapeRegex(surface)}(?![\\p{L}-])`, "gu");
    }
    const matches = lowered.match(pattern);
    if (matches) total += matches.length;
  }
  return total;
}

export function htmlToPlain(html: string): string {
  if (typeof window === "undefined") return html;
  const doc = new DOMParser().parseFromString(html, "text/html");
  // Remove script/style/code blocks before extraction
  doc.querySelectorAll("script, style, code, pre").forEach((el) => el.remove());
  return doc.body?.textContent || "";
}
