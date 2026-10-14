"use client";

import { useEffect } from "react";
import { configureAuth, startCartListeners } from "@/lib/cart/store";

/**
 * Tells the cart store who the user is. Rendered by the header's server
 * component, which already looked the session up, so this costs no extra
 * request. When the layout revalidates after sign-in or sign-out, `userId`
 * changes and the store switches between the local and database cart.
 *
 *   string    signed in
 *   null      signed out (guest)
 *   undefined the server couldn't tell: do nothing, the store falls back to guest on first use
 */
export function CartSync({ userId }: { userId: string | null | undefined }) {
  useEffect(() => {
    if (userId === undefined) return;
    void configureAuth(userId);
  }, [userId]);

  useEffect(() => startCartListeners(), []);

  return null;
}
