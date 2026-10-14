# Testing

| Layer | Command / file | Needs | Runs in CI |
|---|---|---|---|
| Pure unit tests (open-redirect validator, cart helpers, order idempotency key, UUID fallback, pricing, site-URL resolver) | `npm test` (`src/**/*.test.ts`, Node's built-in runner) | nothing | yes |
| Lint, types | `npm run lint`, `npm run typecheck` | nothing | yes |
| RLS attack tests (cross-user access, no client writes, anon, address limits) | `supabase/tests/rls.test.sql` | a Supabase project | no |
| `place_order` correctness and attacks | `supabase/tests/place_order.test.sql` | a Supabase project | no |
| Real concurrency (last unit sold once, no deadlocks, double submit) | `npm run test:race` | project + service-role key in `.env.local` | no |

## Running the SQL tests

Paste the file into the Supabase SQL editor (or `psql -f`, or the MCP `execute_sql`). Each file runs in one
transaction and ends with `ROLLBACK`, so nothing is left behind. The last result row is a summary;
any line starting with `FAIL` is a bug.

Point these at a **development** project, not production: they create (and roll back) rows in the real
schema, and `test:race` creates real users and products with the service-role key.

## Why the database tests are not in CI

They need credentials and a live database. Running them in CI would mean storing a service-role key as a CI
secret, which is more risk than this project wants. If you add a dedicated throwaway Supabase project or the
Supabase CLI's local stack (`supabase start`), they can move into CI.
