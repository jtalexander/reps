@AGENTS.md

# Reps

Football playbook study and quiz app (working name; change in `src/app/layout.tsx` metadata and `src/lib/auth.ts` appName). A coach uploads a playbook PDF; the app splits it into plays, Claude drafts each play as structured data, the coach confirms it, and players are quizzed only on confirmed plays. Separate from Chalk on purpose (Jeremy, 2026-11-17).

Read `docs/DECISIONS.md` before changing the play schema, the approval gate or the quiz rules.

## Stack

Next.js 16.4 App Router · TypeScript · Tailwind v4 · Drizzle + `pg` (embedded-postgres locally, Neon in prod) · Better Auth (coach email + password) · Anthropic SDK (vision extraction, `ANTHROPIC_MODEL`, default `claude-opus-5-5`) · pdfjs-dist + @napi-rs/canvas (render/crop) · Vitest · pnpm 11 · Netlify.

## Commands

```bash
pnpm dev:db        # local Postgres on :54348 (keep running)
pnpm db:migrate    # apply drizzle/ migrations
pnpm dev           # :3500
pnpm db:seed       # needs pnpm dev running: coach@example.com (password in .env.local), team "Demo Hawks", join code DEMO42, 4 approved plays
pnpm test          # unit + integration (throwaway Postgres on :54349)
pnpm typecheck && pnpm lint && pnpm build
NODE_OPTIONS=--conditions=react-server pnpm tsx scripts/dev-upload.ts DEMO42 file.pdf 6   # load a PDF as if uploaded
pnpm tsx scripts/render-pages.ts file.pdf outDir 1-5      # print detected boxes per page
pnpm tsx scripts/check-calibration.ts file.pdf 6 outDir   # crop + yard calibration check
```

## Layout

- `src/domain/` — pure, no I/O, fully unit-tested:
  - `play.ts` the play schema (zod) — the backbone. `"unknown"` = not read yet; `null` = not applicable. Geometry in yards from the ball (x right, y downfield).
  - `routes.ts` route tree (shapes by name + depth, outside-positive frame), `concepts.ts` concept library + `applyConcept` (fills only unknown fields; tracks `suggested` and `from_concept`), `defense.ts` generated fronts/coverages/read-key roles, `readiness.ts` the approval gate + QB-ready + level rules, `quiz.ts` question generators, `srs.ts` Leitner scheduling + quiz builder, `terms.ts` coach terminology, `extraction.ts` the model's output schema + pixel→PlayData conversion.
- `src/ingest/` — `pdf.ts` (render, text layer), `boxes.ts` (play box detection: bordered frames first, XY-cut fallback, grid presets), `calibrate.ts` (LOS + yard scale from the crop), `extract.ts` (Claude call, retries, refusal handling).
- `src/server/` — services, all team-scoped by `teamId` arguments: `teams.ts` (auth guards `requireCoach`), `player-session.ts` (signed join cookie), `ingest.ts` (upload → render → crop → extract), `plays.ts` (save/approve/concept propagation), `quiz.ts` (sessions, server-side grading, diagram sanitizing), `results.ts`.
- `src/app/t/[teamId]/` coach pages + `actions.ts` (every action calls `requireCoach` first). `src/app/join`, `src/app/study` player pages. `src/components/play-svg.tsx` the one renderer.
- `tests/unit/domain.test.ts`, `tests/integration/flow.test.ts` (real PDFs from `../chalk/reference/`, canned model answers, tenancy, quiz flow), `tests/fixtures/sample-plays.ts` (also used by the seed).

## Rules that are easy to break

- Players are only ever quizzed on `status = 'approved'` plays. Approval requires `readiness(...).complete`.
- Quiz answers and explanations never reach the client before the player answers; diagrams sent to players go through `diagramData()` (strips names, reads, and the hidden player's route).
- Every query on team data filters by `team_id`. Never look up a play/upload/session by id alone.
- A coach edit to a field removes it from `suggested`, `from_concept` and `field_confidence` — concept edits must not overwrite what a coach typed.
- Player data is first name + last initial, jersey, positions. Nothing else.

## Gotchas

- Scripts importing `src/server/*` need `NODE_OPTIONS=--conditions=react-server` (the `server-only` package).
- Long bash heredocs mangle backslashes; write files with the Write tool.
- Test Postgres runs with `io_method=sync`: PG18 io workers outlive the postmaster on Windows and hold the port.
- Hudl prints draw the field border in light gray; ink threshold for box detection is 235, not 200.
- Text layers include yard numbers ("30", "20"); `textIn` drops them.
