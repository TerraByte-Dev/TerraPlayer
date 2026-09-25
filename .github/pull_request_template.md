<!--
Title: a Conventional Commit, e.g. `feat(tags): swipe songs into a tag`.
Open as a draft. Mark it Ready for review only after the checklist is done. The maintainer merges; contributors never do.
Full rules: AGENTS.md
-->

## Summary
<!-- Say what changed and why in 2–5 lines. Name any schema change, new preference or new dependency (with the reason). -->

Closes #<!-- issue number -->

## How to test
<!-- Give steps a reviewer can follow in `npm run dev`, including the test data needed (e.g. tracks with and without embedded art). -->
1.

## Screenshots / GIF
<!-- Required for any UI change: show before and after. Delete this section if nothing visible changed. -->

## Open questions
<!-- List decisions you made where the issue left room, and anything you'd like the reviewer to decide. Write "None" if there are none. -->

## Checklist
- [ ] `npm run typecheck`, `npm test` and `npm run compile` pass locally
- [ ] New logic has `*.test.mjs` tests in one of the three globbed `__tests__/` directories
- [ ] No `package.json` version bump, and no release, packaging or CI config changes
- [ ] No new network calls (a fresh launch still makes zero requests)
- [ ] Nothing new runs while idle or closed (no timers, `requestAnimationFrame` loops or polling)
- [ ] AGENTS.md invariants respected: audio files untouched, a folder is not a song's owner, `tracks.id` never renumbered, new per-song data keyed on `tracks(id)`, schema changes additive and named in the Summary
- [ ] Either no new dependencies, or each one is justified in the Summary
- [ ] Docs (`README.md` / other `*.md`) updated if this changes behavior they describe
- [ ] I, the human contributor, have read and understood every line of this diff, including code my agent wrote
