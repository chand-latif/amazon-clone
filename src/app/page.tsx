import { Price } from "@/components/Price";
import { CATEGORIES } from "@/lib/site";

// Placeholder home page: proves the shell, tokens and price component work.
// Replaced by the real home (hero, category cards, product rows) in the browse slice.
export default function Home() {
  return (
    <div className="space-y-4">
      <section className="rounded bg-surface p-6 shadow-sm">
        <h1 className="text-2xl font-bold">Layout shell is up</h1>
        <p className="mt-2 text-sm text-zinc-600">
          Header, search, category nav and footer are in place. The catalog arrives in the next
          slices.
        </p>
        <p className="mt-4 text-3xl text-price">
          <Price cents={129999} />
        </p>
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {CATEGORIES.map((c) => (
          <div key={c.slug} className="rounded bg-surface p-4 shadow-sm">
            <h2 className="text-base font-bold">{c.name}</h2>
            <p className="mt-1 text-sm text-zinc-500">Coming soon</p>
          </div>
        ))}
      </section>
    </div>
  );
}
