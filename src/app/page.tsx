import Link from "next/link";
import { Suspense } from "react";
import { HeroCarousel, type HeroSlide } from "@/components/HeroCarousel";
import { ProductRow } from "@/components/ProductRow";
import { HomeSkeleton } from "@/components/Skeletons";
import { ErrorState } from "@/components/States";
import { getHomeData, type HomeData } from "@/lib/catalog";
import { formatPrice } from "@/lib/format";
import { productImageUrl } from "@/lib/images";
import { SITE_NAME } from "@/lib/site";

const MAX_HERO_SLIDES = 4;

/** One slide per category (best-selling product with an image up front). */
function buildSlides(data: HomeData): HeroSlide[] {
  const slides = data.rows.slice(0, MAX_HERO_SLIDES).map(({ category, products }, i): HeroSlide => {
    const lead = products.find((p) => p.imagePath) ?? products[0];
    const cheapest = Math.min(...products.map((p) => p.priceCents));
    return {
      id: category.slug,
      eyebrow: "Top picks",
      headline: category.name,
      subline: `Best sellers from ${formatPrice(cheapest)}. Loved by customers, ready to ship.`,
      href: `/s?c=${category.slug}`,
      cta: `Shop ${category.name}`,
      image: lead.imagePath ? productImageUrl(lead.imagePath) : null,
      imageAlt: lead.title,
      theme: i,
    };
  });

  if (slides.length > 0) return slides;
  return [
    {
      id: "welcome",
      eyebrow: "Welcome",
      headline: `Shop on ${SITE_NAME}`,
      subline: "Fresh products are on the way. Browse the catalog or search for something specific.",
      href: "/s",
      cta: "Browse all products",
      image: null,
      imageAlt: "",
      theme: 0,
    },
  ];
}

async function HomeContent() {
  let data: HomeData;
  try {
    data = await getHomeData();
  } catch (error) {
    console.error("Home page data failed to load:", error);
    return <ErrorState retryHref="/" />;
  }

  const discounts = Object.fromEntries(data.deals.map((d) => [d.id, d.discountPct]));

  return (
    <div className="space-y-4">
      <HeroCarousel slides={buildSlides(data)} />

      {data.deals.length > 0 && (
        <ProductRow
          id="deals"
          title="Today's Deals"
          href="/s?sort=price-asc"
          products={data.deals}
          discounts={discounts}
        />
      )}

      {data.rows.map(({ category, products }) => (
        <ProductRow
          key={category.slug}
          id={`row-${category.slug}`}
          title={`Best sellers in ${category.name}`}
          href={`/s?c=${category.slug}`}
          products={products}
        />
      ))}

      {data.rows.length === 0 && (
        <div className="rounded bg-surface px-6 py-10 text-center shadow-sm">
          <h2 className="text-xl font-bold">No products yet</h2>
          <p className="mt-2 text-sm text-zinc-600">
            The catalog is empty right now.{" "}
            <Link href="/s" className="text-link hover:underline">
              Browse all products
            </Link>
          </p>
          {process.env.NODE_ENV === "development" && (
            <p className="mx-auto mt-3 w-fit rounded bg-zinc-100 p-2 font-mono text-xs">Dev hint: run npm run seed</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<HomeSkeleton />}>
      <HomeContent />
    </Suspense>
  );
}
