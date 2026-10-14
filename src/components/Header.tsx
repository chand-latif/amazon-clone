import Link from "next/link";
import { Suspense } from "react";
import { CATEGORIES } from "@/lib/site";
import { AccountLink, AccountMenu } from "./AccountMenu";
import { CartLink } from "./cart/CartLink";
import { Logo } from "./Logo";
import { SearchBar } from "./SearchBar";
import { SearchForm } from "./SearchForm";

export function Header() {
  return (
    <header className="z-40 sm:sticky sm:top-0">
      <div className="bg-navy text-white">
        {/* Mobile: logo + actions on row 1, search on row 2. sm+: one row. */}
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-x-2 gap-y-2 px-3 py-2 sm:flex-nowrap">
          <Logo />

          <div className="order-3 w-full min-w-0 sm:order-2 sm:w-auto sm:flex-1">
            {/* SearchBar reads the URL (client); the static form is its fallback. */}
            <Suspense fallback={<SearchForm />}>
              <SearchBar />
            </Suspense>
          </div>

          <div className="order-2 ml-auto flex items-center gap-1 sm:order-3 sm:ml-0">
          {/* Reads the session (dynamic); the signed-out look is the fallback. */}
          <Suspense fallback={<AccountLink name={null} />}>
            <AccountMenu />
          </Suspense>

          <CartLink />
          </div>
        </div>
      </div>

      <nav aria-label="Categories" className="bg-navy-2 text-sm text-white">
        <ul className="mx-auto flex max-w-[1500px] gap-1 overflow-x-auto px-3 py-1.5 whitespace-nowrap">
          <li>
            <Link href="/s" className="block rounded px-2 py-1 font-semibold hover:outline hover:outline-1 hover:outline-white/60">
              All products
            </Link>
          </li>
          {CATEGORIES.map((c) => (
            <li key={c.slug}>
              <Link href={`/s?c=${c.slug}`} className="block rounded px-2 py-1 hover:outline hover:outline-1 hover:outline-white/60">
                {c.name}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
