export function CoverageBadge({ score }: { score: number | null }) {
  if (score == null) return null;
  const tone =
    score >= 75
      ? "bg-emerald-700/30 text-emerald-200 border-emerald-700"
      : score >= 50
      ? "bg-amber-700/30 text-amber-100 border-amber-700"
      : "bg-red-800/30 text-red-200 border-red-700";
  return (
    <div className={`inline-flex items-center gap-2 border rounded px-3 py-1 text-sm ${tone}`}>
      <span className="font-semibold">{score.toFixed(1)}%</span>
      <span className="text-xs opacity-80">couverture sémantique</span>
    </div>
  );
}
