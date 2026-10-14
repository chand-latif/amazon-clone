import { StarRating } from "@/components/StarRating";
import type { ProductDetail } from "@/lib/catalog";

function formatDate(iso: string) {
  // Fixed zone + locale so server and client always agree.
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

/** Rating summary plus the reviews we actually have stored (no invented histogram). */
export function Reviews({ product }: { product: ProductDetail }) {
  const { reviews, ratingAvg, ratingCount } = product;

  return (
    <section id="reviews" aria-labelledby="reviews-heading" className="rounded bg-surface p-4 shadow-sm lg:p-6">
      <h2 id="reviews-heading" className="text-xl font-bold">
        Customer reviews
      </h2>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <StarRating rating={ratingAvg} className="scale-125 origin-left" />
        <p className="ml-3 text-lg font-medium">{ratingAvg.toFixed(1)} out of 5</p>
      </div>
      <p className="mt-1 text-sm text-zinc-600">{ratingCount.toLocaleString("en-US")} global ratings</p>

      {reviews.length === 0 ? (
        <p className="mt-6 text-sm text-zinc-600">There are no written reviews for this product yet.</p>
      ) : (
        <>
          <h3 className="mt-6 text-base font-bold">Top reviews</h3>
          <ul className="mt-3 divide-y divide-zinc-200">
            {reviews.map((r) => (
              <li key={r.id} className="py-4">
                <p className="text-sm font-medium">{r.authorName}</p>
                <div className="mt-1 flex items-center gap-2">
                  <StarRating rating={r.rating} />
                  {r.title && <span className="text-sm font-bold">{r.title}</span>}
                </div>
                <p className="mt-1 text-xs text-zinc-500">Reviewed on {formatDate(r.createdAt)}</p>
                {r.body && <p className="mt-2 text-sm leading-relaxed">{r.body}</p>}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
