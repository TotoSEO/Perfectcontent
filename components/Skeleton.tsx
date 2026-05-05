export function SkeletonRow({ height = 56 }: { height?: number }) {
  return (
    <div
      className="skeleton w-full"
      style={{ height }}
      aria-busy="true"
    />
  );
}

export function SkeletonList({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonRow key={i} />
      ))}
    </div>
  );
}

export function SkeletonCard({ children }: { children?: React.ReactNode }) {
  return (
    <div className="card p-5 space-y-3">
      <div className="skeleton h-4 w-1/3" />
      <div className="skeleton h-3 w-2/3" />
      {children}
    </div>
  );
}
