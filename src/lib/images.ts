/** Public URL of an object in the `product-images` Storage bucket. */
export function productImageUrl(path: string) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return `${base}/storage/v1/object/public/product-images/${encoded}`;
}
