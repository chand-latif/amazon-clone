import type { Metadata } from "next";
import { Suspense } from "react";
import { SignUpForm } from "@/components/auth/SignUpForm";
import { AuthSkeleton } from "@/components/Skeletons";
import { safeNextPath } from "@/lib/redirect";

export const metadata: Metadata = { title: "Create account", robots: { index: false } };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

async function SignUpContent({ searchParams }: { searchParams: PageProps<"/signup">["searchParams"] }) {
  const sp = await searchParams;
  return <SignUpForm next={safeNextPath(first(sp.next))} />;
}

export default function SignUpPage(props: PageProps<"/signup">) {
  return (
    <Suspense fallback={<AuthSkeleton />}>
      <SignUpContent searchParams={props.searchParams} />
    </Suspense>
  );
}
