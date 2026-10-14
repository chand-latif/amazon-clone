import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { signOut } from "@/app/auth/actions";
import { ProfileForm } from "@/components/auth/ProfileForm";
import { AuthSkeleton } from "@/components/Skeletons";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Your account", robots: { index: false } };

async function AccountContent() {
  // Real access check (the proxy's redirect is only an optimisation).
  const { supabase, user } = await requireUser("/account");
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, created_at")
    .eq("id", user.id)
    .maybeSingle();

  const memberSince = new Date(profile?.created_at ?? user.created_at).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    timeZone: "UTC",
  });

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 py-4">
      <h1 className="text-2xl font-medium">Your account</h1>

      <section aria-labelledby="profile-heading" className="rounded border border-zinc-300 bg-surface p-6 shadow-sm">
        <h2 id="profile-heading" className="mb-4 text-lg font-bold">
          Profile
        </h2>
        <dl className="mb-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-zinc-600">Email</dt>
          <dd className="break-all">{user.email}</dd>
          <dt className="text-zinc-600">Member since</dt>
          <dd>{memberSince}</dd>
        </dl>
        <ProfileForm fullName={profile?.full_name ?? ""} />
      </section>

      <section aria-label="Shortcuts" className="grid gap-3 sm:grid-cols-2">
        <Link href="/orders" className="rounded border border-zinc-300 bg-surface p-4 shadow-sm hover:bg-zinc-50">
          <span className="block font-bold">Your orders</span>
          <span className="text-sm text-zinc-600">Track, review and reorder past purchases</span>
        </Link>
        <form action={signOut}>
          <button
            type="submit"
            className="h-full w-full rounded border border-zinc-300 bg-surface p-4 text-left shadow-sm hover:bg-zinc-50"
          >
            <span className="block font-bold">Sign out</span>
            <span className="text-sm text-zinc-600">End your session on this device</span>
          </button>
        </form>
      </section>
    </div>
  );
}

export default function AccountPage() {
  return (
    <Suspense fallback={<AuthSkeleton />}>
      <AccountContent />
    </Suspense>
  );
}
