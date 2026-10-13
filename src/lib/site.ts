export const SITE_NAME = "amazon";
export const SITE_TAGLINE = "Educational shopping clone";

// Static for now; replaced by DB-backed categories once the catalog exists.
// Slugs must match the seeded `categories.slug` values.
export const CATEGORIES = [
  { slug: "electronics", name: "Electronics" },
  { slug: "home-kitchen", name: "Home & Kitchen" },
  { slug: "beauty", name: "Beauty" },
  { slug: "fashion", name: "Fashion" },
  { slug: "watches-jewelry", name: "Watches & Jewelry" },
  { slug: "sports-outdoors", name: "Sports & Outdoors" },
] as const;
