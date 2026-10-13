# Working rules for this repo

## Agent capture (8x requirement)
- `.agent-logs/` is written automatically by `.claude/hooks/capture.mjs` (wired in `.claude/settings.json`).
- NEVER edit, reformat, summarise, or delete anything in `.agent-logs/`. Never add it to `.gitignore`.
- Every commit you make must also stage `.agent-logs/` (`git add .agent-logs`) so logs land interleaved with the code they produced.
- Do not modify `.claude/hooks/capture.mjs` or `.claude/settings.json` unless I explicitly ask.

## How we work
- Plan before code on anything non-trivial: state the approach, the files you will touch, and open questions. Wait for my go-ahead.
- Small vertical slices. Each slice ends with: typecheck/lint passing, a manual check of the feature, then one commit.
- If you find that an earlier decision was wrong, say so plainly before changing direction.
- Never commit secrets. Supabase keys live in `.env.local`; only the anon key is ever used client-side. The service-role key is only for local seed scripts.
- Every table has Row Level Security enabled with explicit policies.
