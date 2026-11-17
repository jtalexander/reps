# Decisions

Rulings made while building v1 (2026-11-17). Source brief: Jeremy's "Football Playbook Quiz App" build prompt.

## Product

- **Standalone app, not part of Chalk.** Jeremy, 2026-11-17: "separate from Chalk. We may add it in later." No shared code or database. Low-level PDF rendering ideas were borrowed; nothing imports Chalk. The Hawks and Spartans PDFs in `../chalk/reference/` are used as test fixtures only.
- **Players join with team code + name, no account** (Jeremy's pick). A signed httpOnly cookie names the player; resetting the team code bumps `join_code_version` and signs everyone out. Nothing is collected from players beyond first name, last initial, jersey and positions, which the coach enters.
- **Coaches sign in with email + password** (Better Auth). Magic links and Google can be added when an email provider / OAuth client exists.
- **Working name "Reps".** Change it in `src/app/layout.tsx` and `src/lib/auth.ts`.

## The play model

- One JSON document per play (`plays.data`, validated by `PlayDataSchema`), with denormalized columns (`name`, `play_type`, `concept_key`, `status`, `qb_ready`) for lists and filters.
- `"unknown"` vs `null`: unknown = not read / not sure (shows on the checklist); null = not applicable.
- The spec's schema had no coordinates; redrawing needs them. Players carry `x, y` in yards from the ball. Routes carry a name + depth and, when the card's drawing is not a standard shape, the drawn `path`. Changing a route's name or break in review clears the drawn path so the route tree redraws it.
- `option_details.decisions` (reaction → give/keep/pitch/throw) was added beyond the spec: the decision quiz needs a machine-checkable answer, not just prose rules. Library concepts fill it; the coach confirms.
- `concept_key` lives on the play (not only in pass details) so run and option concepts link too.

## AI extraction

- Model: `ANTHROPIC_MODEL`, default `claude-opus-5-5`, effort high, structured output via zod (`messages.parse`), up to 3 attempts; refusals and truncation are reported as failures the coach fills in by hand.
- The model locates players and paths in **pixels**; `calibrate.ts` converts to yards (blue line of scrimmage + 5-yard lines; falls back to offensive-line spacing, then crop width).
- **OCR fallback = Claude reading the image.** The PDF text layer is passed when present (Hudl prints often have none — titles are outlines); otherwise the prompt tells the model to read text from the image. No separate OCR engine.
- The model is told to fill reads only from text printed on the card. Standard reads come from the concept library and are marked `suggested`.
- Extraction runs one play per server action, 4 at a time from the coach's browser, so no single request runs long and progress is visible. **Risk on Netlify:** a slow read can exceed the synchronous function timeout; if that shows up in production, move `extractPlayRow` to a Netlify background function and poll.
- **Box detection:** bordered frames (pairs of long vertical borders + top edge, title above joins the box) first; XY-cut on whitespace gutters as a fallback; coach can drag/resize/add/delete boxes or apply a 1/2/4/6/8 grid.

## Review and approval

- **Approval requires every requirement for the play type** (the spec's QB-ready gate, applied to approval itself), so a quiz can never draw on an incomplete play. "QB-ready" = an approved pass/play-action/screen/RPO/option play.
- Level rules: youth 1 read per pass play; middle school 2; high school 2 + best throw vs at least 2 coverages.
- Approving confirms all `suggested` values. Team concept edits flow into plays' `from_concept` fields even after approval (the coach changed the concept knowingly); fields the coach typed on a play are never overwritten.

## Quizzes

- Every question is generated from approved play data; distractors come from other approved plays and the route tree. Every answer carries an explanation drawn from the play (route description, the player's progression step, coverage reasoning, rules, coaching points addressed to that player).
- Grading is server-side; the client gets questions without answers, and diagrams with the hidden assignment, names and reads stripped.
- QB "what's your job" questions are skipped unless the QB carries it or runs a route (fakes/meshes are covered by the read questions).
- Spaced repetition: Leitner boxes per (player, play, quiz type), intervals 0/1/2/4/8/16 days; a miss comes back in 10 minutes.
- Flip: when the team allows it, ~30% of assignment/presnap diagrams are mirrored and the prompt says "(flipped)". Formation ID is never flipped (names often encode the side).
- Speed round: assignment questions, no diagram, 5 s (8 s youth); a timeout counts as a miss.

## Not built yet

- Drawing a route on a blank field as a quiz answer (the spec's "tap the correct route on a blank diagram"): v1 uses multiple choice and "name this route shape".
- Dragging players / redrawing paths in review (positions come from the model; routes redraw from the route tree).
- Email/OAuth sign-in for coaches, inviting a second coach to a team.
