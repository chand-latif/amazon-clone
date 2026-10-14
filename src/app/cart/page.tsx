import type { Metadata } from "next";
import { CartView } from "@/components/cart/CartView";

export const metadata: Metadata = { title: "Shopping Cart", robots: { index: false } };

// The cart lives in the browser (guest) or the database (signed in), so the
// page shell is static and CartView fills it in on the client.
export default function CartPage() {
  return <CartView />;
}
