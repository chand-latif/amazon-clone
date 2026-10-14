const STAR_PATH =
  "M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3 6.1 20.6l1.3-6.6L2.5 9.4l6.6-.8L12 2.5z";

function Stars({ className }: { className: string }) {
  return (
    <span className={`flex ${className}`} aria-hidden>
      {Array.from({ length: 5 }, (_, i) => (
        <svg key={i} viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="currentColor">
          <path d={STAR_PATH} />
        </svg>
      ))}
    </span>
  );
}

/** 0-5 star rating with fractional fill. */
export function StarRating({ rating, className = "" }: { rating: number; className?: string }) {
  const pct = Math.min(100, Math.max(0, (rating / 5) * 100));
  return (
    <span
      role="img"
      aria-label={`${rating.toFixed(1)} out of 5 stars`}
      className={`relative inline-flex ${className}`}
    >
      <Stars className="text-zinc-300" />
      <span className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${pct}%` }}>
        <Stars className="text-amber-500" />
      </span>
    </span>
  );
}
