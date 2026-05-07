"""Corpus-level term targets, BM25-Okapi flavour.

Pipeline:
1. Light French stemmer (longest-suffix-first, stem length guard >= 4).
2. Unigrams = stems; bigrams/trigrams = raw lower-cased surface forms.
3. BM25 Okapi (k1=1.5, b=0.75) summed across competitor documents.
4. Business weighting:    bm25_corpus * (0.3 + 0.7 * presence) * heading_boost.
5. Skew / shape filters:  df>=2, presence>=25%, max < 10*avg, vowel ratio,
   length, keyword-variant exclusion.
6. Surface mapping: each unigram target carries the most-frequent original
   surface form for display, plus the full set of surfaces for live counting
   in the editor (regex word-boundary match on the frontend).

The frontend mirrors the surface-form list to count whole-word occurrences
in the user's HTML — see frontend/lib/stopwords.ts.
"""
from __future__ import annotations

import math
import re
import statistics
import unicodedata
from collections import Counter, defaultdict
from dataclasses import dataclass, field

# ---------- Stop word lists (kept verbatim with the TS mirror) ----------

STOPWORDS_FR = {
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
    "vous", "y", "été", "étée", "étées", "étés", "étant", "j'", "n'", "l'",
    "d'", "qu'", "s'", "m'", "t'", "c'", "jusqu",
    "deux", "trois", "quatre", "cinq", "dix",
    "fait", "faire", "fais", "faut", "peut", "peuvent", "peux", "doit", "doivent",
    "veut", "veux", "veulent", "voir", "vu", "voit",
    "très", "bien", "même", "déjà", "alors", "encore", "aussi", "ainsi", "puisque",
    "lorsque", "lorsqu", "tandis", "depuis", "vers", "chez", "selon", "afin",
    "non", "oui",
}
STOPWORDS_EN = {
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
}
STOPWORDS_WEB = {
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
}

ALL_STOPWORDS = STOPWORDS_FR | STOPWORDS_EN | STOPWORDS_WEB

# Words we drop AT THE UNIGRAM LEVEL ONLY. They're useful inside multi-word
# phrases ("comment choisir", "service client", "fiche produit") so we keep
# them as bigram/trigram tokens — but they're noise as standalone targets.
UNIGRAM_DROPLIST = {
    # Interrogatives — always boilerplate as standalone unigrams
    "comment", "pourquoi", "combien", "quand", "que", "quoi",
    "quel", "quelle", "quels", "quelles",
    # E-commerce / blog menu boilerplate
    "client", "clients", "produit", "produits", "service", "services",
    "guide", "guides", "actualité", "actualités",
    "image", "images", "photo", "photos", "video", "videos", "vidéo", "vidéos",
    "histoire", "histoires", "presse", "marque", "marques",
    "livraison", "livraisons", "retour", "retours", "panier", "commande",
    "compte", "abonnement", "abonné", "abonnés",
    # CTA verbs
    "personnaliser", "personnalisez", "personnalisé", "personnalisée",
    "découvrir", "découvrez", "contactez", "abonnez", "inscrivez",
    "rejoignez", "essayez", "testez",
}

WORD_RE = re.compile(
    r"[a-zA-ZàâäéèêëïîôöùûüÿñçœÀÂÄÉÈÊËÏÎÔÖÙÛÜŸÑÇŒ][a-zA-ZàâäéèêëïîôöùûüÿñçœÀÂÄÉÈÊËÏÎÔÖÙÛÜŸÑÇŒ\-']*",
)
MIN_WORD_LEN = 3
MIN_STEM_LEN = 4
VOWELS = set("aeiouyàâäéèêëïîôöùûüÿœ")


# ---------- French light stemmer (longest suffix first) ----------

# Order matters: longest suffix first so we don't accidentally strip "es"
# before "ements". Each step preserves at least MIN_STEM_LEN characters.
SUFFIXES_FR: tuple[str, ...] = (
    "issements", "issement", "issantes", "issants", "issante", "issant",
    "issons", "issaient", "issais", "issait",
    "eraient", "erions", "eriez", "erait", "erons", "erez", "èrent",
    "iraient", "irions", "iriez", "irait", "irons", "irez",
    "isations", "isation",
    "ations", "ation", "itions", "ition",
    "ements", "ement",
    "ables", "able", "ibles", "ible",
    "iques", "ique",
    "istes", "iste", "ismes", "isme",
    "isées", "isés", "isée", "isé",
    "isent", "isant", "iser", "isez",
    "euses", "euse", "eurs", "eur", "trices", "trice", "teurs", "teur",
    "elles", "elle", "ières", "iere", "ière", "iers", "ier",
    "ages", "age", "ités", "ité",
    "asses", "asse", "ettes", "ette",
    "ants", "ant", "ents", "ent",
    "aient", "ais", "ait",
    "ions", "iez",
    "ées", "ée", "ies", "ie", "és",
    "es", "s", "e",
)


def stem_fr(word: str) -> str:
    """Light French stemmer. Apply the longest matching suffix iteratively
    (max 2 passes) so plural→singular→base also collapses (e.g. "agences"
    → "agenc" → still "agenc"; "principales" → "principal" → "principal")."""
    w = word.lower()
    for _ in range(2):
        changed = False
        for suf in SUFFIXES_FR:
            if w.endswith(suf) and len(w) - len(suf) >= MIN_STEM_LEN:
                w = w[: -len(suf)]
                changed = True
                break
        if not changed:
            break
    return w


def _normalize_accents(w: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFD", w) if unicodedata.category(c) != "Mn"
    )


# ---------- Tokenization ----------

def _raw_tokens(text: str) -> list[str]:
    """All tokens, lowercased, no stop-word filter (used for n-grams)."""
    out: list[str] = []
    for match in WORD_RE.finditer(text):
        w = match.group(0).lower().strip("-'")
        if len(w) < MIN_WORD_LEN:
            continue
        out.append(w)
    return out


def tokenize(text: str, stopwords: set[str] | None = None) -> list[str]:
    """Surface-level tokens with stop-word filtering. Kept for backwards
    compatibility with callers that just want a clean bag of words."""
    sw = stopwords if stopwords is not None else ALL_STOPWORDS
    out: list[str] = []
    for w in _raw_tokens(text):
        if w in sw or _normalize_accents(w) in sw:
            continue
        out.append(w)
    return out


# ---------- N-gram extraction ----------

def _is_stop(w: str) -> bool:
    return w in ALL_STOPWORDS or _normalize_accents(w) in ALL_STOPWORDS


# Sentence boundaries we slice on before extracting n-grams. Without this, a
# bigram can span a period: "Doudoune. Pourquoi ..." → (doudoune, pourquoi)
# becomes a phantom n-gram. We split on common terminators + bullet markers
# + table cell separators so each chunk represents one continuous clause.
_SENTENCE_SPLIT_RE = re.compile(r"[.!?;:|\n\r]+|[—–]{1,}|\s•\s|\s>\s")


def _split_sentences(text: str) -> list[str]:
    return [s.strip() for s in _SENTENCE_SPLIT_RE.split(text) if s.strip()]


def extract_ngrams(text: str) -> tuple[list[str], list[tuple[str, str]], list[tuple[str, str, str]]]:
    """Return (unigram_surfaces, bigrams, trigrams).

    - Unigrams: stop-word-filtered single tokens (still surface form here;
      caller will stem them). Collected from the WHOLE text (no boundary
      restriction — single-token unigrams can't span anything anyway).
    - Bigrams: any 2 adjacent raw tokens within the SAME SENTENCE whose
      union has at least one non-stop-word.
    - Trigrams: any 3 adjacent raw tokens within the SAME SENTENCE with the
      first and last carrying meaning. Middle slot is a stopword connector
      ("de", "à", "en", "du", …) — that's where trigrams add value
      ("agence de marketing"). The sentence-boundary constraint kills
      cross-clause artefacts like "synthétique quelle matière" (from
      "...synthétique. Quelle matière...").
    """
    raw_all = _raw_tokens(text)
    unigrams = [w for w in raw_all if not _is_stop(w)]
    bigrams: list[tuple[str, str]] = []
    trigrams: list[tuple[str, str, str]] = []

    for sentence in _split_sentences(text):
        raw = _raw_tokens(sentence)
        # Bigram: both tokens must carry meaning.
        for i in range(len(raw) - 1):
            a, b = raw[i], raw[i + 1]
            if _is_stop(a) or _is_stop(b):
                continue
            bigrams.append((a, b))
        # Trigram: only the first and last must carry meaning.
        for i in range(len(raw) - 2):
            a, b, c = raw[i], raw[i + 1], raw[i + 2]
            if _is_stop(a) or _is_stop(c):
                continue
            trigrams.append((a, b, c))
    return unigrams, bigrams, trigrams


# ---------- Data class ----------

@dataclass
class TermTarget:
    term: str                       # canonical surface (most-frequent surface)
    target: float                   # median frequency across docs
    min: int                        # min freq across docs
    max: int                        # max freq across docs
    importance: float               # 0..1, normalized within the kept top
    is_ngram: bool = False          # bigram or trigram?
    surface_forms: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "term": self.term,
            "target": round(self.target, 2),
            "min": self.min,
            "max": self.max,
            "importance": round(self.importance, 4),
            "is_ngram": self.is_ngram,
            "surface_forms": self.surface_forms,
        }


# ---------- Filters ----------

def _vowel_ratio(s: str) -> float:
    letters = [c for c in s if c.isalpha()]
    if not letters:
        return 0.0
    v = sum(1 for c in letters if c in VOWELS)
    return v / len(letters)


# Stem-level stopword sets — computed lazily once. Catches morphological
# variants of stop words: "blogs" stems to "blog" (already in STOPWORDS_WEB),
# "personnalisez" stems close to "personnalis" so we drop the family.
_STOP_STEMS: set[str] = set()
_UNIGRAM_DROP_STEMS: set[str] = set()


def _build_stem_sets() -> None:
    global _STOP_STEMS, _UNIGRAM_DROP_STEMS
    _STOP_STEMS = {stem_fr(w) for w in ALL_STOPWORDS if len(w) >= MIN_WORD_LEN}
    _UNIGRAM_DROP_STEMS = {stem_fr(w) for w in UNIGRAM_DROPLIST if len(w) >= MIN_WORD_LEN}


_build_stem_sets()


def _is_keyword_variant(stem: str, keyword_stems: set[str]) -> bool:
    if stem in keyword_stems:
        return True
    # Any keyword stem fully contained as a prefix of >=4 chars
    for ks in keyword_stems:
        if len(ks) >= 4 and (stem.startswith(ks) or ks.startswith(stem)):
            return True
    return False


# ---------- BM25 ----------

def _bm25_idf(n_docs: int, df: int) -> float:
    return math.log((n_docs - df + 0.5) / (df + 0.5) + 1)


def _bm25_tf_sat(tf: int, doc_len: int, avgdl: float, k1: float, b: float) -> float:
    if doc_len <= 0 or avgdl <= 0:
        return 0.0
    return (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * doc_len / avgdl))


# ---------- Public entry point ----------

def compute_term_targets(
    competitor_texts: list[str],
    *,
    keyword: str = "",
    headings_text: str = "",
    top_n: int = 40,
    k1: float = 1.5,
    b: float = 0.75,
) -> list[TermTarget]:
    """Score every candidate term/n-gram across the competitor corpus.

    `headings_text` is the concatenation of competitor H1+H2 strings; any
    candidate that appears there gets a 1.4× boost (heading-bias signal).
    `keyword` is used to drop trivial keyword variants from the targets.
    """
    competitor_texts = [t for t in competitor_texts if t]
    if not competitor_texts:
        return []

    n_docs = len(competitor_texts)
    keyword_stems: set[str] = {stem_fr(t) for t in _raw_tokens(keyword)} if keyword else set()
    heading_terms_uni: set[str] = set()
    heading_terms_ng: set[str] = set()
    if headings_text:
        h_uni, h_bi, h_tri = extract_ngrams(headings_text)
        heading_terms_uni = {stem_fr(w) for w in h_uni}
        heading_terms_ng = {" ".join(bg) for bg in h_bi} | {" ".join(tg) for tg in h_tri}

    # ---- Per-doc indexing -------------------------------------------------

    # Unigrams: per-doc Counter of stems, plus a global stem -> Counter[surface]
    per_doc_uni: list[Counter[str]] = []
    surface_by_stem: dict[str, Counter[str]] = defaultdict(Counter)
    per_doc_bi: list[Counter[str]] = []
    per_doc_tri: list[Counter[str]] = []
    doc_lens: list[int] = []

    for text in competitor_texts:
        unigrams, bigrams, trigrams = extract_ngrams(text)
        stems = [stem_fr(w) for w in unigrams]
        for w, s in zip(unigrams, stems):
            surface_by_stem[s][w] += 1
        per_doc_uni.append(Counter(stems))
        per_doc_bi.append(Counter(" ".join(bg) for bg in bigrams))
        per_doc_tri.append(Counter(" ".join(tg) for tg in trigrams))
        doc_lens.append(len(unigrams) + len(bigrams) + len(trigrams))

    avgdl = sum(doc_lens) / n_docs if n_docs else 0.0
    if avgdl <= 0:
        return []

    candidates: list[TermTarget] = []

    # ---- Unigrams ---------------------------------------------------------

    all_stems: set[str] = set()
    for c in per_doc_uni:
        all_stems.update(c.keys())

    for stem in all_stems:
        per_doc = [c.get(stem, 0) for c in per_doc_uni]
        df = sum(1 for n in per_doc if n > 0)
        if df < 2:
            continue
        presence = df / n_docs
        if presence < 0.25:
            continue
        # surface form to display
        surfaces_counter = surface_by_stem[stem]
        if not surfaces_counter:
            continue
        canonical = surfaces_counter.most_common(1)[0][0]
        # Length / vowel sanity on the display surface
        if not (4 <= len(canonical) <= 22):
            continue
        if _vowel_ratio(canonical) < 0.2:
            continue
        # Keyword variant?
        if _is_keyword_variant(stem, keyword_stems):
            continue
        # Stem-level stopword check: catches plurals/conjugations of stop
        # words ("blogs" → stem "blog" which IS in STOPWORDS_WEB) that the
        # raw-form filter misses.
        if stem in _STOP_STEMS:
            continue
        # Unigram-only droplist: interrogatives + menu/CTA boilerplate.
        # Both the canonical surface AND any of the underlying surfaces are
        # checked so morphological variants ("personnalisez" / "personnaliser")
        # get caught too.
        if canonical in UNIGRAM_DROPLIST:
            continue
        if any(s in UNIGRAM_DROPLIST for s in surfaces_counter.keys()):
            continue
        if stem in _UNIGRAM_DROP_STEMS:
            continue
        # Skew filter
        max_freq = max(per_doc)
        avg_freq = sum(per_doc) / n_docs
        if avg_freq > 0 and max_freq >= avg_freq * 10:
            continue
        # Density floor: the term must actually be USED. Median<1 + max<2 means
        # the corpus barely surfaces it — not actionable as a target.
        median_freq = statistics.median(per_doc)
        if median_freq < 1 and max_freq < 2:
            continue
        # BM25 corpus score (sum across docs)
        idf = _bm25_idf(n_docs, df)
        bm25 = sum(
            idf * _bm25_tf_sat(tf, doc_lens[i], avgdl, k1, b)
            for i, tf in enumerate(per_doc) if tf > 0
        )
        # Business weighting
        heading_boost = 1.4 if stem in heading_terms_uni else 1.0
        importance = bm25 * (0.3 + 0.7 * presence) * heading_boost
        if importance <= 0:
            continue
        candidates.append(
            TermTarget(
                term=canonical,
                target=median_freq,
                min=min(per_doc),
                max=max(per_doc),
                importance=importance,
                is_ngram=False,
                surface_forms=[s for s, _ in surfaces_counter.most_common(8)],
            )
        )

    # ---- N-grams (bigrams + trigrams) ------------------------------------

    for n_label, per_doc_ng in (("bi", per_doc_bi), ("tri", per_doc_tri)):
        all_ng: set[str] = set()
        for c in per_doc_ng:
            all_ng.update(c.keys())
        for ng in all_ng:
            per_doc = [c.get(ng, 0) for c in per_doc_ng]
            df = sum(1 for n in per_doc if n > 0)
            if df < 2:
                continue
            presence = df / n_docs
            if presence < 0.25:
                continue
            # Drop trivial keyword echoes: every content-bearing token in the
            # n-gram is a keyword variant. We compare on STEMS so "meilleures
            # cafetières" gets folded into "meilleure cafetière".
            ng_tokens = ng.split()
            content_stems = {
                stem_fr(w) for w in ng_tokens if not _is_stop(w)
            }
            if (
                keyword_stems
                and content_stems
                and content_stems.issubset(keyword_stems)
            ):
                continue
            # Reject n-grams whose ENTIRE content payload is droplist
            # boilerplate (e.g. "client produit", "image vidéo"). We still
            # accept hybrid n-grams like "service client" or "fiche produit"
            # because they have a real content token.
            if content_stems and content_stems.issubset(_UNIGRAM_DROP_STEMS):
                continue
            # Reject n-grams contaminated with URL artefacts that leak from
            # raw markdown ("blob http localhost", "élevé plus doudoune"
            # from "lire plus").
            if any(t in {"blob", "localhost"} for t in ng_tokens):
                continue
            # Skew filter
            max_freq = max(per_doc)
            avg_freq = sum(per_doc) / n_docs
            if avg_freq > 0 and max_freq >= avg_freq * 10:
                continue
            # Density floor (same as unigrams)
            median_freq = statistics.median(per_doc)
            if median_freq < 1 and max_freq < 2:
                continue
            idf = _bm25_idf(n_docs, df)
            bm25 = sum(
                idf * _bm25_tf_sat(tf, doc_lens[i], avgdl, k1, b)
                for i, tf in enumerate(per_doc) if tf > 0
            )
            heading_boost = 1.4 if ng in heading_terms_ng else 1.0
            # Slight positive bias on n-grams (they're more semantically dense)
            ngram_bias = 1.15 if n_label == "bi" else 1.25
            importance = bm25 * (0.3 + 0.7 * presence) * heading_boost * ngram_bias
            if importance <= 0:
                continue
            candidates.append(
                TermTarget(
                    term=ng,
                    target=median_freq,
                    min=min(per_doc),
                    max=max(per_doc),
                    importance=importance,
                    is_ngram=True,
                    surface_forms=[ng],
                )
            )

    candidates.sort(key=lambda t: (-t.importance, -t.target, t.term))
    top = candidates[:top_n]
    if top:
        max_imp = top[0].importance or 1.0
        for t in top:
            t.importance = t.importance / max_imp if max_imp else 0.0
    return top
