"use client";

import Link from "next/link";

// Last-resort boundary for unexpected render errors (expected data failures are
// handled in place with <ErrorState>).
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="rounded bg-surface px-6 py-12 text-center shadow-sm">
      <h1 className="text-xl font-bold">Something went wrong</h1>
      <p className="mt-2 text-sm text-zinc-600">An unexpected error occurred. You can try again or head back home.</p>
      <div className="mt-5 flex justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-navy hover:bg-accent-hover"
        >
          Try again
        </button>
        <Link href="/" className="rounded-full border border-zinc-400 px-5 py-2 text-sm hover:bg-zinc-100">
          Home
        </Link>
      </div>
    </div>
  );
}
