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

const ALL_STOPWORDS = new Set<string>([...STOPWORDS_FR, ...STOPWORDS_EN]);

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

export function htmlToPlain(html: string): string {
  if (typeof window === "undefined") return html;
  const doc = new DOMParser().parseFromString(html, "text/html");
  // Remove script/style/code blocks before extraction
  doc.querySelectorAll("script, style, code, pre").forEach((el) => el.remove());
  return doc.body?.textContent || "";
}
