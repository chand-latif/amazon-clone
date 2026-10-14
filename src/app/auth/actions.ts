"use server";

import type { AuthError } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { safeNextPath } from "@/lib/redirect";
import { getSiteUrl } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/server";

// What the forms get back. Never contains the password.
export type FormState = {
  error?: string;
  message?: string;
  fieldErrors?: { email?: string; password?: string; fullName?: string };
  values?: { email?: string; fullName?: string };
} | null;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;
const MAX_PASSWORD = 72; // bcrypt silently ignores anything past 72 bytes

function text(formData: FormData, key: string) {
  const v = formData.get(key);
  return typeof v === "string" ? v : "";
}

function readEmail(formData: FormData) {
  return text(formData, "email").trim().toLowerCase();
}

function validEmail(email: string) {
  return email.length <= 254 && EMAIL_RE.test(email);
}

/** User-facing text for Supabase auth errors. Unknown errors are logged, never shown raw. */
function describe(error: AuthError): string {
  switch (error.code) {
    case "invalid_credentials":
      return "Incorrect email or password.";
    case "email_not_confirmed":
      return "Please confirm your email address first. Check your inbox for the confirmation link.";
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return "Too many attempts. Please wait a few minutes and try again.";
    case "email_address_invalid":
      return "That email address doesn't look valid. Please check it and try again.";
    case "email_address_not_authorized":
      return "We can't send email to that address right now.";
    case "weak_password":
      return "That password is too weak. Use at least 8 characters, mixing letters and numbers.";
    case "user_already_exists":
    case "email_exists":
      return "An account with this email already exists. Try signing in instead.";
    case "signup_disabled":
      return "New sign-ups are currently disabled.";
    default:
      console.error("Unhandled auth error:", error.code, error.message);
      return "Something went wrong. Please try again.";
  }
}

const EMAIL_UNAVAILABLE = "Email sign-in is temporarily unavailable. Please try again later.";

/** The link Supabase emails to the user, or null when no trusted site URL is configured (production fails closed). */
async function callbackUrl(next: string): Promise<string | null> {
  try {
    return `${await getSiteUrl()}/auth/callback?next=${encodeURIComponent(next)}`;
  } catch (e) {
    console.error("Cannot build auth callback URL:", e instanceof Error ? e.message : e);
    return null;
  }
}

export async function signInWithPassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = readEmail(formData);
  const password = text(formData, "password");
  const next = safeNextPath(text(formData, "next"));

  const fieldErrors: NonNullable<FormState>["fieldErrors"] = {};
  if (!validEmail(email)) fieldErrors.email = "Enter a valid email address.";
  if (!password) fieldErrors.password = "Enter your password.";
  if (fieldErrors.email || fieldErrors.password) return { fieldErrors, values: { email } };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: describe(error), values: { email } };

  revalidatePath("/", "layout"); // header shows the signed-in state
  redirect(next);
}

export async function signUpWithPassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = readEmail(formData);
  const password = text(formData, "password");
  const fullName = text(formData, "fullName").trim().slice(0, 100);
  const next = safeNextPath(text(formData, "next"));

  const fieldErrors: NonNullable<FormState>["fieldErrors"] = {};
  if (!validEmail(email)) fieldErrors.email = "Enter a valid email address.";
  if (password.length < MIN_PASSWORD) fieldErrors.password = `Use at least ${MIN_PASSWORD} characters.`;
  else if (password.length > MAX_PASSWORD) fieldErrors.password = `Use at most ${MAX_PASSWORD} characters.`;
  if (fieldErrors.email || fieldErrors.password) return { fieldErrors, values: { email, fullName } };

  const redirectTo = await callbackUrl(next);
  if (!redirectTo) return { error: EMAIL_UNAVAILABLE, values: { email, fullName } };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // Becomes profiles.full_name via the signup trigger (trimmed/limited there too).
      data: fullName ? { full_name: fullName } : undefined,
      emailRedirectTo: redirectTo,
    },
  });
  if (error) return { error: describe(error), values: { email, fullName } };

  // Email confirmation off: Supabase signed them in straight away.
  if (data.session) {
    revalidatePath("/", "layout");
    redirect(next);
  }

  // Email confirmation on. The same message appears whether or not the address
  // was already registered, so the form can't be used to probe for accounts.
  return { message: `We sent a confirmation link to ${email}. Open it to finish creating your account.`, values: { email } };
}

export async function sendMagicLink(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = readEmail(formData);
  const next = safeNextPath(text(formData, "next"));

  if (!validEmail(email)) return { fieldErrors: { email: "Enter a valid email address." }, values: { email } };

  const redirectTo = await callbackUrl(next);
  if (!redirectTo) return { error: EMAIL_UNAVAILABLE, values: { email } };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo, shouldCreateUser: true },
  });
  if (error) return { error: describe(error), values: { email } };

  return { message: `We sent a sign-in link to ${email}. It expires soon, so open it on this device or any other.`, values: { email } };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/");
}

export async function updateProfile(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase, user } = await requireUser("/account");
  const fullName = text(formData, "fullName").trim();

  if (fullName.length > 100) return { fieldErrors: { fullName: "Use at most 100 characters." }, values: { fullName } };

  // RLS + the column grant mean this can only ever touch the caller's own full_name.
  const { error } = await supabase
    .from("profiles")
    .update({ full_name: fullName || null })
    .eq("id", user.id);
  if (error) {
    console.error("Profile update failed:", error.message);
    return { error: "Couldn't save your changes. Please try again.", values: { fullName } };
  }

  revalidatePath("/", "layout");
  return { message: "Saved.", values: { fullName } };
}
