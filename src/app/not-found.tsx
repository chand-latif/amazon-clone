import Link from "next/link";

export default function NotFound() {
  return (
    <div className="rounded bg-surface p-8 text-center shadow-sm">
      <h1 className="text-2xl font-bold">Page not found</h1>
      <p className="mt-2 text-sm text-zinc-600">
        We couldn&apos;t find what you were looking for.
      </p>
      <Link
        href="/"
        className="mt-4 inline-block rounded-full bg-accent px-5 py-2 text-sm font-medium text-navy hover:bg-accent-hover"
      >
        Back to home
      </Link>
    </div>
  );
}
