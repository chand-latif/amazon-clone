import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const isUuid = (value: string) => UUID_RE.test(value);

export type ShippingAddress = {
  full_name: string;
  line1: string;
  line2: string | null;
  city: string;
  region: string;
  postal_code: string;
  country: string;
  phone: string | null;
};

export type OrderItem = {
  id: string;
  title: string;
  quantity: number;
  unitPriceCents: number;
  imagePath: string | null;
  /** Present only while the product still exists and is active, so we can link to it. */
  productSlug: string | null;
};

export type Order = {
  id: string;
  orderNumber: number;
  createdAt: string;
  status: string;
  subtotalCents: number;
  shippingCents: number;
  taxCents: number;
  totalCents: number;
  paymentMethod: string;
  address: ShippingAddress;
  items: OrderItem[];
};

type Row = {
  id: string;
  order_number: number;
  created_at: string;
  status: string;
  subtotal_cents: number;
  shipping_cents: number;
  tax_cents: number;
  total_cents: number;
  payment_method: string;
  shipping_address: unknown;
  order_items: {
    id: string;
    title_snapshot: string;
    image_path_snapshot: string | null;
    unit_price_cents: number;
    quantity: number;
    products: { slug: string } | { slug: string }[] | null;
  }[];
};

export const ORDER_SELECT =
  "id, order_number, created_at, status, subtotal_cents, shipping_cents, tax_cents, total_cents, payment_method, shipping_address, order_items(id, title_snapshot, image_path_snapshot, unit_price_cents, quantity, products(slug))";

// The address is a JSON snapshot we wrote ourselves, but read it defensively anyway.
function toAddress(value: unknown): ShippingAddress {
  const v = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const str = (k: string) => (typeof v[k] === "string" ? (v[k] as string) : "");
  return {
    full_name: str("full_name"),
    line1: str("line1"),
    line2: typeof v.line2 === "string" && v.line2 ? v.line2 : null,
    city: str("city"),
    region: str("region"),
    postal_code: str("postal_code"),
    country: str("country"),
    phone: typeof v.phone === "string" && v.phone ? v.phone : null,
  };
}

export function toOrder(row: unknown): Order {
  const r = row as Row;
  return {
    id: r.id,
    orderNumber: r.order_number,
    createdAt: r.created_at,
    status: r.status,
    subtotalCents: r.subtotal_cents,
    shippingCents: r.shipping_cents,
    taxCents: r.tax_cents,
    totalCents: r.total_cents,
    paymentMethod: r.payment_method,
    address: toAddress(r.shipping_address),
    items: [...r.order_items]
      .sort((a, b) => a.title_snapshot.localeCompare(b.title_snapshot) || a.id.localeCompare(b.id))
      .map((i) => {
        const product = Array.isArray(i.products) ? i.products[0] : i.products;
        return {
          id: i.id,
          title: i.title_snapshot,
          quantity: i.quantity,
          unitPriceCents: i.unit_price_cents,
          imagePath: i.image_path_snapshot,
          productSlug: product?.slug ?? null,
        };
      }),
  };
}

/**
 * One order by id, or null if it doesn't exist or isn't the signed-in user's
 * (RLS makes those indistinguishable, which is the point: no probing for ids).
 * Wrapped in cache() so generateMetadata and the page share one query per request.
 */
export const getOrder = cache(async (id: string): Promise<Order | null> => {
  if (!isUuid(id)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.from("orders").select(ORDER_SELECT).eq("id", id).maybeSingle();
  if (error) throw new Error(`order: ${error.message}`);
  return data ? toOrder(data) : null;
});

export const ORDERS_PER_PAGE = 10;

export async function getOrders(page: number): Promise<{ orders: Order[]; total: number }> {
  const supabase = await createClient();
  const from = (page - 1) * ORDERS_PER_PAGE;
  const { data, error, count } = await supabase
    .from("orders")
    .select(ORDER_SELECT, { count: "exact" })
    .order("created_at", { ascending: false })
    .order("id")
    .range(from, from + ORDERS_PER_PAGE - 1);

  if (error) {
    // Past the last page: report the real total so the UI can offer a way back.
    if (error.code === "PGRST103") {
      const head = await supabase.from("orders").select("id", { count: "exact", head: true });
      return { orders: [], total: head.count ?? 0 };
    }
    throw new Error(`orders: ${error.message}`);
  }
  return { orders: data.map(toOrder), total: count ?? 0 };
}
