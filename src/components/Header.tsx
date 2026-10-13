import Link from "next/link";
import { CATEGORIES } from "@/lib/site";
import { Logo } from "./Logo";
import { SearchBar } from "./SearchBar";

// Placeholder until the cart exists; the account state arrives with auth.
const CART_COUNT = 0;

export function Header() {
  return (
    <header className="z-40 sm:sticky sm:top-0">
      <div className="bg-navy text-white">
        {/* Mobile: logo + actions on row 1, search on row 2. sm+: one row. */}
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-x-2 gap-y-2 px-3 py-2 sm:flex-nowrap">
          <Logo />

          <div className="order-3 w-full min-w-0 sm:order-2 sm:w-auto sm:flex-1">
            <SearchBar />
          </div>

          <div className="order-2 ml-auto flex items-center gap-1 sm:order-3 sm:ml-0">
          <Link
            href="/signin"
            className="rounded px-2 py-1 text-xs leading-tight hover:outline hover:outline-1 hover:outline-white/60"
          >
            <span className="block text-zinc-300">Hello, sign in</span>
            <span className="block text-sm font-bold">
              <span className="sm:hidden">Account</span>
              <span className="hidden sm:inline">Account &amp; Orders</span>
            </span>
          </Link>

          <Link
            href="/cart"
            aria-label={`Cart, ${CART_COUNT} items`}
            className="flex items-end gap-1 rounded px-2 py-1 hover:outline hover:outline-1 hover:outline-white/60"
          >
            <span className="relative">
              <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                <path d="M3 4h2.2l2.1 10.2a1.5 1.5 0 0 0 1.5 1.2h8.4a1.5 1.5 0 0 0 1.5-1.1L20.5 8H6.2" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="9.5" cy="19.2" r="1.3" />
                <circle cx="17" cy="19.2" r="1.3" />
              </svg>
              <span className="absolute -top-1 left-3 min-w-5 rounded-full bg-accent px-1 text-center text-sm font-bold leading-5 text-navy">
                {CART_COUNT}
              </span>
            </span>
            <span className="text-sm font-bold">Cart</span>
          </Link>
          </div>
        </div>
      </div>

      <nav aria-label="Categories" className="bg-navy-2 text-sm text-white">
        <ul className="mx-auto flex max-w-[1500px] gap-1 overflow-x-auto px-3 py-1.5 whitespace-nowrap">
          <li>
            <Link href="/s?c=all" className="block rounded px-2 py-1 font-semibold hover:outline hover:outline-1 hover:outline-white/60">
              All products
            </Link>
          </li>
          {CATEGORIES.map((c) => (
            <li key={c.slug}>
              <Link href={`/c/${c.slug}`} className="block rounded px-2 py-1 hover:outline hover:outline-1 hover:outline-white/60">
                {c.name}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
