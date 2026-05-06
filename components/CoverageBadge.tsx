export function CoverageBadge({ score }: { score: number | null }) {
  if (score == null) return null;
  const tone =
    score >= 75
      ? "border-emerald-700/50 text-emerald-300 bg-emerald-500/10"
      : score >= 50
      ? "border-amber-600/50 text-amber-200 bg-amber-500/10"
      : "border-red-700/50 text-red-300 bg-red-500/10";
  return (
    <div className={`inline-flex items-center gap-2 border rounded-full px-3 py-1 text-xs ${tone}`}>
      <span className="font-semibold tabular-nums">{score.toFixed(1)}%</span>
      <span className="opacity-75 text-[10px] uppercase tracking-wider">couverture</span>
    </div>
  );
}
