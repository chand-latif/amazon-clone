import { splitPrice } from "@/lib/format";

/** Price with a small superscript currency symbol and cents. Takes integer cents. */
export function Price({ cents, className = "" }: { cents: number; className?: string }) {
  const { whole, fraction } = splitPrice(cents);
  return (
    <span className={`inline-flex items-start leading-none ${className}`}>
      <span className="text-[0.6em] leading-[1.4]" aria-hidden>
        $
      </span>
      <span className="text-[1em] font-medium" aria-hidden>
        {whole}
      </span>
      <span className="text-[0.6em] leading-[1.4]" aria-hidden>
        {fraction}
      </span>
      <span className="sr-only">{`$${whole}.${fraction}`}</span>
    </span>
  );
}
