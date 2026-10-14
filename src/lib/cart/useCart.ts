"use client";

import { useSyncExternalStore } from "react";
import { cartStore } from "./store";
import { countUnits } from "./storage";

/** The whole cart state plus the unit count. Re-renders on any cart change. */
export function useCart() {
  const state = useSyncExternalStore(cartStore.subscribe, cartStore.getSnapshot, cartStore.getServerSnapshot);
  return { ...state, count: countUnits(state.lines) };
}

/**
 * Just the badge number, or null until the cart is known. Returns a primitive, so
 * components using it only re-render when the count itself changes.
 */
export function useCartCount(): number | null {
  const count = useSyncExternalStore(
    cartStore.subscribe,
    () => {
      const s = cartStore.getSnapshot();
      return s.status === "ready" ? countUnits(s.lines) : -1;
    },
    () => -1,
  );
  return count < 0 ? null : count;
}
