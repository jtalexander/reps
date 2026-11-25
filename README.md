# RepWon Install

Turns a coach's playbook PDF into study and quizzes for players. The AI drafts each play; the coach confirms it; players are quizzed only on confirmed plays.

See `CLAUDE.md` for commands and layout, and `docs/DECISIONS.md` for how it works and why.

Quick start (local):

1. `pnpm install`
2. Copy `.env.example` to `.env.local` and fill the secrets
3. `pnpm dev:db` (keep running)
4. `pnpm db:migrate`
5. `pnpm dev`
6. `pnpm db:seed`
