import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";
import { PAGE_SIZE, type SearchFilters } from "@/lib/search-params";

// Public catalog reads. Everything here is cached (tagged "catalog" so a later
// order/stock change can revalidate it) and uses the cookie-less anon client,
// which is what makes `'use cache'` legal. Errors are deliberately NOT caught
// here: a cached failure would be served until it expires. Callers catch.

export type ProductCard = {
  id: string;
  slug: string;
  title: string;
  brand: string | null;
  categorySlug: string;
  priceCents: number;
  listPriceCents: number | null;
  stock: number;
  ratingAvg: number;
  ratingCount: number;
  /** Storage object path of the primary image, if any. */
  imagePath: string | null;
};

export type Category = { slug: string; name: string };

const CARD_SELECT =
  "id, slug, title, brand, category_slug, price_cents, list_price_cents, stock, rating_avg, rating_count, product_images(path, position)";

type CardRow = {
  id: string;
  slug: string;
  title: string;
  brand: string | null;
  category_slug: string;
  price_cents: number;
  list_price_cents: number | null;
  stock: number;
  rating_avg: number;
  rating_count: number;
  product_images: { path: string; position: number }[];
};

function toCard(row: CardRow): ProductCard {
  const primary = [...row.product_images].sort((a, b) => a.position - b.position)[0];
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    brand: row.brand,
    categorySlug: row.category_slug,
    priceCents: row.price_cents,
    listPriceCents: row.list_price_cents,
    stock: row.stock,
    ratingAvg: Number(row.rating_avg),
    ratingCount: row.rating_count,
    imagePath: primary?.path ?? null,
  };
}

export async function getCategories(): Promise<Category[]> {
  "use cache";
  cacheLife("hours");
  cacheTag("catalog");

  const { data, error } = await createPublicClient()
    .from("categories")
    .select("slug, name")
    .order("sort_order")
    .order("name");
  if (error) throw new Error(`categories: ${error.message}`);
  return data;
}

export type HomeData = {
  categories: Category[];
  rows: { category: Category; products: ProductCard[] }[];
  deals: (ProductCard & { discountPct: number })[];
};

export async function getHomeData(): Promise<HomeData> {
  "use cache";
  cacheLife("minutes");
  cacheTag("catalog");

  const sb = createPublicClient();

  const { data: cats, error: catErr } = await sb
    .from("categories")
    .select("slug, name")
    .order("sort_order")
    .order("name");
  if (catErr) throw new Error(`categories: ${catErr.message}`);

  const [dealsRes, ...rowRes] = await Promise.all([
    sb
      .from("products")
      .select(CARD_SELECT)
      .not("list_price_cents", "is", null)
      .gt("stock", 0)
      .limit(100),
    ...cats.map((c) =>
      sb
        .from("products")
        .select(CARD_SELECT)
        .eq("category_slug", c.slug)
        .order("rating_count", { ascending: false })
        .order("id")
        .limit(10),
    ),
  ]);
  if (dealsRes.error) throw new Error(`deals: ${dealsRes.error.message}`);
  for (const r of rowRes) if (r.error) throw new Error(`category row: ${r.error.message}`);

  const deals = (dealsRes.data as CardRow[])
    .map(toCard)
    .map((p) => ({ ...p, discountPct: Math.round((1 - p.priceCents / p.listPriceCents!) * 100) }))
    .filter((p) => p.discountPct >= 1)
    .sort((a, b) => b.discountPct - a.discountPct || a.id.localeCompare(b.id))
    .slice(0, 12);

  const rows = cats
    .map((category, i) => ({ category, products: (rowRes[i].data as CardRow[]).map(toCard) }))
    .filter((r) => r.products.length > 0);

  return { categories: cats, rows, deals };
}

export type SearchResult = { products: ProductCard[]; total: number };

/** Turns free text into a prefix-matching tsquery: "wirel head" -> "wirel:* & head:*". */
function toTsQuery(keyword: string) {
  const tokens = keyword
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .slice(0, 8);
  return tokens.length ? tokens.map((t) => `${t}:*`).join(" & ") : null;
}

export async function searchProducts(filters: SearchFilters): Promise<SearchResult> {
  "use cache";
  cacheLife("minutes");
  cacheTag("catalog");

  const tsQuery = filters.k ? toTsQuery(filters.k) : null;
  // A keyword with no searchable characters (e.g. "!!!") matches nothing.
  if (filters.k && !tsQuery) return { products: [], total: 0 };

  const sb = createPublicClient();

  // `head: true` returns only the count (used to report the real total when a page is out of range).
  const base = (head: boolean) => {
    let q = sb.from("products").select(CARD_SELECT, { count: "exact", head });
    if (tsQuery) q = q.textSearch("search", tsQuery, { config: "english" });
    if (filters.c) q = q.eq("category_slug", filters.c);
    if (filters.min !== null) q = q.gte("price_cents", Math.round(filters.min * 100));
    if (filters.max !== null) q = q.lte("price_cents", Math.round(filters.max * 100));
    if (filters.rating !== null) q = q.gte("rating_avg", filters.rating);
    return q;
  };

  let query = base(false);

  // Stable tiebreak on id so pagination never repeats or skips rows.
  switch (filters.sort) {
    case "price-asc":
      query = query.order("price_cents", { ascending: true });
      break;
    case "price-desc":
      query = query.order("price_cents", { ascending: false });
      break;
    case "rating":
      query = query.order("rating_avg", { ascending: false }).order("rating_count", { ascending: false });
      break;
    case "newest":
      query = query.order("created_at", { ascending: false });
      break;
    default:
      query = query.order("rating_count", { ascending: false });
  }

  const from = (filters.page - 1) * PAGE_SIZE;
  const { data, error, count } = await query.order("id").range(from, from + PAGE_SIZE - 1);

  if (error) {
    // PGRST103: page is past the last row. Report the real total so the UI can
    // offer a way back instead of failing.
    if (error.code === "PGRST103") {
      const head = await base(true);
      if (head.error) throw new Error(`search count: ${head.error.message}`);
      return { products: [], total: head.count ?? 0 };
    }
    throw new Error(`search: ${error.message}`);
  }

  return { products: (data as CardRow[]).map(toCard), total: count ?? 0 };
}
