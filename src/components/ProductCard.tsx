import Image from "next/image";
import Link from "next/link";
import type { ProductCard as Product } from "@/lib/catalog";
import { productImageUrl } from "@/lib/images";
import { Price } from "./Price";
import { StarRating } from "./StarRating";

function ImagePlaceholder() {
  return (
    <div className="flex h-full w-full items-center justify-center text-zinc-300" aria-hidden>
      <svg viewBox="0 0 24 24" className="h-12 w-12" fill="none" stroke="currentColor" strokeWidth="1.4">
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <circle cx="9" cy="10" r="1.6" />
        <path d="m4 18 5-5 4 4 3-3 4 4" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

export function ProductCard({
  product,
  discountPct,
  priority = false,
  sizes = "(min-width: 1280px) 20vw, (min-width: 768px) 30vw, 46vw",
}: {
  product: Product;
  /** Show a "-N%" badge (used by the deals strip). */
  discountPct?: number;
  priority?: boolean;
  sizes?: string;
}) {
  const outOfStock = product.stock === 0;
  const lowStock = product.stock > 0 && product.stock <= 5;
  const pct =
    discountPct ??
    (product.listPriceCents ? Math.round((1 - product.priceCents / product.listPriceCents) * 100) : 0);

  return (
    <article className="relative flex h-full flex-col rounded bg-surface p-3 shadow-sm transition-shadow hover:shadow-md">
      <div className="relative mb-2 aspect-square w-full overflow-hidden rounded bg-white">
        {product.imagePath ? (
          <Image
            src={productImageUrl(product.imagePath)}
            alt=""
            fill
            sizes={sizes}
            priority={priority}
            className="object-contain p-2"
          />
        ) : (
          <ImagePlaceholder />
        )}
        {pct >= 1 && !outOfStock && (
          <span className="absolute left-1 top-1 rounded bg-price px-1.5 py-0.5 text-xs font-bold text-white">
            -{pct}%
          </span>
        )}
      </div>

      {product.brand && <p className="text-xs text-zinc-500">{product.brand}</p>}
      <h3 className="line-clamp-2 text-sm leading-snug text-foreground">
        {/* Stretched link: the whole card is clickable, one tab stop. */}
        <Link
          href={`/p/${product.slug}`}
          className="after:absolute after:inset-0 after:content-[''] hover:text-link hover:underline"
        >
          {product.title}
        </Link>
      </h3>

      <div className="mt-1 flex items-center gap-1.5 text-xs text-zinc-600">
        <StarRating rating={product.ratingAvg} />
        <span aria-label={`${product.ratingCount.toLocaleString("en-US")} ratings`}>
          {product.ratingCount.toLocaleString("en-US")}
        </span>
      </div>

      <div className="mt-auto pt-2">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <Price cents={product.priceCents} className="text-xl text-foreground" />
          {product.listPriceCents && (
            <span className="text-xs text-zinc-500">
              List: <s>${(product.listPriceCents / 100).toFixed(2)}</s>
            </span>
          )}
        </div>
        {outOfStock && <p className="mt-1 text-xs font-medium text-zinc-600">Currently unavailable</p>}
        {lowStock && <p className="mt-1 text-xs font-medium text-price">Only {product.stock} left in stock</p>}
      </div>
    </article>
  );
}
