/**
 * Seed the catalog from DummyJSON: categories, products, images (re-hosted in
 * Supabase Storage), and reviews. Safe to re-run: everything is upserted on a
 * stable key, and images already in Storage are skipped.
 *
 *   npm run seed:dry   # fetch + print the plan; touches nothing, needs no key
 *   npm run seed       # write to the Supabase project in .env.local
 *
 * Uses the SERVICE-ROLE key (bypasses RLS). Local use only: never import this
 * from app code, never prefix the key with NEXT_PUBLIC_, never set it on Vercel.
 */
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const DUMMYJSON_URL = "https://dummyjson.com/products?limit=0";
const BUCKET = "product-images";
const IMAGE_CONCURRENCY = 6;
const CHUNK = 50;

// Our categories, built from DummyJSON source categories. Products are picked
// round-robin across the sources (lowest id first) so a category is varied and
// the selection is identical on every run. Unlisted sources (groceries,
// vehicles, motorcycles) are skipped.
const CATEGORIES = [
  { slug: "electronics", name: "Electronics", cap: 14, sources: ["smartphones", "laptops", "tablets", "mobile-accessories"] },
  { slug: "home-kitchen", name: "Home & Kitchen", cap: 14, sources: ["furniture", "home-decoration", "kitchen-accessories"] },
  { slug: "beauty", name: "Beauty", cap: 14, sources: ["beauty", "skin-care", "fragrances"] },
  { slug: "fashion", name: "Fashion", cap: 14, sources: ["mens-shirts", "womens-dresses", "tops", "mens-shoes", "womens-shoes", "womens-bags", "sunglasses"] },
  { slug: "watches-jewelry", name: "Watches & Jewelry", cap: 14, sources: ["mens-watches", "womens-watches", "womens-jewellery"] },
  { slug: "sports-outdoors", name: "Sports & Outdoors", cap: 12, sources: ["sports-accessories"] },
] as const;

type DjReview = { rating: number; comment: string; date: string; reviewerName: string };
type DjProduct = {
  id: number;
  title: string;
  description: string;
  category: string;
  price: number;
  discountPercentage: number;
  rating: number;
  stock: number;
  brand?: string;
  sku?: string;
  warrantyInformation?: string;
  shippingInformation?: string;
  returnPolicy?: string;
  reviews: DjReview[];
  images: string[];
  thumbnail: string;
};

type ProductRow = {
  slug: string;
  title: string;
  brand: string | null;
  description: string;
  features: string[];
  category_slug: string;
  price_cents: number;
  list_price_cents: number | null;
  stock: number;
  rating_avg: number;
  rating_count: number;
};

type Planned = {
  row: ProductRow;
  imageUrls: string[];
  reviews: { id: string; author_name: string; rating: number; title: string; body: string; created_at: string }[];
};

// ---------------------------------------------------------------------------
// Pure transforms (no I/O)
// ---------------------------------------------------------------------------
function slugify(text: string) {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Deterministic UUID derived from a string, so review upserts are idempotent. */
function stableUuid(input: string) {
  const h = createHash("sha1").update(input).digest("hex");
  const variant = ((parseInt(h.slice(16, 18), 16) & 0x3f) | 0x80).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${variant}${h.slice(18, 20)}-${h.slice(20, 32)}`;
}

const REVIEW_TITLES = ["Disappointed", "Could be better", "It's okay", "Good value", "Highly recommend"];

function selectProducts(all: DjProduct[]) {
  const picked: { category: (typeof CATEGORIES)[number]; product: DjProduct }[] = [];
  for (const category of CATEGORIES) {
    const queues = category.sources.map((src) =>
      all.filter((p) => p.category === src).sort((a, b) => a.id - b.id),
    );
    let count = 0;
    for (let round = 0; count < category.cap; round++) {
      let took = false;
      for (const q of queues) {
        if (round < q.length && count < category.cap) {
          picked.push({ category, product: q[round] });
          count++;
          took = true;
        }
      }
      if (!took) break;
    }
  }
  return picked;
}

function plan(category: (typeof CATEGORIES)[number], p: DjProduct): Planned {
  const slug = `${slugify(p.title)}-${p.id}`;

  // DummyJSON's `price` is the pre-discount price; the sale price applies the discount.
  const listCents = Math.round(p.price * 100);
  const saleCents = Math.max(1, Math.round(p.price * (1 - p.discountPercentage / 100) * 100));
  const discounted = p.discountPercentage >= 1 && listCents > saleCents;

  const features = [p.warrantyInformation, p.shippingInformation, p.returnPolicy, p.sku && `SKU: ${p.sku}`].filter(
    (f): f is string => Boolean(f),
  );

  const imageUrls = [...new Set(p.images.length ? p.images : [p.thumbnail])];

  return {
    row: {
      slug,
      title: p.title,
      brand: p.brand ?? null,
      description: p.description,
      features,
      category_slug: category.slug,
      price_cents: saleCents,
      list_price_cents: discounted ? listCents : null,
      stock: Math.max(0, Math.trunc(p.stock)),
      rating_avg: Math.min(5, Math.max(0, Math.round(p.rating * 10) / 10)),
      // DummyJSON only ships 3 reviews per product. The count is a deterministic
      // demo number derived from the id so cards look realistic ("1,284 ratings").
      rating_count: 40 + ((p.id * 7919) % 2960),
    },
    imageUrls,
    reviews: p.reviews.map((r, i) => ({
      id: stableUuid(`${slug}:review:${i}`),
      author_name: r.reviewerName,
      rating: Math.min(5, Math.max(1, Math.round(r.rating))),
      title: REVIEW_TITLES[Math.min(5, Math.max(1, Math.round(r.rating))) - 1],
      body: r.comment,
      created_at: r.date,
    })),
  };
}

// ---------------------------------------------------------------------------
// I/O helpers
// ---------------------------------------------------------------------------
function chunks<T>(items: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function pool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: Math.min(limit, queue.length) }, async () => {
      for (let item = queue.shift(); item !== undefined; item = queue.shift()) await worker(item);
    }),
  );
}

function fail(message: string): never {
  console.error(`\n✖ ${message}`);
  process.exit(1);
}

function assertServiceRoleKey(key: string) {
  // Legacy keys are JWTs with a role claim: refuse the anon key by mistake.
  if (key.startsWith("eyJ")) {
    const payload = JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString());
    if (payload.role !== "service_role") {
      fail(`SUPABASE_SERVICE_ROLE_KEY has role "${payload.role}", expected "service_role". Did you paste the anon key?`);
    }
  } else if (!key.startsWith("sb_secret_")) {
    fail("SUPABASE_SERVICE_ROLE_KEY doesn't look like a service-role/secret key.");
  }
}

function checkError(context: string, error: { message: string } | null) {
  if (error) fail(`${context}: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const dryRun = process.argv.includes("--dry-run");

console.log("Fetching DummyJSON catalog…");
const res = await fetch(DUMMYJSON_URL);
if (!res.ok) fail(`DummyJSON responded ${res.status}`);
const { products: all } = (await res.json()) as { products: DjProduct[] };

const planned = selectProducts(all).map(({ category, product }) => plan(category, product));
const slugs = new Set(planned.map((p) => p.row.slug));
if (slugs.size !== planned.length) fail("Duplicate slugs in plan");

console.log(`\nPlan: ${planned.length} products, ${planned.reduce((n, p) => n + p.imageUrls.length, 0)} images, ${planned.reduce((n, p) => n + p.reviews.length, 0)} reviews`);
for (const c of CATEGORIES) {
  console.log(`  ${c.slug.padEnd(16)} ${planned.filter((p) => p.row.category_slug === c.slug).length}`);
}

if (dryRun) {
  const sample = planned[0];
  console.log("\nSample product row:\n", sample.row);
  console.log("Sample images:", sample.imageUrls.slice(0, 2));
  console.log("Sample review:", sample.reviews[0]);
  console.log("\nDry run: nothing was written.");
  process.exit(0);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url) fail("NEXT_PUBLIC_SUPABASE_URL is missing from .env.local");
if (!serviceKey) fail("SUPABASE_SERVICE_ROLE_KEY is missing from .env.local (dashboard → Project Settings → API keys).");
assertServiceRoleKey(serviceKey);

const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
console.log(`\nSeeding ${new URL(url).host}`);

// 1. Categories
{
  const { error } = await supabase
    .from("categories")
    .upsert(CATEGORIES.map((c, i) => ({ slug: c.slug, name: c.name, sort_order: i })), { onConflict: "slug" });
  checkError("categories", error);
  console.log(`✓ ${CATEGORIES.length} categories`);
}

// 2. Products. is_active/created_at are left out of the payload so re-runs
//    never undo a manual deactivation. `stock` is only written for NEW products:
//    once orders decrement stock, a re-run must not reset it.
const idBySlug = new Map<string, string>();
const { data: existingRows, error: existingErr } = await supabase
  .from("products")
  .select("slug")
  .in("slug", [...slugs]);
checkError("existing products", existingErr);
const existingSlugs = new Set((existingRows ?? []).map((r) => r.slug));

const upsertProducts = async (rows: Record<string, unknown>[]) => {
  for (const batch of chunks(rows, CHUNK)) {
    const { data, error } = await supabase.from("products").upsert(batch, { onConflict: "slug" }).select("id, slug");
    checkError("products", error);
    for (const r of data ?? []) idBySlug.set(r.slug, r.id);
  }
};
await upsertProducts(planned.filter((p) => !existingSlugs.has(p.row.slug)).map((p) => p.row));
await upsertProducts(
  planned
    .filter((p) => existingSlugs.has(p.row.slug))
    .map((p) => {
      const row: Record<string, unknown> = { ...p.row };
      delete row.stock;
      return row;
    }),
);
console.log(`✓ ${idBySlug.size} products (${planned.length - existingSlugs.size} new, ${existingSlugs.size} updated; stock kept)`);

// 3. Images: copy into Storage (skipping files already there), then link rows.
const imageRows: { product_id: string; path: string; position: number }[] = [];
let uploaded = 0;
let skipped = 0;
const imageFailures: string[] = [];

await pool(planned, IMAGE_CONCURRENCY, async (p) => {
  const productId = idBySlug.get(p.row.slug)!;
  const { data: existing, error } = await supabase.storage.from(BUCKET).list(p.row.slug);
  checkError(`list ${p.row.slug}`, error);
  const have = new Set((existing ?? []).map((f) => f.name));

  for (const [position, src] of p.imageUrls.entries()) {
    const ext = new URL(src).pathname.split(".").pop()?.toLowerCase() || "webp";
    const name = `${position}.${ext}`;
    const path = `${p.row.slug}/${name}`;
    if (!have.has(name)) {
      try {
        const img = await fetch(src);
        if (!img.ok) throw new Error(`HTTP ${img.status}`);
        const contentType = img.headers.get("content-type") ?? `image/${ext === "jpg" ? "jpeg" : ext}`;
        const { error: upErr } = await supabase.storage
          .from(BUCKET)
          .upload(path, await img.arrayBuffer(), { contentType, upsert: true });
        if (upErr) throw new Error(upErr.message);
        uploaded++;
      } catch (e) {
        imageFailures.push(`${path} (${(e as Error).message})`);
        continue;
      }
    } else {
      skipped++;
    }
    imageRows.push({ product_id: productId, path, position });
  }
});

for (const batch of chunks(imageRows, CHUNK)) {
  const { error } = await supabase.from("product_images").upsert(batch, { onConflict: "product_id,position" });
  checkError("product_images", error);
}
console.log(`✓ images: ${uploaded} uploaded, ${skipped} already in Storage, ${imageRows.length} linked`);

// 4. Reviews (deterministic ids => upsert is idempotent)
const reviewRows = planned.flatMap((p) => p.reviews.map((r) => ({ ...r, product_id: idBySlug.get(p.row.slug)! })));
for (const batch of chunks(reviewRows, CHUNK)) {
  const { error } = await supabase.from("reviews").upsert(batch, { onConflict: "id" });
  checkError("reviews", error);
}
console.log(`✓ ${reviewRows.length} reviews`);

if (imageFailures.length) {
  console.error(`\n⚠ ${imageFailures.length} image(s) failed (re-run to retry):\n  ${imageFailures.join("\n  ")}`);
  process.exit(1);
}
console.log("\nDone.");
