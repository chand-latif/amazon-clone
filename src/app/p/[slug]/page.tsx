import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BuyBox } from "@/components/product/BuyBox";
import { Gallery } from "@/components/product/Gallery";
import { Reviews } from "@/components/product/Reviews";
import { Price } from "@/components/Price";
import { ProductRow } from "@/components/ProductRow";
import { ProductPageSkeleton, RowSkeleton } from "@/components/Skeletons";
import { StarRating } from "@/components/StarRating";
import { ErrorState } from "@/components/States";
import { getProductBySlug, getProductSlugs, getRelatedProducts, type ProductDetail } from "@/lib/catalog";
import { formatPrice } from "@/lib/format";
import { productImageUrl } from "@/lib/images";

// Prerender every known product at build time. Cache Components requires at
// least one param, so an empty catalog falls back to a placeholder (-> 404).
export async function generateStaticParams() {
  const slugs = await getProductSlugs();
  return slugs.length > 0 ? slugs.map((slug) => ({ slug })) : [{ slug: "__placeholder__" }];
}

export async function generateMetadata(props: PageProps<"/p/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const product = await getProductBySlug(slug);
  if (!product) return { title: "Product not found" };

  const description = product.description.slice(0, 160);
  const image = product.imagePaths[0] ? productImageUrl(product.imagePaths[0]) : undefined;
  return {
    title: product.title,
    description,
    openGraph: { title: product.title, description, images: image ? [image] : undefined },
  };
}

function RelatedProducts({ product }: { product: ProductDetail }) {
  return (
    <Suspense fallback={<RowSkeleton />}>
      <RelatedRow categorySlug={product.categorySlug} categoryName={product.categoryName} productId={product.id} />
    </Suspense>
  );
}

async function RelatedRow({
  categorySlug,
  categoryName,
  productId,
}: {
  categorySlug: string;
  categoryName: string;
  productId: string;
}) {
  let related;
  try {
    related = await getRelatedProducts(categorySlug, productId);
  } catch (error) {
    // The product page is still useful without this row.
    console.error("Related products failed to load:", error);
    return null;
  }
  if (related.length === 0) return null;
  return <ProductRow id="related" title={`More in ${categoryName}`} href={`/s?c=${categorySlug}`} products={related} />;
}

function ProductDetails({ product }: { product: ProductDetail }) {
  const imageUrls = product.imagePaths.map(productImageUrl);
  const discounted = product.listPriceCents !== null;
  const savings = discounted ? product.listPriceCents! - product.priceCents : 0;
  const savingsPct = discounted ? Math.round((savings / product.listPriceCents!) * 100) : 0;
  const delivery = product.features.find((f) => /^ships/i.test(f)) ?? null;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.title,
    description: product.description,
    sku: product.slug,
    image: imageUrls,
    ...(product.brand && { brand: { "@type": "Brand", name: product.brand } }),
    ...(product.ratingCount > 0 && {
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: product.ratingAvg,
        ratingCount: product.ratingCount,
      },
    }),
    offers: {
      "@type": "Offer",
      priceCurrency: "USD",
      price: (product.priceCents / 100).toFixed(2),
      availability: product.stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
    },
  };

  return (
    <div className="space-y-4">
      <nav aria-label="Breadcrumb" className="text-xs text-zinc-600">
        <ol className="flex flex-wrap items-center gap-1">
          <li>
            <Link href="/" className="-my-1.5 inline-block py-1.5 hover:text-price hover:underline">
              Home
            </Link>
          </li>
          <li aria-hidden>›</li>
          <li>
            <Link href={`/s?c=${product.categorySlug}`} className="-my-1.5 inline-block py-1.5 hover:text-price hover:underline">
              {product.categoryName}
            </Link>
          </li>
          <li aria-hidden>›</li>
          <li aria-current="page" className="line-clamp-1 max-w-xs text-zinc-600">
            {product.title}
          </li>
        </ol>
      </nav>

      {/*
        Mobile order: gallery, title + price, buy box, then details.
        Desktop: gallery | title/price over details | buy box (gallery and buy box span both rows).
      */}
      <article className="grid gap-x-6 gap-y-4 rounded bg-surface p-4 shadow-sm lg:grid-cols-[minmax(0,5fr)_minmax(0,4fr)_minmax(0,3fr)] lg:grid-rows-[auto_1fr] lg:p-6">
        <div className="lg:col-start-1 lg:row-span-2 lg:row-start-1">
          <Gallery images={imageUrls} title={product.title} />
        </div>

        <div className="min-w-0 lg:col-start-2 lg:row-start-1">
          <h1 className="text-xl font-medium leading-snug sm:text-2xl">{product.title}</h1>
          {product.brand && (
            <p className="mt-1 text-sm">
              <Link href={`/s?k=${encodeURIComponent(product.brand)}`} className="-my-1 inline-block py-1 text-link hover:text-price hover:underline">
                Brand: {product.brand}
              </Link>
            </p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">{product.ratingAvg.toFixed(1)}</span>
            <StarRating rating={product.ratingAvg} />
            <a href="#reviews" className="-my-1 inline-block py-1 text-link hover:text-price hover:underline">
              {product.ratingCount.toLocaleString("en-US")} ratings
            </a>
          </div>

          <hr className="my-3 border-zinc-200" />

          <div className="flex flex-wrap items-baseline gap-x-3">
            {discounted && <span className="text-3xl font-light text-price">-{savingsPct}%</span>}
            <Price cents={product.priceCents} className="text-3xl" />
          </div>
          {discounted && (
            <p className="mt-1 text-sm text-zinc-600">
              List Price: <s>{formatPrice(product.listPriceCents!)}</s>
              <span className="ml-2 text-price">
                You save {formatPrice(savings)} ({savingsPct}%)
              </span>
            </p>
          )}
        </div>

        <div className="lg:sticky lg:top-28 lg:col-start-3 lg:row-span-2 lg:row-start-1 lg:self-start">
          <BuyBox productId={product.id} priceCents={product.priceCents} stock={product.stock} delivery={delivery} />
        </div>

        <div className="min-w-0 lg:col-start-2 lg:row-start-2">
          {product.features.length > 0 && (
            <section aria-labelledby="about-heading">
              <h2 id="about-heading" className="text-base font-bold">
                About this item
              </h2>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed">
                {product.features.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </section>
          )}

          {product.description && (
            <section aria-labelledby="desc-heading" className="mt-4">
              <h2 id="desc-heading" className="text-base font-bold">
                Product description
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-zinc-800">{product.description}</p>
            </section>
          )}
        </div>
      </article>

      <RelatedProducts product={product} />
      <Reviews product={product} />

      <script
        type="application/ld+json"
        // "<" escaped so product text can never close the script tag.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
    </div>
  );
}

// `params` is awaited inside <Suspense> (the pattern Cache Components expects),
// so unknown slugs get the App Shell first and then the not-found UI. That means
// HTTP 200 + noindex rather than a true 404; dynamicParams = false is not
// available with Cache Components, and the docs prescribe notFound() instead.
async function ProductLoader({ params }: { params: PageProps<"/p/[slug]">["params"] }) {
  const { slug } = await params;

  let product: ProductDetail | null;
  try {
    product = await getProductBySlug(slug);
  } catch (error) {
    console.error("Product failed to load:", error);
    return <ErrorState retryHref={`/p/${slug}`} />;
  }
  if (!product) notFound();

  return <ProductDetails product={product} />;
}

export default function ProductPage(props: PageProps<"/p/[slug]">) {
  return (
    <Suspense fallback={<ProductPageSkeleton />}>
      <ProductLoader params={props.params} />
    </Suspense>
  );
}
