import type { Metadata } from "next";
import { Suspense } from "react";
import { SignInForm } from "@/components/auth/SignInForm";
import { AuthSkeleton } from "@/components/Skeletons";
import { safeNextPath } from "@/lib/redirect";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

async function SignInContent({ searchParams }: { searchParams: PageProps<"/signin">["searchParams"] }) {
  const sp = await searchParams;
  // Validated here, so the form (and everything after it) only ever sees a safe path.
  const next = safeNextPath(first(sp.next));
  const initialError =
    first(sp.error) === "link" ? "That sign-in link is invalid or has expired. Please request a new one." : undefined;
  return <SignInForm next={next} initialError={initialError} />;
}

export default function SignInPage(props: PageProps<"/signin">) {
  return (
    <Suspense fallback={<AuthSkeleton />}>
      <SignInContent searchParams={props.searchParams} />
    </Suspense>
  );
}
