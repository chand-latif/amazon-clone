import Link from "next/link";
import { SITE_NAME } from "@/lib/site";

/** Original text wordmark: name plus an accent bar. No third-party logo assets. */
export function Logo() {
  return (
    <Link
      href="/"
      aria-label={`${SITE_NAME} home`}
      className="flex flex-col items-start rounded px-2 py-1 leading-none hover:outline hover:outline-1 hover:outline-white/60"
    >
      <span className="text-2xl font-bold tracking-tight text-white">{SITE_NAME}</span>
      <span aria-hidden className="mt-1 h-1 w-full rounded-full bg-accent" />
    </Link>
  );
}
