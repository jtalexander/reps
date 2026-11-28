# RepWon Breakdown: audit and plan

Written 2026-11-28 from Jeremy's "RepWon Breakdown: project brief". This is the audit and the proposals the brief asks for. Nothing else in the repo was changed: no code moved, no migrations written or run. Nothing here is decided until Jeremy approves it.

How this was produced: by reading the code at commit `640ecfd`. The test suite was not run, and no film or Hudl export was available, so everything about film is reasoning, not measurement.

## Summary

1. **Coordinates: Install already stores plays field-relative, in yards from the ball**, x toward the offense's right, y downfield. It matches the brief's proposed standard. No unit conversion is needed.
2. **The units are right but the depths are not all measured.** Positions drawn in the play builder are what the coach placed. Positions read from a playbook PDF are either scaled from the drawing (sometimes from a guessed scale) or placed "by football norms" by the model. Many routes have no depth. Phase 3 grading will need a coach to confirm depths on the plays it grades. Details in section 2.
3. **Hash, yard line and field dimensions are stored nowhere today.** I propose they go on the film snap and the team, not on the playbook play (section 2.4). This differs slightly from the brief.
4. **The repo is one Next.js app with no product boundary yet**, and its internal layers import each other in both directions. I propose adding Breakdown beside it behind a small shared layer first, and moving Install's files later as a separate, mechanical step (section 3).
5. **A tagged snap and a playbook play should be linked records, not the same record** (section 4).
6. **One decision changes the shape of everything: where the football rules run.** I recommend the vision engine outputs player positions in field yards and the rules run in the web app's own code, not on the GPU (section 3.3, decision D1).
7. **Netlify cannot receive or store game film.** Breakdown needs private object storage with direct, resumable browser uploads (section 6).
8. First milestone stays the one-game test, with the hand-marked drive in front of it as a no-GPU step that should take days (section 5).

Decisions needed from Jeremy are collected in section 8.

---

## 1. How the repo is organized today

### 1.1 Stack and hosting

| Piece | What it is |
| --- | --- |
| Web app | Next.js 16.4 App Router, React 19, TypeScript, Tailwind v4. One app, one deploy. |
| Hosting | Netlify (`netlify.toml`). Production deploys run `pnpm db:migrate` before the build. |
| Database | Postgres through Drizzle and `pg`. Embedded Postgres locally, Neon in production (per `CLAUDE.md`). 26 migrations in `drizzle/`. |
| Files | `src/media/store.ts`: Netlify Blobs in production, a local `.media/` folder in development. Keys start with the team id. Served through `src/app/media/[...key]/route.ts`. |
| Auth | Better Auth, coach email and password. Players join with a team code and a signed cookie; they have no account. |
| AI | Anthropic SDK. Vision reads of playbook pages, structured output through zod. Every call is logged to `ai_usage` with token counts and priced in `src/teach/usage.ts`; each team has a monthly dollar cap and an admin-controlled on/off switch. |
| Background work | A `jobs` table plus one Netlify background function (15-minute limit) that runs a job or works a queue and hands off to a fresh worker. Whole-playbook reads go through the Message Batches API (`read_batches`), checked by a scheduled function every 10 minutes. |
| Tests | Vitest: 15 unit files, 12 integration files against a throwaway Postgres. |

The repo is 11 days old (first commit 2026-11-17, 33 commits). `CLAUDE.md`'s layout section and the "Not built yet" list in `docs/DECISIONS.md` are both behind the code: neither mentions `src/teach`, `src/library` or `src/media`, and the play builder that DECISIONS lists as not built exists.

### 1.2 Directories

| Directory | Contents |
| --- | --- |
| `src/domain/` | Pure football logic, no I/O: the play schema (`play.ts`), routes, concepts, formations, defense looks, blocking rules, readiness gate, quiz generators, spaced repetition, terminology (`terms.ts`), naming rules (`naming.ts`), wristbands, hand-drawing recognition (`sketch.ts`, `draw-grade.ts`). Imports nothing outside itself. |
| `src/ingest/` | The first playbook reader: PDF rendering, play-box detection, pixel-to-yard calibration, one Claude call per play box. |
| `src/teach/` | The second, larger reader (24 files): decodes whole pages into topics, interviews the coach about gaps, writes lessons and questions, converts drawings into plays, runs jobs and batches, tracks AI spend, shared learning across teams. |
| `src/library/` | "Football basics": built-in lessons and diagrams written in code, copied into a team on request. |
| `src/server/` | Services, each taking a `teamId`: teams and auth guards, plays, quiz, results, formations, game plans, wristbands, blocking. |
| `src/db/` | `schema.ts` (core tables) and `teach-schema.ts` (Teach tables). |
| `src/app/` | Routes. `t/[teamId]/…` coach pages, `study/…` and `join/…` player pages, `admin`. |
| `src/components/` | `play-svg.tsx` is the one play renderer and also the play builder's drawing surface. |
| `netlify/functions/` | The background worker and the batch checker. |

Import directions today (counts of `from "@/x"` lines):

- `domain` → nothing. Clean.
- `db` → `domain`, `ingest`, `library`, `teach` (for JSON column types).
- `ingest` → `domain`, `teach`.
- `server` → `db`, `domain`, `ingest`, `teach`, `media`.
- `teach` → `db`, `domain`, `library`, `media`, `server`.
- `library` → `db`, `domain`, `server`, `teach`.
- `components` → `domain`, `library`, `teach`, `app`.

So `teach`, `server` and `library` depend on each other in a loop, and the database schema depends on feature code. That is fine for one product; it matters once a second product must not reach into the first.

### 1.3 Data model

Every team-owned table has a non-null `team_id`. Migration `0014_team_guard.sql` adds a second layer in Postgres itself: composite foreign keys so a row can only point at a parent row of the same team. Breakdown tables should follow both rules.

| Area | Tables |
| --- | --- |
| Coaches | `users`, `sessions`, `auth_accounts`, `verifications`, `admins` |
| Teams and roster | `teams`, `team_coaches`, `players` (first name + last initial, jersey, positions, active) |
| Playbook files | `uploads`, `upload_pages` |
| Plays | `plays`, `team_concepts` |
| Coach tools | `study_sets`, `game_plans` (opponent is a text field), plus JSON on `teams`: `terms`, `naming`, `route_tree`, `blocking`, `formations`, `wristband`, `playbook_views` |
| Old quiz | `quiz_sessions`, `answers`, `srs_items` |
| Teach | `teach_pages`, `topics`, `gaps`, `lessons`, `questions`, `attempts`, `question_srs`, `lesson_progress`, `question_flags`, `ask_log` |
| Jobs and spend | `jobs`, `read_batches`, `ai_usage` |

Things the brief assumes that are not there yet:

- **No program level.** `docs/TODO.md` records the agreed plan (a program with Varsity, JV and Freshman teams under it, one roster, one playbook) but none of it is built. Films belong to a level, so Breakdown and this plan touch the same tables.
- **No games or opponents.** `game_plans.opponent` is free text. TODO plans a program schedule; Breakdown needs the same thing (a film belongs to a game against an opponent).
- **No depth chart, no substitutions.** Only roster rows. Needed for phase 3 only.

### 1.4 How plays are stored

One row per play in `plays`. The play itself is one JSON document in `plays.data`, validated by `PlayDataSchema` in `src/domain/play.ts` every time it is written. A few values are copied into columns for lists and filters: `name`, `play_type`, `concept_key`, `side` (offense or defense), `status`, `qb_ready`.

The document holds: name, play type (`run`, `pass`, `play_action`, `rpo`, `screen`, `option`, `special`), concept key, formation (`name`, `personnel`, `strength`, `backfield_alignment`), one motion, the players, run/option/pass details, coaching points, a blocking scheme, and three bookkeeping lists (`field_confidence`, `suggested`, `from_concept`). `"unknown"` means not read yet; `null` means not applicable.

Each player has an `id` (the letter on the diagram), `x`, `y`, `on_ball`, `side`, an assignment type, and up to one of: a `route` (name, depth, break direction, optionally a drawn path and dotted option branches), a `block` (type, target, path), or a bare `path` (carry, fake, lead).

Plays reach the table three ways, recorded in `plays.ai_raw`:

1. **Old play reader** (`src/ingest`, `src/domain/extraction.ts`): Claude locates players and lines in pixels on a crop; `calibrate.ts` converts to yards.
2. **Teach drawing conversion** (`src/teach/convert.ts`): Claude reads a drawing and places players directly in yards.
3. **Play builder** (`plays/build/play-builder.tsx`): the coach drags players and draws lines.

### 1.5 How the play drawer saves positions

The drawing surface is `PlaySvg` (`src/components/play-svg.tsx`). Its SVG `viewBox` is defined in yards: x from -27 to +27 around the ball, y from -12 to +22, screen y = 22 − field y. Pointer events are converted with the SVG's own screen matrix (`getScreenCTM().inverse()`), so the browser does the pixel-to-yard conversion and the code never sees pixels.

- Dragging a player calls `onPlayerDrag(id, x, y)` with yards snapped to the half yard (`play-svg.tsx:184-191`).
- A hand-drawn line is collected in yards, simplified, rounded to a tenth of a yard, and stored relative to the player it starts from (`play-builder.tsx:334`).
- Save sends the whole `PlayData` to `saveBuiltPlayAction` → `savePlayData` (`src/server/plays.ts`), which re-validates it and writes `plays.data`.

Saved team formations (`teams.formations`) are the same player objects without jobs, in the same yards.

---

## 2. The coordinate question

### 2.1 Answer

**Field-relative.** Jeremy's belief is correct, and in fact the stored play has been in yards since the first commit; `docs/DECISIONS.md` records it ("Players carry `x, y` in yards from the ball"). Pixels exist only in transit, while a playbook crop is being read, and are converted before anything is saved.

The convention, from the header of `src/domain/play.ts`:

- Origin at the ball. The line of scrimmage is y = 0.
- x in yards, positive to the offense's right.
- y in yards, positive downfield, negative in the backfield.
- A defensive call uses the same frame: defenders have y > 0.

This is the brief's proposed standard exactly. I recommend adopting it as written and not changing Install's data.

Three display-only things that look like other units but are not:

- `field-diagram.tsx` (library lessons) squeezes x beyond 7 yards so wideouts fit on a phone. It changes the picture, not the data.
- `PlaySvg`'s `fit` and `compact` options change the view box only.
- Quizzes mirror plays with `flipPlay`, in memory, per question.

### 2.2 What needs care: paths are relative

A player's `x, y` are absolute (from the ball). His route, block and run paths are stored **relative to him**, or relative to where his motion ends. A motion's `end` is absolute but its `path` is relative. Standard routes store no path at all: only a name and a depth, and `routePath()` in `routes.ts` generates the line from the team's route tree in an "outside is positive" frame.

Comparing a tracked path to a drawn assignment therefore needs one function that turns a play into absolute paths for every player. The logic exists inside the renderer (`extent()` in `play-svg.tsx`) but not as a reusable function. Proposal: add `assignmentPaths(play)` to the shared field module, used by the renderer and later by grading, so there is one definition.

### 2.3 What needs care: yards are not always measured yards

The brief asks whether existing drawings recorded real depths. The honest answer is: it depends on how the play got in, and the play does not record which.

| Source | Where positions come from | Real depths? |
| --- | --- | --- |
| Play builder | Coach places players on a canvas scaled in yards, half-yard snap | As real as the coach drew them. Coaches often draw splits tighter than they play them. |
| Old play reader | Pixel positions scaled by `calibrate.ts`: from the diagram's 5-yard lines when found; otherwise from offensive-line spacing assumed to be 1.3 yards; otherwise by assuming the crop is 40 yards wide | Measured only in the first case. The third is a guess. Which case applied is not saved. Players are also clamped to y ≤ 0.5. |
| Teach conversion | The model "places players by football norms" straight into yards (`convert.ts:203`) | Conventional, not measured. Alignments are plausible, not surveyed. |
| Route depths | `route.depth_yards`. Teach conversion writes `null`; the old reader writes the model's estimate or unknown | Often missing. The drawn line then comes from the route tree's default depth. |

What this means:

- For phase 1 it does not matter. Film tagging does not read Install's geometry, except to match a pre-snap alignment against the team's saved formations, which tolerates a yard or two.
- For phase 3 it matters. "Ran the right route to the right depth" needs a depth the coach has confirmed. Proposal for later, not now: a per-play "depths confirmed" mark that grading requires, in the same spirit as the approval gate. Plays without it can still be graded on alignment side, route shape and direction.
- Cheap thing worth doing when Install is next touched: save which calibration case was used on new reads, so guessed scales can be told apart.

### 2.4 What is missing: hash, yard line, field dimensions

None of these is stored anywhere. The renderer has a fixed half-width of 27 yards and no hash marks.

The brief says the hash and field dimensions are "stored with the play". I recommend a small change to that:

- **A playbook play has no hash.** The coach draws it once and runs it from either hash. Putting a hash on the Install play would be a made-up value. The play stays ball-relative, as now.
- **The film snap carries the spot:** yard line, hash (left, middle, right, plus the measured lateral position of the ball), and which way the offense is going.
- **The field carries the dimensions**, as data on the team (and optionally overridden per film for away games on odd fields).

If a coach wants hash-specific versions of a play (boundary and field calls), that can be added to Install later as an optional tag without changing the frame.

### 2.5 Proposed field standard

Two frames and a spec, defined once in a shared module with no dependencies.

**Play frame** (exists today; used by Install plays, formations, and Breakdown's per-snap positions and tracks): origin at the ball on the line of scrimmage, x toward the offense's right, y downfield, yards.

**Field frame** (new; used only for where a snap happened): `along` = yards from the goal line the offense is defending (0 to 100), `across` = yards from the offense's left sideline. The snap stores the ball's spot in this frame, so play-frame positions can always be placed on the real field: hash, numbers and sideline distances are derived, not stored per player.

**Field spec** (new; data, not constants):

```
FieldSpec {
  rules: "nfhs" | "ncaa" | "other"   // which book the field is lined to
  players: 11 | 9 | 8 | 6
  width_yd, length_yd, endzone_yd
  hash_from_sideline_yd
  source: "preset" | "coach" | "measured"
}
```

The brief says to confirm dimensions from the governing rules instead of assuming them. What I can say, and how sure:

- NFHS 11-player: field 160 feet wide (53⅓ yards), hash marks 53 feet 4 inches from each sideline, dividing the field in thirds. A state association page quoting the rule book and an NFHS study guide both give 53'4". I could not open the 2026 NFHS rule book itself, so the preset should be checked against it before it ships.
- College hash marks are 60 feet from each sideline (40 feet apart). This matters for high school: some states do not play NFHS rules (Texas plays NCAA rules), and some high schools play on college-lined fields.
- 6-, 8- and 9-player fields are narrower and state rules differ (one Minnesota 9-player modification lists 48'4"). Youth leagues vary further.

So: presets for the common cases, the coach confirms which one applies, and the film pipeline measures hash spacing from the video as a cross-check and flags a mismatch. This is the same "Reps fills it in, the coach taps Looks right" pattern TODO already uses for state quarter rules.

---

## 3. Proposed module structure

### 3.1 Target layout

One web app and one database, with three product directories and a common layer. The vision engine is a separate service in its own language with its own dependencies.

```
src/
  shared/              the common layer; imports no product
    field/             coordinate standard, FieldSpec, frame conversions, assignmentPaths   (new)
    football/          play schema, play types, routes, concepts, formations,
                       positions, terminology, naming rules                                  (from src/domain)
    teams/             teams, coaches, auth guards, player session, roster                   (from src/server)
    games/             opponents, games (the program schedule in TODO)                       (new)
    db/                connection; schema split into shared / install / breakdown files
    media/             file storage interface                                                (from src/media)
    ai/                Claude client, usage logging, budgets                                 (from src/teach/ai.ts, usage.ts)
    jobs/              job table and dispatch                                                (from src/teach/dispatch.ts)
  install/             everything Install owns: quiz, readiness, srs, teach, library,
                       playbook ingest, blocking, wristband, game plans
  breakdown/           films, snaps, tags, rules, review queue, corrections, evaluation,
                       and the client for the vision engine
  prospect/            a README. Nothing else.
  app/                 routes only; each route calls one product
services/
  vision-engine/       Python. Detection, tracking, team split, registration, snap detection.
                       Own lockfile, own LICENSES.md, deployed to on-demand GPU.
```

Rules, enforced by an ESLint import rule so they cannot erode:

- `shared` imports nothing from `install`, `breakdown` or `prospect`.
- A product imports from `shared` and from itself. Never from another product.
- `app` routes import from one product plus `shared`.
- The vision engine shares no code with the web app. They meet only at the contract in 3.3.

Coach routes for Breakdown would live at `/t/[teamId]/film/…`, beside the existing pages and behind the same `requireCoach` guard.

### 3.2 Proposed moves, and the order

The brief says not to restructure Install without showing the moves first. These are the moves; none has been made.

**Step A (with the first Breakdown code, no files moved).** Create `src/shared/` as thin re-export files pointing at today's locations (`shared/football/play.ts` re-exports `@/domain/play`, and so on). Create `src/breakdown/` importing only from `shared`. Add the import rule for `breakdown` only. Install is untouched, its tests keep passing unchanged, and the boundary is real from Breakdown's first line.

**Step B (later, one mechanical change, its own review).** Move files to match 3.1 and delete the re-exports:

| From | To |
| --- | --- |
| `src/domain/play.ts`, `routes.ts`, `route-tree.ts`, `concepts.ts`, `formations.ts`, `positions.ts`, `terms.ts`, `naming.ts`, and the shape and personnel functions from `blocking.ts` and `facets.ts` | `src/shared/football/` |
| `src/domain/` everything else (quiz, srs, readiness, blocking, wristband, calling, matchups, sketch, draw-grade, concept-draw, motion-draw, defense, defense-play, extraction, fronts, limits) | `src/install/domain/` |
| `src/server/teams.ts`, `coaches.ts`, `player-session.ts`, `player-data.ts` | `src/shared/teams/` |
| `src/server/` everything else | `src/install/server/` |
| `src/teach/`, `src/library/`, `src/ingest/` | `src/install/teach/`, `src/install/library/`, `src/install/ingest/` |
| `src/teach/ai.ts` (client part), `usage.ts`, `dispatch.ts` | `src/shared/ai/`, `src/shared/jobs/` |
| `src/media/`, `src/db/` | `src/shared/media/`, `src/shared/db/` |
| `src/components/play-svg.tsx` | stays shared: both products draw plays |

Step B also has to untangle two real knots, not just rename paths: `db/schema.ts` imports types from feature code (those types move to `shared` or the columns are typed in the product), and `teach`, `server` and `library` import each other.

I recommend A now and B after the one-game test says Breakdown is worth building. If the test fails, Install was never disturbed.

Renaming Reps to Install in the product (page titles, `appName`, the `reps-media` store) is a separate small change and is not part of this.

### 3.3 The vision engine contract (decision D1)

The brief's contract is "film goes in, tagged plays with confidence scores come out". I recommend moving the line one step earlier:

> **Film goes in. Snaps come out, each with every player's position in play-frame yards over time, a team label per player, the snap's spot on the field, and a confidence for each of those.**

The football rules (formation, strength, backfield, run/pass/play action, result) then run in `src/breakdown/rules/` as plain TypeScript on those positions. Reasons:

- **The cheapest test in the brief is exactly this layer.** The hand-marked drive runs the formation rules with no engine. If the rules are web-app code, the test exercises production code, not a prototype to be rewritten.
- **Rules need the team's data.** Matching an alignment to the team's formation names uses `teams.formations` and the naming rules, which live in the app's database. Install already has the pieces: `lineupCost()` in `name-drawing.ts` scores how close two alignments are, and `personnelOf()` in `facets.ts` counts backs and tight ends.
- **Reprocessing becomes free for rule changes.** Improving a rule or a team's terminology re-tags a whole library with no GPU. GPU reprocessing is needed only when detection, tracking or registration improves.
- **The black box gets blacker.** The engine knows nothing about football concepts, teams or terminology. It can be replaced or fail without touching either product.
- **Corrections sort themselves.** A coach's fix to a formation is training data for rules; a fix to a player's position is training data for the engine.

The cost is that the engine's output is larger than a list of tags. It is still small: 22 players × about 12 frames a second × about 8 seconds × about 150 snaps is roughly 300,000 points a game, a few megabytes compressed. Pre-snap positions go in the database per snap; full tracks go in one file per film in private storage.

Contract sketch:

```
Request  { job_id, film: signed read URL, field_spec, perspective_hint, tier: "fast" | "batch",
           engine_version, result: signed write URL, callback: signed URL }
Result   { engine_version, film: { duration_s, fps_sampled },
           snaps: [{ index, t_start, t_snap, t_end,
                     spot: { along, across, offense_direction, confidence },
                     registration_confidence,
                     players: [{ track_id, team: "offense" | "defense" | "unknown", team_confidence,
                                 presnap: [x, y], confidence }],
                     tracks_ref }],
           cost: { gpu_type, gpu_seconds } }
```

Perspective (sideline or drone) appears only as a hint on the request. Nothing in the result depends on it, which is the brief's rule that the two cameras differ only inside registration.

If Jeremy prefers the brief's original line (rules inside the engine), the schema in section 4 does not change; only where the rules code lives does.

---

## 4. Proposed shared schema

Table and column proposals only. No migration has been written.

### 4.1 What Install and Breakdown both use

| Shared thing | Today | Proposal |
| --- | --- | --- |
| Teams, coaches, roster | `teams`, `team_coaches`, `players` | Unchanged. Program level arrives per TODO; Breakdown keys on `team_id` and inherits it. |
| Play record | `plays` + `PlayDataSchema` | Unchanged. This is the playbook definition. |
| Play types | `PLAY_TYPES` in `play.ts` | Unchanged; already the brief's list plus `option` and `special`. Breakdown uses the same enum. |
| Concept list | 20 concepts in code (`CONCEPT_LIBRARY`), string keys such as `smash`; per-team edits in `team_concepts` | Unchanged. `concept_key` is the shared concept ID. The list is small and pass-heavy; film will need more run concepts. Adding entries is additive. |
| Terminology | Two things: `teams.terms` (canonical key → coach's word, for positions, routes, concepts, coverages, read keys) and `teams.naming` (the team's own words for formations, tags, backfields, motions and plays, each with a free-text meaning and a call order) | Keep both. See the gap below. |
| Team formations | `teams.formations`: name + where everyone lines up, in yards | Unchanged. Breakdown matches pre-snap alignments against these to name our formations. |
| Field standard | Convention in a code comment | `shared/field` module; `teams.field` JSON (`FieldSpec`). |
| Opponents and games | `game_plans.opponent` text | New `opponents` and `games` tables (below). |

**Gap: there is no canonical formation vocabulary.** A play's formation is a free-text name. That works for our own plays, where the team's words are the truth. It does not work for opponent film (an opponent has no naming table in our system) or for comparing across teams. Proposal: a computed, team-independent **formation shape** in `shared/football`, derived from geometry alone: receivers left and right (2x2, 3x1, …), tight ends and wings per side, quarterback depth (under center, pistol, gun), backs and their offset, personnel. The team's formation name is then a label on a shape. Install's `offenseShape()` in `blocking.ts` is most of this already. Breakdown stores both: the shape (always) and the team's name for it (when one matches).

The naming table maps words to free-text meanings, not to canonical keys, so "map a classified play to the team's terminology" has structured data for formations (through saved lineups) and concepts (through `terms.concepts`), and only prose for play names. This is where the brief's Claude step earns its place.

### 4.2 New shared tables

```
opponents        id, team_id, name
games            id, team_id, opponent_id, game_date, home_away, season
                 (game_plans gains game_id later; TODO's program schedule is this table)
teams.field      FieldSpec JSON, null until confirmed
```

### 4.3 New Breakdown tables

```
films            id, team_id, game_id,
                 subject: "our_game" | "opponent_scout" | "practice",
                 perspective: "sideline" | "endzone" | "drone_high" | "drone_behind" | "drone_overhead" | "unknown",
                 source: "hudl_manual",              -- the ingest interface; a future connector adds a value
                 media_key, bytes, duration_s, width, height,
                 field: FieldSpec override or null,
                 upload_status, uploaded_by, created_at,
                 training_use: "none" | "own_team" | "all_teams"   -- default "none"; see section 7
film_imports     id, team_id, film_id, kind: "hudl_breakdown", rows JSON as exported, filename
                 -- Hudl's export kept exactly as it arrived
engine_runs      id, team_id, film_id, engine_version, rules_version, tier,
                 status, error, started_at, finished_at,
                 gpu_type, gpu_seconds, gpu_usd, api_input_tokens, api_output_tokens, api_usd, storage_bytes
                 -- the per-film cost log the brief asks for
snaps            id, team_id, film_id, index, t_start_ms, t_snap_ms, t_end_ms,
                 offense: "us" | "opponent",
                 quarter, series, down, distance, yard_line, hash, spot JSON (field frame),
                 formation_shape, formation_name, strength, personnel, backfield,
                 play_type, play_call, concept_key, result, yards_gained,
                 play_id → plays (same-team composite key), nullable,
                 presnap JSON (players in play-frame yards), tracks_key,
                 review: "auto" | "needs_review" | "confirmed"
snap_tag_events  id, team_id, snap_id, field, value, confidence,
                 source: "rules" | "engine" | "claude" | "hudl" | "coach",
                 run_id, user_id, created_at
```

Notes:

- **`snaps` carries every field phase 2 needs:** down, distance, hash, yard line, formation, strength, backfield, play type, play call, result, yards gained, plus personnel and quarter.
- **`snap_tag_events` is append-only and is the corrections log.** Every statement about one field of one snap is a row: what was said, by which source, how confident, when, and by whom if a person. The columns on `snaps` hold the current value. A coach's correction is a new row with `source = "coach"`; the prediction it replaced is still there. This gives the brief's "original prediction, correction, who, when" without a second mechanism.
- **Hudl's tags are one more source.** The review pile for the other nine games is a query: snaps where the `hudl` value and the `rules` value differ. The gold game is a film where every field has a `coach` row.
- **Confidence is per field**, on the event, as the brief requires. `review` on the snap is derived from the lowest confidence and from specific flags (suspected RPO).
- Composite same-team foreign keys on every link, following migration 0014.

### 4.4 Same play record, or linked?

Linked. A row in `plays` is the call as drawn: one per play in the playbook. A row in `snaps` is one time something happened on film. Thirty snaps of Trips Right 24 Power are thirty snap rows pointing at one play row through `snaps.play_id`.

They share the play-type enum, `concept_key`, the formation shape, the team's terminology and the coordinate frame, so a snap and its play can be laid on top of each other. That overlay is phase 3's grading.

Opponent snaps have no `play_id`: the opponent's playbook is not in our system. They still get a formation shape, play type and concept key. A later option is "make a scout card from this snap", which would create a `plays` row from a snap's pre-snap positions for the scout team to study in Install; the shared frame makes that a copy, not a conversion.

---

## 5. Phased plan

### Milestone 0: the hand-marked drive (no GPU, no model)

Purpose: find out whether formation rules work on real alignments before any vision work.

1. Jeremy picks one drive from the game that will become the gold set.
2. A small internal marking page: show the pre-snap frame; the marker clicks four or more field landmarks whose positions are known (yard line and hash or sideline intersections), then clicks each player and the ball. The page solves the image-to-field mapping from the landmarks and saves players in play-frame yards.
3. `shared/field` and the formation-shape, strength and backfield rules are written as pure code with unit tests, and run on the marked frames.
4. Report, per field, how many snaps the rules got right against Jeremy's answers, and what the misses have in common.
5. Add noise to the marked positions and re-run, to learn how accurate the engine's positions must be before the rules break. That number becomes the engine's target.

Two side benefits: the landmark clicks are the first training labels for the yard-line keypoint model, and the marking page is the seed of the coach's correction screen.

Builds: `src/shared/field`, `src/breakdown/rules` (formation only), the marking page, re-export files for step A. No new tables are required; results can live in files.

### Milestone 1: the one-game test

Purpose: the go or no-go for the approach, measured on one verified game.

1. Gold set: every snap of one game verified by Jeremy or a coach (open question 3).
2. Engine prototype run by hand on a rented GPU, not yet a service: detection, tracking, team split, registration for the sideline view, snap detection. Registration may start semi-manual (landmarks marked on a few frames per clip and propagated) so the test does not wait on training the keypoint model.
3. Rules for run, pass, play action and result added to the formation rules.
4. Run the gold game. Report accuracy separately for formation, strength, backfield, play type, play call and result, with the common causes of error for each. No blended number.
5. Run the other nine. Produce the review pile of disagreements with the Hudl tags, split after review into pipeline errors and tagging errors.
6. Record GPU seconds, wall time and API tokens per film: the first real cost data.

Reported as a floor test: the offense was simplified and had no RPOs.

Risks I expect this milestone to surface:

- **Lateral position from a sideline camera.** A sideline camera sees the length of the field well and the width poorly, because the width is the direction pointing away from the lens. Depth off the line of scrimmage should be good; how wide a receiver is split will be noisy. Receiver counts per side survive this (order is preserved); exact splits may not.
- **Yard-line identity.** Registration finds lines; knowing which line is the 35 needs the painted numbers to be readable or continuity from the previous snap.
- **Down and distance are not on the film.** They come from the Hudl export when it exists, or are derived from the chain of spots and results, with low confidence. Without an export, opponent film will have weaker down-and-distance than our own.
- **Linemen in the pile** for the run/pass rule, which depends on tracking exactly the players who are hardest to track.
- **Clip boundaries.** If Hudl delivers one clip per play, snap detection is easy and each clip may include a second angle. If it delivers one long file, clip segmentation is a stage of its own (open question 1).

### Milestone 2: a coach can use it

Only if milestone 1 passes. Private object storage and resumable uploads; `films`, `snaps`, `snap_tag_events`, `engine_runs`, `opponents`, `games`; the engine deployed as an on-demand service behind the contract; the review queue and correction capture; Claude for low-confidence snaps and terminology, through the batch API when nobody is waiting; cost logging per film; the Hudl breakdown import; the slow, cheap processing tier.

### Milestone 3: drone

A second registration adapter. Evaluate BoT-SORT for the moving camera. Nothing downstream changes; if something has to, that is the design problem the brief warns about.

### Not built, not blocked

- Phase 2 (tendencies): `snaps` has the fields.
- Phase 3 (grading): the shared frame, `snaps.play_id`, stored tracks, and `assignmentPaths()` are what it needs. Depth confirmation (2.3) and roster-to-track identity are its own work.
- Prospect: an empty directory.
- A Hudl connector: `films.source` and the ingest interface leave the slot. Nothing logs in to Hudl, stores Hudl credentials, scrapes pages or fetches share links.

---

## 6. Infrastructure and cost

### 6.1 What the existing hosting can and cannot do

Open question 6 asks what the app runs on. The repo answers most of it: Netlify for the app and functions, Neon for Postgres, Netlify Blobs for files. Accounts, plans and regions are not in the repo.

- **Film cannot go through Netlify.** Requests are limited to about 6 MB, which is why playbook PDFs are uploaded in 4 MB pieces through server actions, capped at 150 MB (`src/domain/limits.ts`). A game film is gigabytes. The browser must upload straight to object storage with a resumable protocol (S3 multipart or tus), and the app only issues short-lived signed URLs.
- **Film should not live in Netlify Blobs.** Breakdown needs a private bucket with signed, expiring access for the browser and the engine. Options are Cloudflare R2 (no charge for downloads, which matters when a GPU pulls every film) or S3. I lean R2; prices need checking before choosing.
- **Postgres is fine** for snaps and tag events. Tracks go in files.
- **Jobs:** the existing `jobs` table and background function are enough for the web side (start a run, receive the callback, run rules, queue Claude calls). The 15-minute limit does not matter because the long work is in the engine.

### 6.2 GPU options

The brief asks for options with current pricing. These came from comparison articles dated 2026, not from the providers' own price pages, and the articles disagree with each other in places. Treat them as indicative and confirm before budgeting.

| Provider | Model | Indicative price | Notes |
| --- | --- | --- | --- |
| Modal | T4 | about $0.59/hour, billed per second | Starts on demand, stops when idle. Python-native deploy. |
| Modal | L4 | about $0.80/hour | |
| Modal | A10 | about $1.10/hour | |
| Modal | L40S | about $1.95/hour | |
| RunPod Serverless | 24 GB class (L4, A5000, 3090) | about $0.69/hour | Starts on demand. Cheaper per hour, more setup. |
| RunPod Serverless | L40S | about $1.75/hour | |
| RunPod Pods | L4 about $0.49/hour, L40S about $1.09/hour | | Rented by the hour, not on demand; the candidate for the slow, cheap tier and bulk reprocessing. |

Both on-demand services bill the time a machine takes to start and load models, so short jobs cost more than the hourly rate suggests.

Recommendation: do milestone 1 on whichever is quickest to rent by hand, measure, then choose. Nothing in the contract depends on the provider.

### 6.3 Rough cost per film (an estimate to be replaced)

Not measured. A game is roughly 150 snaps and 20 to 30 minutes of action if clipped per play. At 12 frames a second that is about 20,000 frames. If the detector processes tens of frames a second on an L4-class card, that is on the order of 10 to 30 minutes of GPU, well under a dollar at the prices above, and consistent with the 30-minute turnaround target only if frames are processed faster than real time. A full unclipped two-hour file costs several times more unless dead time is skipped cheaply first. Claude calls for uncertain snaps and terminology should be cents to tens of cents per film, half that through batches.

On these numbers the "few dollars per film" target looks reachable with room to spare, and storage may end up the larger recurring cost: 50 to 60 films a season at a few gigabytes each is a few hundred gigabytes per school. Whether to keep the original video after processing is therefore a real question (section 8).

`engine_runs` records GPU seconds, tokens and dollars per film from the first run so these guesses can be thrown away.

### 6.4 Licences

Proposed `services/vision-engine/LICENSES.md`, listing each dependency and each set of model weights separately. What I found so far:

| Component | Licence | Status |
| --- | --- | --- |
| RF-DETR code (`rfdetr`) | Apache 2.0 | OK |
| RF-DETR detection weights, Nano to Large | Apache 2.0 | OK |
| RF-DETR detection weights, XL and 2XL | Roboflow Platform Model License 1.0 | **Do not use.** Tied to a Roboflow plan. |
| Roboflow Trackers | Believed Apache 2.0 | Not confirmed in this audit; check the repo's LICENSE. |
| ByteTrack, BoT-SORT (original repos) | Believed MIT | Check, and check any re-identification weights BoT-SORT pulls in. |
| OpenCV | Apache 2.0 | OK |
| ffmpeg | LGPL or GPL depending on how it was built | Use an LGPL build. Easy to get wrong: many prebuilt binaries are GPL. |
| Ultralytics YOLO | AGPL | Excluded, as the brief says. Also watch for it arriving as a dependency of something else. |

Roboflow's own licensing page lists three very small RF-DETR sizes as platform-licensed while other sources do not mention them, so the weights table should be checked against the repository at the version actually installed.

---

## 7. Film privacy

Rules I propose to build in from the first table, because they are hard to add afterwards:

- Film and everything derived from it sits under the owning team's id in a private bucket. No public URLs. Access only through short-lived signed URLs issued after `requireCoach`.
- The engine receives one signed URL per job and deletes its copy when the job ends.
- `films.training_use` defaults to `"none"`. Opponent film received through exchange stays `"none"` until Jeremy answers open question 4. Nothing trains across schools without a recorded agreement.
- **Install's shared learning must not extend to Breakdown.** Today `teams.share_answers` defaults to on and lets one team's approved answers improve suggestions for others (`src/teach/shared.ts`). That is a reasonable default for football knowledge in text. It is the wrong default for video of minors and for a team's corrections, so Breakdown gets its own, off-by-default switch and does not read the existing one.
- Corrections are stored per team. Using them to improve models that serve other schools is the same question as film and needs the same agreement.

Two existing statements will need a deliberate update when film arrives, not a silent one:

- `CLAUDE.md`: "Player data is first name + last initial, jersey, positions. Nothing else." Film is more than that.
- The `/privacy` page, which describes only playbook study.

---

## 8. Decisions and open questions for Jeremy

### Decisions this plan needs

- **D1. Where the football rules run.** Recommended: in the web app's code, with the engine returning positions (3.3). Alternative: inside the engine, as the brief words it.
- **D2. Hash and field dimensions on the snap and the team, not on the playbook play** (2.4). Recommended.
- **D3. Snap and play as linked records** (4.4). Recommended.
- **D4. Module boundary by re-exports now, file moves later** (3.2). Recommended. The alternative is to move Install's files first.
- **D5. Order relative to the program plan in TODO** (Varsity, JV, Freshman). Breakdown needs games and opponents, which is the program schedule. Recommended: build `opponents` and `games` once, shared, at milestone 2, and let the program work reuse them.
- **D6. Which field rules Jeremy's team plays under** (NFHS 11-player, or something else), to pick the first preset.

### The brief's open questions

1. What does a Hudl download produce: one file or a clip per play, and at what resolution? What columns are in the breakdown export? Searching did not settle it: one third-party guide says Hudl offers a choice of one file or several and emails a link; another says downloads are restricted. It probably depends on the account. The quickest answer is for Jeremy to download one game and one export and share the file names, sizes and column headings.
2. Which drone angle does the team's own film use?
3. Who verifies the gold-set game, and which game is it?
4. May opponent film be used for training, or only for tagging? Until answered: tagging only.
5. Does the staff want the same depth of breakdown on JV and freshman film as on varsity?
6. Hosting: the repo shows Netlify, Neon and Netlify Blobs. Still needed: which object storage account Jeremy wants film in, and whether there is a preference for where GPUs run.

### Questions the audit added

7. Does the Hudl film include an end zone angle as well as the wide angle? A tight end-zone copy would help line play and hurt nothing.
8. After a film is processed, should RepWon keep the original video, or only the results and a pointer back to Hudl? This drives storage cost and privacy exposure.
9. In the ten tagged games, are the opponent's plays tagged too, and in whose terms?
10. May Breakdown's coach pages assume a coach has already set up formations and naming in Install, or must it work for a school that only buys Breakdown? This decides whether team formation names are required or optional in the rules.

---

## 9. What happens next

Nothing, until Jeremy approves. On approval of D1 to D4, the first work is milestone 0: `shared/field`, the formation rules with tests, the marking page, and the re-export files. No migration is needed for milestone 0.

## Sources for the outside facts

- GPU prices: [RunPod's 2026 provider comparison](https://www.runpod.io/articles/guides/top-serverless-gpu-clouds), [RunPod vs Modal listed prices, September 2026](https://www.glamdringresearch.com/post/runpod-vs-modal), [Modal per-second pricing summary](https://markaicode.com/pricing/modal-pricing/), [six providers compared](https://tech-insider.org/gpu-cloud-providers-serverless-gpu-pricing-modal-runpod-nebius-2026/)
- RF-DETR licences: [Roboflow's RF-DETR licensing page](https://roboflow.com/model-licenses/rf-detr), [RF-DETR docs](https://rfdetr.roboflow.com/latest/), [rfdetr-plus on PyPI](https://pypi.org/project/rfdetr-plus/), [Roboflow forum on XL sizes](https://discuss.roboflow.com/t/plan-required-for-new-rfdetrlarge-sizes/11827)
- Hudl downloads: [Pixellot's guide to downloading from Hudl](https://docs.pixellot.tv/portal/en/kb/articles/downloading-video-from-hudl-to-upload-to-vidswap), [SportsRecruits help article](https://help.sportsrecruits.com/hc/en-us/articles/7989831712781)
- Field markings: [WIAA on hash marks](https://www.wiaawi.org/about-wiaa/news/field-markings-hash-marks), [NSAA football notes](https://secure.nsaahome.org/textfile/fbl/fbnotes.pdf), [hash mark distances by level](https://en.wikipedia.org/wiki/Hash_mark_(sports))
