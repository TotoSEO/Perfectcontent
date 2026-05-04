import { InternalLink } from "@/lib/types";

export function LinkSuggestionsPanel({ links }: { links: InternalLink[] | null }) {
  if (!links || links.length === 0) {
    return (
      <div className="bg-ink-900 border border-ink-800 rounded-xl p-4 text-sm text-zinc-500">
        Aucun lien interne inséré.
      </div>
    );
  }
  return (
    <div className="bg-ink-900 border border-ink-800 rounded-xl p-4 space-y-2">
      <h3 className="text-sm uppercase tracking-wider text-zinc-500">Liens internes</h3>
      <ul className="space-y-2 text-sm">
        {links.map((l, i) => (
          <li key={i} className="border-b border-ink-800 pb-2 last:border-0">
            <div className="font-medium">« {l.anchor} »</div>
            <a
              href={l.target_url}
              target="_blank"
              rel="noreferrer"
              className="text-accent-500 text-xs break-all hover:underline"
            >
              {l.target_url}
            </a>
            <div className="text-xs text-zinc-500">
              section {l.section_id} · sim {Math.round(l.similarity * 100)}%
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
