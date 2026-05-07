"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import {
  DupRange,
  detectDuplicates,
  verdict,
  VERDICT_LABEL,
  VERDICT_TONE,
} from "@/lib/dupDetect";

export default function CannibalizationPage() {
  const router = useRouter();
  const [textA, setTextA] = useState("");
  const [textB, setTextB] = useState("");

  // Debounce the inputs so we don't run the algo on every keystroke
  const [debouncedA, setDebouncedA] = useState("");
  const [debouncedB, setDebouncedB] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedA(textA), 220);
    return () => clearTimeout(t);
  }, [textA]);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedB(textB), 220);
    return () => clearTimeout(t);
  }, [textB]);

  const result = useMemo(
    () => detectDuplicates(debouncedA, debouncedB),
    [debouncedA, debouncedB],
  );

  const ready = debouncedA.trim().length > 30 && debouncedB.trim().length > 30;
  const v = verdict(result.score);
  const tone = VERDICT_TONE[v];

  function fuseAndGo() {
    if (!ready) return;
    // sessionStorage.setItem can throw in private browsing modes that cap
    // storage to 0 bytes (Safari ITP, locked-down enterprise profiles) or
    // when the JSON payload exceeds the per-origin quota for very long
    // pastes (~5MB). Either way, navigate anyway — the user can paste the
    // contents into /fusion manually as a fallback.
    try {
      sessionStorage.setItem(
        "fusion-prefill",
        JSON.stringify({
          sources: [plainToHtml(textA), plainToHtml(textB)],
        }),
      );
    } catch {
      /* sessionStorage unavailable or quota exceeded — graceful no-op */
    }
    router.push("/fusion");
  }

  return (
    <div className="page-shell space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3 animate-rise">
        <div>
          <div className="eyebrow mb-2 inline-flex items-center gap-2">
            <Icon name="fusion" size={11} />
            Audit
          </div>
          <h1 className="h-page">Détection de duplication</h1>
          <p className="h-sub max-w-2xl">
            Colle deux contenus côte à côte. L'algorithme détecte les passages
            réellement copiés, te donne un score de duplication, et te laisse
            les fusionner d'un clic si nécessaire.
          </p>
        </div>
        <ExplainerButton />
      </header>

      {/* Editor row — side by side */}
      <section
        className="grid grid-cols-1 lg:grid-cols-2 gap-3 animate-rise"
        style={{ animationDelay: "60ms" }}
      >
        <Editor
          label="Contenu A"
          value={textA}
          onChange={setTextA}
          words={result.totalWordsA}
          dupWords={result.duplicatedWordsA}
        />
        <Editor
          label="Contenu B"
          value={textB}
          onChange={setTextB}
          words={result.totalWordsB}
          dupWords={result.duplicatedWordsB}
        />
      </section>

      {/* Score + actions */}
      <section
        className={`relative card overflow-hidden border bg-gradient-to-br ${tone.gradient} ${tone.ring} animate-rise`}
        style={{ animationDelay: "120ms" }}
      >
        <div className="px-6 py-5 flex flex-wrap items-center gap-6 justify-between">
          <div className="flex items-center gap-5">
            <ScoreCircle value={result.score} color={tone.color} ready={ready} />
            <div>
              <div className="text-[10px] uppercase tracking-[0.18em] opacity-80">
                Verdict
              </div>
              <div className="text-xl font-semibold mt-0.5" style={{ color: tone.color }}>
                {ready ? VERDICT_LABEL[v] : "Colle les deux contenus"}
              </div>
              {ready && (
                <div className="text-xs mt-1 opacity-85 tabular-nums">
                  A : {result.scoreA.toFixed(1)}%{" · "}B : {result.scoreB.toFixed(1)}%
                  {result.runs > 0 && (
                    <>
                      {" · "}
                      {result.runs} passage{result.runs > 1 ? "s" : ""} dupliqué{result.runs > 1 ? "s" : ""}
                      {" · "}
                      run le plus long : {result.longestRun} mots
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setTextA("");
                setTextB("");
              }}
              disabled={!textA && !textB}
              className="btn-ghost px-3 py-2 text-xs"
              title="Vider les deux champs"
            >
              <Icon name="refresh" size={12} />
              Réinitialiser
            </button>
            <button
              onClick={fuseAndGo}
              disabled={!ready}
              className="btn-primary"
              title="Pré-remplir l'outil de fusion avec ces deux contenus"
            >
              <Icon name="fusion" size={14} />
              Fusionner les contenus
              <Icon name="arrow-right" size={11} className="opacity-70" />
            </button>
          </div>
        </div>

        {/* Per-text bars */}
        {ready && (
          <div className="border-t border-white/[0.07] px-6 py-3 grid grid-cols-2 gap-6">
            <ScoreBar label="A → B" value={result.scoreA} color={tone.color} />
            <ScoreBar label="B → A" value={result.scoreB} color={tone.color} />
          </div>
        )}
      </section>

      {/* Highlighted previews — side by side, with the duplicated spans
          wrapped in <mark>. IMPORTANT: pass debounced* not live text*.
          The ranges array stores character positions computed against the
          debounced text. If we used live text* (which can be 1-2 keystrokes
          ahead during typing) the .slice(start, end) calls would land on
          shifted characters and we'd mark the wrong words. */}
      {ready && result.runs > 0 && (
        <section
          className="grid grid-cols-1 lg:grid-cols-2 gap-3 animate-rise"
          style={{ animationDelay: "180ms" }}
        >
          <Preview
            label="Aperçu A"
            text={debouncedA}
            ranges={result.rangesA}
            color={tone.color}
          />
          <Preview
            label="Aperçu B"
            text={debouncedB}
            ranges={result.rangesB}
            color={tone.color}
          />
        </section>
      )}

      {ready && result.runs === 0 && (
        <div className="card border-emerald-700/30 bg-emerald-500/[0.03] px-5 py-3.5 text-sm text-emerald-200/90 inline-flex items-center gap-2 animate-rise">
          <Icon name="check" size={12} />
          Aucun passage de 5 mots ou plus copié verbatim. Les deux contenus sont
          rédigés de manière indépendante.
        </div>
      )}

      <style jsx global>{`
        .dup-mark {
          background: linear-gradient(180deg, rgba(239, 68, 68, 0.40), rgba(220, 38, 38, 0.55));
          color: #fff;
          padding: 1px 3px;
          border-radius: 3px;
          box-decoration-break: clone;
          -webkit-box-decoration-break: clone;
          font-weight: 500;
          text-shadow: 0 1px 0 rgba(0,0,0,0.25);
        }
      `}</style>
    </div>
  );
}

/* ----------------------------- Sub-components ----------------------------- */

function Editor({
  label,
  value,
  onChange,
  words,
  dupWords,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  words: number;
  dupWords: number;
}) {
  return (
    <div className="card overflow-hidden flex flex-col">
      <div className="card-section">
        <span className="label">{label}</span>
        <span className="text-[11px] text-zinc-500 tabular-nums">
          {words.toLocaleString("fr-FR")} mot{words > 1 ? "s" : ""}
          {dupWords > 0 && (
            <span className="text-red-300">
              {" · "}
              {dupWords} dupliqué{dupWords > 1 ? "s" : ""}
            </span>
          )}
        </span>
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Colle ton contenu ici. Le score se met à jour en direct."
        spellCheck={false}
        className="w-full bg-transparent px-5 py-4 text-[14px] leading-relaxed text-zinc-100 focus:outline-none resize-none"
        style={{ minHeight: 280 }}
      />
    </div>
  );
}

function Preview({
  label,
  text,
  ranges,
  color,
}: {
  label: string;
  text: string;
  ranges: DupRange[];
  color: string;
}) {
  const nodes = useMemo(() => buildNodes(text, ranges), [text, ranges]);
  return (
    <div className="card overflow-hidden flex flex-col">
      <div className="card-section">
        <span className="label inline-flex items-center gap-2">
          <span
            aria-hidden
            className="w-2 h-2 rounded-full"
            style={{ background: color }}
          />
          {label}
        </span>
        <span className="text-[11px] text-zinc-500">
          {ranges.length} passage{ranges.length > 1 ? "s" : ""} surligné{ranges.length > 1 ? "s" : ""}
        </span>
      </div>
      <pre
        className="px-5 py-4 text-[13.5px] leading-relaxed text-zinc-200 whitespace-pre-wrap break-words font-sans overflow-y-auto"
        style={{ maxHeight: 540 }}
      >
        {nodes}
      </pre>
    </div>
  );
}

function buildNodes(text: string, ranges: DupRange[]): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let cursor = 0;
  let key = 0;
  for (const [start, end] of ranges) {
    if (start > cursor) {
      out.push(text.slice(cursor, start));
    }
    out.push(
      <mark key={key++} className="dup-mark">
        {text.slice(start, end)}
      </mark>,
    );
    cursor = end;
  }
  if (cursor < text.length) {
    out.push(text.slice(cursor));
  }
  return out;
}

function ScoreCircle({
  value,
  color,
  ready,
}: {
  value: number;
  color: string;
  ready: boolean;
}) {
  const r = 32;
  const c = 2 * Math.PI * r;
  const dash = (Math.min(100, Math.max(0, value)) / 100) * c;
  return (
    <div className="relative w-[88px] h-[88px] shrink-0">
      <svg width="88" height="88" viewBox="0 0 88 88" className="-rotate-90">
        <circle cx="44" cy="44" r={r} stroke="rgba(255,255,255,0.08)" strokeWidth="6" fill="none" />
        <circle
          cx="44"
          cy="44"
          r={r}
          stroke={ready ? color : "rgba(255,255,255,0.2)"}
          strokeWidth="6"
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${dash} ${c}`}
          style={{
            transition: "stroke-dasharray 700ms cubic-bezier(0.16,1,0.3,1), stroke 400ms",
            filter: ready ? `drop-shadow(0 0 12px ${color}80)` : "none",
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold tabular-nums leading-none">
          {ready ? value.toFixed(0) : "—"}
        </span>
        <span className="text-[9px] uppercase tracking-wider text-zinc-400 mt-0.5">
          {ready ? "/ 100" : "score"}
        </span>
      </div>
    </div>
  );
}

function ScoreBar({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-[10px] uppercase tracking-[0.14em] text-zinc-400">
          {label}
        </span>
        <span className="text-xs tabular-nums text-zinc-200 font-medium">
          {value.toFixed(1)}%
        </span>
      </div>
      <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${Math.min(100, value)}%`,
            background: color,
            boxShadow: value > 5 ? `0 0 12px ${color}80` : undefined,
          }}
        />
      </div>
    </div>
  );
}

/* ---------- Plain text → minimal HTML for /fusion handoff ---------- */

function plainToHtml(plain: string): string {
  // Split on blank lines into paragraphs, escape, wrap in <p>. Single line
  // breaks within a paragraph become <br>. Conservative — the fusion engine
  // accepts any HTML, so simple is fine here.
  const parts = plain
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return "";
  return parts
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("\n");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* ----------------------------- Explainer modal ----------------------------- */

function ExplainerButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="btn-secondary px-3 py-2 text-xs"
        title="Comment l'algo détecte les duplicats"
      >
        <Icon name="info" size={12} />
        Comment ça marche
      </button>
      {open && <ExplainerModal onClose={() => setOpen(false)} />}
    </>
  );
}

function ExplainerModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-6"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl max-h-[90vh] overflow-y-auto card-elevated"
      >
        <div className="px-6 py-4 border-b border-[var(--border)] flex items-center justify-between sticky top-0 bg-[var(--bg-elevated)]/95 backdrop-blur-md z-10">
          <h3 className="font-semibold text-base">L'algorithme de détection</h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-white text-lg leading-none">
            ×
          </button>
        </div>
        <div className="px-6 py-5 space-y-5 text-[13.5px] leading-relaxed text-zinc-300">
          <Section title="1. Tokenisation" badge="Unicode-safe">
            <p>
              Chaque texte est découpé en mots (regex Unicode FR + accents),
              avec leur position exacte dans le texte original. Pour la
              comparaison on lowercase et on enlève les diacritiques (donc
              « Synthétique » et « synthétique » matchent), mais on garde la
              forme originale pour le surlignage.
            </p>
          </Section>
          <Section title="2. Shingling K=5" badge="Rabin-Karp">
            <p>
              On découpe le texte B en fenêtres glissantes de 5 mots
              consécutifs (« 5-shingles ») et on les hash dans une map
              <code className="text-[12px] text-zinc-100 bg-white/[0.04] px-1.5 py-0.5 rounded mx-1">
                hash → positions
              </code>
              . C'est l'approche standard pour la détection de plagiat
              (Stanford CS246, Copyscape, Plagscan).
            </p>
            <p>
              Pourquoi K=5 ? Sous 5 mots on attrape trop de phrases banales
              (« il est important de noter »). Au-delà on rate les courtes
              copies. 5 est le sweet spot empirique.
            </p>
          </Section>
          <Section title="3. Recherche + extension greedy" badge="LCS">
            <p>
              Pour chaque 5-shingle de A, on regarde s'il existe dans B. Si
              oui, on étend le match en avant tant que les deux côtés sont
              d'accord — un match initial de 5 mots peut grandir à 50, 100,
              200 mots si la copie est longue.
            </p>
            <p>
              On collecte tous les matches candidats puis on en sélectionne
              le maximum non-chevauchant en commençant par les plus longs.
              C'est l'approche greedy classique pour la couverture maximale
              en LCS — provably à un facteur constant de l'optimum NP-dur.
            </p>
          </Section>
          <Section title="4. Score" badge="0-100">
            <pre className="text-[11.5px] leading-snug bg-[#0e0e11] border border-[#25252a] rounded-lg p-3 font-mono text-zinc-300">
{`scoreA = (mots de A couverts par un run dupliqué) / (mots de A) × 100
scoreB = (mots de B couverts par un run dupliqué) / (mots de B) × 100
score  = max(scoreA, scoreB)

→ on prend le MAX et pas la moyenne : si A fait 1000 mots et B fait
  100 mots et que B est entièrement copié de A, scoreA=10 mais
  scoreB=100. La moyenne (55) sous-estime le problème — le max (100)
  reflète honnêtement que B est un clone.`}
            </pre>
          </Section>
          <Section title="5. Verdicts">
            <ul className="list-disc pl-5 space-y-0.5">
              <li><strong className="text-emerald-300">0-15 %</strong> · duplication minime — phrases banales</li>
              <li><strong className="text-amber-300">15-35 %</strong> · duplication modérée — vérifier</li>
              <li><strong className="text-orange-300">35-60 %</strong> · duplication significative</li>
              <li><strong className="text-red-300">60-100 %</strong> · cannibalisation critique — fusionner</li>
            </ul>
          </Section>
          <Section title="6. Surlignage caractère-précis">
            <p>
              Les positions originales conservées à l'étape 1 permettent de
              wrapper les passages dupliqués dans
              <code className="text-[12px] text-zinc-100 bg-white/[0.04] px-1.5 py-0.5 rounded mx-1">
                {"<mark>"}
              </code>
              en gardant TON formatage exact (sauts de ligne, ponctuation,
              accents). Pas de transformation, pas de perte d'information.
            </p>
          </Section>
          <Section title="7. Pourquoi pas un appel IA ?">
            <p>
              L'IA est utile pour la paraphrase sémantique (« est-ce que ces
              deux textes disent la même chose avec d'autres mots »). Pour
              la duplication littérale (« est-ce que ce texte est copié »),
              un algo déterministe est :
            </p>
            <ul className="list-disc pl-5 space-y-0.5">
              <li>plus précis (zéro faux positif sur du texte original)</li>
              <li>plus rapide (live au keystroke, pas de roundtrip réseau)</li>
              <li>gratuit (zéro token)</li>
              <li>auditable — tu peux relire chaque ligne du code</li>
            </ul>
            <p>
              C'est pourquoi tous les outils sérieux (Copyscape, Plagscan,
              Turnitin) utilisent du shingling, pas du LLM.
            </p>
          </Section>
          <Section title="8. Limites assumées">
            <ul className="list-disc pl-5 space-y-0.5">
              <li>
                <strong>Paraphrase non détectée</strong> — par design. « le
                duvet est chaud » et « la chaleur du duvet » ne matchent
                pas. C'est l'algo de plagiat strict, pas de similarité
                sémantique.
              </li>
              <li>
                <strong>Réordonnancement de paragraphes</strong> — détecté
                pleinement (chaque paragraphe est traité indépendamment).
              </li>
              <li>
                <strong>Petits textes (&lt; 5 mots)</strong> — pas
                d'analyse, score 0 (la fenêtre minimale ne tient pas).
              </li>
            </ul>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  badge,
  children,
}: {
  title: string;
  badge?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h4 className="text-[13px] font-semibold text-zinc-100 inline-flex items-center gap-2">
        {title}
        {badge && (
          <span className="text-[9px] uppercase tracking-[0.14em] text-accent-200 bg-accent-500/15 border border-accent-500/30 px-1.5 py-0.5 rounded">
            {badge}
          </span>
        )}
      </h4>
      <div className="space-y-2">{children}</div>
    </section>
  );
}
