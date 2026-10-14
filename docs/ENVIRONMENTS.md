# Environments and blast radius

## Today: one Supabase project for everything

Development, the test suites and (once deployed) production all point at the same Supabase project.
That is fine for a single-person assignment, but it means:

- `npm run seed` (service-role key) writes to the live catalog.
- `npm run test:race` and `npm run test-user` create real users, orders and temporary products in the live
  database (they clean up after themselves, including on failure, but a crash can leave rows behind).
- `supabase/tests/*.sql` run in a rolled-back transaction, but they still execute against the live schema.
- A migration applied while developing is applied to production immediately.

## Recommended before real users

1. Create a **second Supabase project** (free tier is enough) and use it for local development and tests:
   put its URL, anon key and service-role key in `.env.local`.
2. Keep the production project's keys only in Vercel's environment variables. The service-role key should not
   be set on Vercel at all (only the local seed and test scripts use it).
3. Apply migrations from `supabase/migrations/` to production deliberately (Supabase CLI `db push`, or a
   reviewed paste into the SQL editor), after they have run clean on the dev project.
4. Update `project_ref` in `.mcp.json` to whichever project the agent should be able to change
   (it is the development one).

## The committed `.mcp.json`

It is scoped to this project (`project_ref`) and enables only docs, database, debugging and development tools.
It no longer includes `account` (creating, pausing or restoring projects), `functions` or `branching`.
For an extra guard, add `&read_only=true` to the URL: the agent then cannot write to the database at all
(it also means it cannot apply migrations, so use it when you only want inspection).
