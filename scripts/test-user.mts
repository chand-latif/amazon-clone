/**
 * Dev helper: manage ONE throwaway, pre-confirmed account for testing auth
 * without sending emails (the project's default SMTP only mails org members).
 *
 *   npm run test-user -- create          create/reset the user (confirmed, with a profile via the signup trigger)
 *   npm run test-user -- link [/next]    print a one-time magic-link callback path for that user
 *   npm run test-user -- delete          delete the user (their profile/cart/etc. cascade)
 *
 * Credentials come from .env.local (TEST_USER_EMAIL, TEST_USER_PASSWORD). Uses
 * the SERVICE-ROLE key, so local use only. It refuses any email outside the
 * reserved `@amazonclone.test` domain so it can never touch a real account.
 */
import { createClient } from "@supabase/supabase-js";

const SAFE_DOMAIN = "@amazonclone.test";

function need(name: string) {
  const v = process.env[name];
  if (!v) {
    console.error(`✖ ${name} is missing from .env.local`);
    process.exit(1);
  }
  return v;
}

const url = need("NEXT_PUBLIC_SUPABASE_URL");
const serviceKey = need("SUPABASE_SERVICE_ROLE_KEY");
const email = need("TEST_USER_EMAIL").toLowerCase();
if (!email.endsWith(SAFE_DOMAIN)) {
  console.error(`✖ TEST_USER_EMAIL must end with ${SAFE_DOMAIN} (safety: this script deletes users).`);
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } }).auth.admin;

async function findUserId() {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u) => u.email?.toLowerCase() === email);
    if (hit) return hit.id;
    if (data.users.length < 200) return null;
  }
  return null;
}

const [command, arg] = process.argv.slice(2);
console.log(`Project: ${new URL(url).host}`);

if (command === "create") {
  const password = need("TEST_USER_PASSWORD");
  const existing = await findUserId();
  if (existing) {
    const { error } = await admin.updateUserById(existing, { password, email_confirm: true });
    if (error) throw error;
    console.log("✓ test user already existed; password reset and confirmed");
  } else {
    const { error } = await admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: "Test Shopper" },
    });
    if (error) throw error;
    console.log("✓ test user created (confirmed)");
  }
} else if (command === "link") {
  const next = arg && arg.startsWith("/") ? arg : "/account";
  await findUserId().then(async (id) => {
    if (!id) {
      console.error("✖ test user doesn't exist; run `create` first");
      process.exit(1);
    }
  });
  const { data, error } = await admin.generateLink({ type: "magiclink", email });
  if (error) throw error;
  const hash = data.properties.hashed_token;
  console.log(`/auth/callback?token_hash=${hash}&type=magiclink&next=${encodeURIComponent(next)}`);
} else if (command === "delete") {
  const id = await findUserId();
  if (!id) {
    console.log("✓ nothing to delete (test user doesn't exist)");
  } else {
    const { error } = await admin.deleteUser(id);
    if (error) throw error;
    console.log("✓ test user deleted");
  }
} else {
  console.error("Usage: npm run test-user -- <create|link [/next]|delete>");
  process.exit(1);
}
