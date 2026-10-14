import Link from "next/link";
import { SITE_NAME } from "@/lib/site";

const COLUMNS = [
  {
    title: "Shop",
    links: [
      { label: "All products", href: "/s" },
      { label: "Your cart", href: "/cart" },
      { label: "Your orders", href: "/orders" },
    ],
  },
  {
    title: "Your account",
    links: [
      { label: "Sign in", href: "/signin" },
      { label: "Create account", href: "/signup" },
    ],
  },
  {
    title: "About this project",
    links: [{ label: "Home", href: "/" }],
  },
] as const;

export function Footer() {
  return (
    <footer className="mt-10">
      <a
        href="#top"
        className="block bg-navy-2 py-3 text-center text-sm text-white hover:bg-[#2a3d5a]"
      >
        Back to top
      </a>
      <div className="bg-navy text-zinc-300">
        <div className="mx-auto grid max-w-[1000px] grid-cols-2 gap-8 px-4 py-10 sm:grid-cols-3">
          {COLUMNS.map((col) => (
            <div key={col.title}>
              <h2 className="mb-3 text-base font-bold text-white">{col.title}</h2>
              <ul className="space-y-2 text-sm">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <Link href={l.href} className="hover:underline">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="border-t border-white/10 px-4 py-6 text-center text-xs text-zinc-400">
          <p className="text-base font-bold text-white">{SITE_NAME}</p>
          <p className="mt-1">
            Educational project built for an assignment. Not affiliated with or endorsed by any
            retailer. No real payments are processed.
          </p>
        </div>
      </div>
    </footer>
  );
}
