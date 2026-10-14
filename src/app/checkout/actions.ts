"use server";

import { revalidatePath, updateTag } from "next/cache";
import { requireUser } from "@/lib/auth";
import { isCountryCode } from "@/lib/countries";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PHONE_RE = /^[0-9+()\-.\s]{5,30}$/;
const MAX_ADDRESSES = 20;

// ---------------------------------------------------------------------------
// Addresses (plain RLS-protected CRUD on the caller's own rows)
// ---------------------------------------------------------------------------

export type AddressFields = "fullName" | "line1" | "line2" | "city" | "region" | "postalCode" | "country" | "phone";

export type AddressState = {
  error?: string;
  message?: string;
  fieldErrors?: Partial<Record<AddressFields, string>>;
  values?: Partial<Record<AddressFields, string>>;
  /** Set on success so the checkout can select the new address. */
  addressId?: string;
} | null;

function field(formData: FormData, key: AddressFields) {
  const v = formData.get(key);
  return typeof v === "string" ? v.trim() : "";
}

export async function addAddress(_prev: AddressState, formData: FormData): Promise<AddressState> {
  const { supabase, user } = await requireUser("/checkout");

  const values = {
    fullName: field(formData, "fullName"),
    line1: field(formData, "line1"),
    line2: field(formData, "line2"),
    city: field(formData, "city"),
    region: field(formData, "region"),
    postalCode: field(formData, "postalCode"),
    country: field(formData, "country"),
    phone: field(formData, "phone"),
  };

  const fieldErrors: NonNullable<AddressState>["fieldErrors"] = {};
  if (!values.fullName) fieldErrors.fullName = "Enter the recipient's full name.";
  else if (values.fullName.length > 100) fieldErrors.fullName = "Use at most 100 characters.";
  if (!values.line1) fieldErrors.line1 = "Enter a street address.";
  else if (values.line1.length > 200) fieldErrors.line1 = "Use at most 200 characters.";
  if (values.line2.length > 200) fieldErrors.line2 = "Use at most 200 characters.";
  if (!values.city) fieldErrors.city = "Enter a city.";
  else if (values.city.length > 100) fieldErrors.city = "Use at most 100 characters.";
  if (!values.region) fieldErrors.region = "Enter a state, province or region.";
  else if (values.region.length > 100) fieldErrors.region = "Use at most 100 characters.";
  if (!values.postalCode) fieldErrors.postalCode = "Enter a postal code.";
  else if (values.postalCode.length > 20) fieldErrors.postalCode = "Use at most 20 characters.";
  if (!isCountryCode(values.country)) fieldErrors.country = "Choose a country.";
  if (values.phone && !PHONE_RE.test(values.phone)) fieldErrors.phone = "Enter a valid phone number, or leave it blank.";

  if (Object.keys(fieldErrors).length > 0) return { fieldErrors, values };

  const { count, error: countError } = await supabase
    .from("addresses")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);
  if (countError) {
    console.error("Address count failed:", countError.message);
    return { error: "Couldn't save the address. Please try again.", values };
  }
  if ((count ?? 0) >= MAX_ADDRESSES) {
    return { error: `You can save up to ${MAX_ADDRESSES} addresses. Delete one first.`, values };
  }

  const { data, error } = await supabase
    .from("addresses")
    .insert({
      user_id: user.id,
      full_name: values.fullName,
      line1: values.line1,
      line2: values.line2 || null,
      city: values.city,
      region: values.region,
      postal_code: values.postalCode,
      country: values.country,
      phone: values.phone || null,
      is_default: (count ?? 0) === 0, // the first address becomes the default
    })
    .select("id")
    .single();
  if (error) {
    console.error("Address insert failed:", error.message);
    return { error: "Couldn't save the address. Please try again.", values };
  }

  revalidatePath("/checkout");
  return { message: "Address saved.", addressId: data.id };
}

export async function deleteAddress(formData: FormData): Promise<void> {
  const { supabase } = await requireUser("/checkout");
  const id = formData.get("addressId");
  if (typeof id !== "string" || !UUID_RE.test(id)) return;

  // RLS scopes this to the caller's own rows; another user's id simply deletes nothing.
  const { error } = await supabase.from("addresses").delete().eq("id", id);
  if (error) console.error("Address delete failed:", error.message);
  revalidatePath("/checkout");
}

// ---------------------------------------------------------------------------
// Placing the order: a thin wrapper around the place_order database function
// ---------------------------------------------------------------------------

export type OrderProblem = {
  product_id: string;
  title: string;
  reason: "unavailable" | "out_of_stock";
  available?: number;
  requested?: number;
};

export type PlaceOrderResult =
  | { ok: true; orderId: string; orderNumber: number }
  | {
      ok: false;
      code: "cart_empty" | "address_not_found" | "cart_unavailable" | "price_changed" | "order_too_large" | "invalid" | "error";
      message: string;
      problems?: OrderProblem[];
      /** For price_changed: the total the database computed, in cents. */
      actualTotalCents?: number;
    };

function parseDetail<T>(details: string | null | undefined): T | undefined {
  if (!details) return undefined;
  try {
    return JSON.parse(details) as T;
  } catch {
    return undefined;
  }
}

export async function placeOrder(input: {
  addressId: string;
  expectedTotalCents: number;
  idempotencyKey: string;
}): Promise<PlaceOrderResult> {
  const { addressId, expectedTotalCents, idempotencyKey } = input ?? {};
  if (
    typeof addressId !== "string" || !UUID_RE.test(addressId) ||
    typeof idempotencyKey !== "string" || !UUID_RE.test(idempotencyKey) ||
    !Number.isSafeInteger(expectedTotalCents) || expectedTotalCents < 0
  ) {
    return { ok: false, code: "invalid", message: "Something was wrong with that request. Please reload the page and try again." };
  }

  const { supabase } = await requireUser("/checkout");

  // The function reads the caller's cart and live prices itself. All we send is
  // WHICH address, the total the shopper saw, and the retry key.
  const { data, error } = await supabase.rpc("place_order", {
    p_address_id: addressId,
    p_expected_total_cents: expectedTotalCents,
    p_idempotency_key: idempotencyKey,
  });

  if (error) {
    switch (error.message) {
      case "cart_empty":
        return { ok: false, code: "cart_empty", message: "Your cart is empty." };
      case "address_not_found":
        return { ok: false, code: "address_not_found", message: "That address isn't available any more. Please choose another." };
      case "cart_unavailable":
        return {
          ok: false,
          code: "cart_unavailable",
          message: "Some items in your cart changed and can't be ordered as they are.",
          problems: parseDetail<OrderProblem[]>(error.details) ?? [],
        };
      case "price_changed": {
        const detail = parseDetail<{ actual?: number }>(error.details);
        return {
          ok: false,
          code: "price_changed",
          message: "The price or shipping changed while you were checking out.",
          actualTotalCents: typeof detail?.actual === "number" ? detail.actual : undefined,
        };
      }
      case "order_too_large":
        return { ok: false, code: "order_too_large", message: "That order is too large to place online." };
      default:
        console.error("place_order failed:", error.code, error.message);
        return { ok: false, code: "error", message: "We couldn't place your order. You haven't been charged. Please try again." };
    }
  }

  const row = data?.[0];
  if (!row) {
    console.error("place_order returned no row");
    return { ok: false, code: "error", message: "We couldn't confirm your order. Please check Your Orders before trying again." };
  }

  // Stock just changed: expire cached product/search data so the next page view is accurate.
  updateTag("catalog");
  revalidatePath("/orders");
  return { ok: true, orderId: row.placed_order_id, orderNumber: row.placed_order_number };
}
