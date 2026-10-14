/**
 * Concurrency test for place_order, using REAL signed-in sessions firing at the
 * same moment. SQL tests run in one transaction and can't show races.
 *
 *   npm run test:race
 *
 * Proves: the last unit is sold exactly once; opposite-order carts don't
 * deadlock; a double-submit with the same key yields one order; a double-submit
 * with different keys still yields one order; stock never goes negative.
 *
 * Local only: uses the SERVICE-ROLE key to create two throwaway users
 * (race-*@amazonclone.test) and temporary products (slug `zz-race-*`), and
 * deletes all of it afterwards, even on failure.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceKey) {
  console.error("✖ Need NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const opts = { auth: { persistSession: false, autoRefreshToken: false } } as const;
const admin = createClient(url, serviceKey, opts);

type Player = { id: string; email: string; client: SupabaseClient; addressId: string };

const SHIPPING = (subtotal: number) => (subtotal >= 3500 ? 0 : 499);
const withShipping = (subtotal: number) => subtotal + SHIPPING(subtotal);

let failures = 0;
function check(name: string, ok: boolean, extra = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? `  (${extra})` : ""}`);
}

const created = { userIds: [] as string[], productIds: [] as string[] };

async function makePlayer(tag: string): Promise<Player> {
  const email = `race-${tag}@amazonclone.test`;
  const password = randomBytes(18).toString("base64url"); // never printed
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  created.userIds.push(data.user.id);

  const client = createClient(url!, anonKey!, opts);
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;

  const { data: address, error: addrError } = await admin
    .from("addresses")
    .insert({ user_id: data.user.id, full_name: `Racer ${tag}`, line1: "1 Race St", city: "Raceville", region: "RV", postal_code: "00001", country: "US" })
    .select("id")
    .single();
  if (addrError) throw addrError;
  return { id: data.user.id, email, client, addressId: address.id };
}

async function makeProduct(slug: string, priceCents: number, stock: number) {
  const { data, error } = await admin
    .from("products")
    .insert({ slug: `zz-race-${slug}`, title: `Race ${slug}`, category_slug: "electronics", price_cents: priceCents, stock })
    .select("id")
    .single();
  if (error) throw error;
  created.productIds.push(data.id);
  return data.id;
}

async function setCart(user: Player, lines: { productId: string; quantity: number }[]) {
  await admin.from("cart_items").delete().eq("user_id", user.id);
  if (lines.length) {
    const { error } = await admin.from("cart_items").insert(lines.map((l) => ({ user_id: user.id, product_id: l.productId, quantity: l.quantity })));
    if (error) throw error;
  }
}

const stockOf = async (productId: string) => (await admin.from("products").select("stock").eq("id", productId).single()).data!.stock;
const ordersFor = async (userIds: string[]) => (await admin.from("orders").select("id, user_id").in("user_id", userIds)).data ?? [];
const cartCount = async (userId: string) => (await admin.from("cart_items").select("product_id", { count: "exact", head: true }).eq("user_id", userId)).count ?? 0;

function place(user: Player, totalCents: number, key: string | null) {
  return user.client.rpc("place_order", {
    p_address_id: user.addressId,
    p_expected_total_cents: totalCents,
    p_idempotency_key: key as string, // null = no key
  });
}

async function cleanup() {
  if (created.userIds.length) {
    await admin.from("orders").delete().in("user_id", created.userIds); // order_items cascade
    await admin.from("cart_items").delete().in("user_id", created.userIds);
  }
  if (created.productIds.length) await admin.from("products").delete().in("id", created.productIds);
  for (const id of created.userIds) await admin.auth.admin.deleteUser(id); // addresses/profiles cascade
}

async function resetOrders(users: Player[]) {
  await admin.from("orders").delete().in("user_id", users.map((u) => u.id));
}

try {
  console.log(`Project: ${new URL(url).host}\n`);
  const [a, b] = [await makePlayer("a"), await makePlayer("b")];

  // ---------------------------------------------------------------- 1. last unit
  console.log("1) Two buyers race for the LAST unit (8 rounds)");
  const last = await makeProduct("last", 1000, 1);
  let sold = 0, rejected = 0, wrongRejection = 0, oversold = 0, loserCartLost = 0;
  for (let round = 0; round < 8; round++) {
    await admin.from("products").update({ stock: 1 }).eq("id", last);
    await resetOrders([a, b]);
    await setCart(a, [{ productId: last, quantity: 1 }]);
    await setCart(b, [{ productId: last, quantity: 1 }]);

    const [ra, rb] = await Promise.all([place(a, withShipping(1000), randomUUID()), place(b, withShipping(1000), randomUUID())]);
    const results = [
      { who: a, r: ra },
      { who: b, r: rb },
    ];
    const wins = results.filter((x) => !x.r.error);
    const losses = results.filter((x) => x.r.error);
    sold += wins.length;
    rejected += losses.length;
    for (const l of losses) if (l.r.error!.message !== "cart_unavailable") wrongRejection++;
    if ((await stockOf(last)) < 0 || wins.length > 1) oversold++;
    for (const l of losses) if ((await cartCount(l.who.id)) !== 1) loserCartLost++;
  }
  check("exactly one buyer wins each of 8 rounds", sold === 8 && rejected === 8, `${sold} sold, ${rejected} rejected`);
  check("the loser is told cart_unavailable (out of stock)", wrongRejection === 0);
  check("never oversold, stock never negative", oversold === 0);
  check("the loser's cart is left intact", loserCartLost === 0);

  // ---------------------------------------------------------------- 2. deadlocks
  console.log("\n2) Overlapping carts in opposite orders must not deadlock (12 rounds)");
  const x = await makeProduct("x", 1000, 1000);
  const y = await makeProduct("y", 500, 1000);
  let deadlocks = 0, otherErrors = 0, okOrders = 0;
  const startX = await stockOf(x), startY = await stockOf(y);
  await resetOrders([a, b]);
  for (let round = 0; round < 12; round++) {
    await setCart(a, [{ productId: x, quantity: 1 }, { productId: y, quantity: 2 }]); // $20.00
    await setCart(b, [{ productId: y, quantity: 1 }, { productId: x, quantity: 2 }]); // $25.00
    const rs = await Promise.all([place(a, withShipping(2000), randomUUID()), place(b, withShipping(2500), randomUUID())]);
    for (const r of rs) {
      if (!r.error) okOrders++;
      else if (r.error.code === "40P01" || /deadlock/i.test(r.error.message)) deadlocks++;
      else otherErrors++;
    }
  }
  check("no deadlocks", deadlocks === 0, `${deadlocks} deadlocks`);
  check("no other errors; all 24 orders placed", otherErrors === 0 && okOrders === 24, `${okOrders} placed, ${otherErrors} other errors`);
  // each round sells x:(1+2) and y:(2+1)
  check("stock decreased by exactly what was sold", (await stockOf(x)) === startX - 36 && (await stockOf(y)) === startY - 36, `x ${startX}->${await stockOf(x)}, y ${startY}->${await stockOf(y)}`);

  // ---------------------------------------------------------------- 3. same key x5
  console.log("\n3) Double-submit: the SAME key, 5 at once");
  const solo = await makeProduct("solo", 1000, 10);
  await resetOrders([a, b]);
  await setCart(a, [{ productId: solo, quantity: 1 }]);
  const same = randomUUID();
  const fives = await Promise.all(Array.from({ length: 5 }, () => place(a, withShipping(1000), same)));
  const okIds = new Set(fives.filter((r) => !r.error).map((r) => (r.data as { placed_order_id: string }[])[0].placed_order_id));
  check("all 5 calls succeed with the same order id", fives.every((r) => !r.error) && okIds.size === 1, fives.filter((r) => r.error).map((r) => r.error!.message).join(","));
  check("exactly one order exists", (await ordersFor([a.id])).length === 1);
  check("stock decremented once (10 -> 9)", (await stockOf(solo)) === 9);

  // ---------------------------------------------------------------- 4. different keys x3
  console.log("\n4) Double-submit: DIFFERENT keys, 3 at once");
  await resetOrders([a, b]);
  await admin.from("products").update({ stock: 10 }).eq("id", solo);
  await setCart(a, [{ productId: solo, quantity: 1 }]);
  const threes = await Promise.all(Array.from({ length: 3 }, () => place(a, withShipping(1000), randomUUID())));
  const wins = threes.filter((r) => !r.error).length;
  const empties = threes.filter((r) => r.error?.message === "cart_empty").length;
  check("one wins, the others find an empty cart", wins === 1 && empties === 2, `${wins} won, ${empties} cart_empty`);
  check("exactly one order, stock decremented once (10 -> 9)", (await ordersFor([a.id])).length === 1 && (await stockOf(solo)) === 9);
} catch (error) {
  failures++;
  console.error("\n✖ Test crashed:", error);
} finally {
  await cleanup();
  console.log("\n(cleaned up the temporary users, carts, orders and products)");
}

console.log(failures === 0 ? "\nALL PASSED" : `\n${failures} FAILED`);
process.exit(failures ? 1 : 0);
