import { InternalLink } from "@/lib/types";
import { Icon } from "@/components/Icon";

export function LinkSuggestionsPanel({ links }: { links: InternalLink[] | null }) {
  if (!links || links.length === 0) {
    return (
      <div className="card p-4 text-sm text-zinc-500">
        Aucun lien interne inséré.
      </div>
    );
  }
  return (
    <div className="card overflow-hidden">
      <div className="card-section">
        <h3 className="label inline-flex items-center gap-1.5">
          <Icon name="link" size={14} className="text-zinc-500" />
          Liens internes
        </h3>
        <span className="text-[11px] text-zinc-500 tabular-nums">{links.length}</span>
      </div>
      <ul className="divide-y divide-[var(--border)]">
        {links.map((l, i) => (
          <li key={i} className="px-4 py-3 space-y-1">
            <div className="font-medium text-zinc-200 text-sm">« {l.anchor} »</div>
            <a
              href={l.target_url}
              target="_blank"
              rel="noreferrer"
              className="text-accent-400 hover:text-accent-300 text-xs break-all hover:underline inline-flex items-center gap-1"
            >
              <Icon name="external" size={11} />
              {l.target_url}
            </a>
            <div className="text-[11px] text-zinc-500">
              section {l.section_id} · sim {Math.round(l.similarity * 100)}%
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
