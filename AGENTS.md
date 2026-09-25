# AGENTS.md: TerraPlayer

The rules for every coding agent (Claude Code, Codex, Cursor, and others) and every human contributing here.
Read this, then `README.md`. For deeper detail: `AUDIO.md`, `VISUALIZER.md`, `SETTINGS.md`, `TOOLS.md`,
`PERFORMANCE.md`, `DOWNLOADER.md`. If your change alters behavior one of them describes, update that doc in the same PR.

> **Claude Code users:** `CLAUDE.md` is gitignored in this repo. Create a local `CLAUDE.md` in the repo
> root containing the single line `@AGENTS.md`, and Claude Code will load this file automatically.

## What this is

TerraPlayer is an offline, local-first desktop music player built with Electron 32, React 18, TypeScript, zustand and Tailwind.
The library is a local SQLite database (`better-sqlite3`, stored in Electron's `userData` directory). Audio reaches
the renderer through a custom in-process `hub://` stream protocol that supports range requests. The project is MIT-licensed
and is owned and maintained by TerraByte Solutions LLC (@TerraByte-Dev). It has to stay **lightweight**, so that nobody
feels they need to close it when their machine is slow.

## Setup and commands

Use **Node 22.12 or newer**. CI uses Node 22. `npm test` depends on `--experimental-strip-types`, so Node 20 can't run it.
Windows is the only shipped target and the only OS CI runs on, so verify your changes there.

```bash
npm ci               # postinstall rebuilds better-sqlite3 against Electron's ABI
npm run dev          # electron-vite dev app, hot reload
npm test             # node:test, pure logic only
npm run typecheck    # tsc --noEmit: tsconfig.web.json (renderer) + tsconfig.node.json (main/preload)
npm run compile      # production build, no installer. CI doesn't run this, so run it yourself
```

- If `better-sqlite3` fails to load with an ABI or `NODE_MODULE_VERSION` error, run `npx electron-builder install-app-deps`.
- Don't run `npm run build` or `npm run release`. Packaging and publishing are maintainer-only.
- The in-app downloader's Python backend lives outside this repo. The player builds, runs and tests without it.
  Don't try to recreate it.
- There is no linter or formatter config. Match the surrounding style: 2-space indent, single quotes, no semicolons.

## Architecture

main (`electron/`) ↔ preload bridge (`electron/preload.ts` → `window.hub`) ↔ renderer (`src/`).

- `electron/main.ts`: window setup, every `ipcMain` handler, and the updater.
- `electron/ipc/*`: main-process logic. `library` (scan → SQLite), `db` (schema + migrations), `stream` (`hub://`),
  `metadata`, `downloader` + `ytauth`.
- `src/store/*`: zustand stores. `src/lib/*`: the audio graph, theme, queue, settings schema and typed IPC.
- `src/components/*`: the UI. `settings/*` holds the Settings panels and `tools/*` holds the utilities-dock tools.

**The process-boundary rule:** the renderer never touches Node, `fs` or SQLite directly. A new main-process capability
goes like this:
1. Write the logic in `electron/ipc/<area>.ts`.
2. Register an `ipcMain.handle` for it in `electron/main.ts`.
3. Expose it in `electron/preload.ts`.
4. Declare it on `window.hub` in `src/lib/ipc.ts`, and add it to the `hub` wrapper there.

The preload and that declaration are **not type-linked**, so typecheck won't catch a mismatched signature. Keep them in
sync by hand. The renderer calls through `hub`. State that several components share belongs in a zustand store:
`src/store/library.ts` owns tracks, playlists, tags and folders. Renderer-only features (display preferences, UI state)
need no IPC.

## Tests

- Tests use `node:test` and `node:assert/strict` and run under `--experimental-strip-types`. Don't add Jest or Vitest.
- The runner globs exactly three paths (`package.json` → `scripts.test`):
  `electron/ipc/__tests__/*.test.mjs`, `src/lib/__tests__/*.test.mjs` and `src/lib/tools/__tests__/*.test.mjs`.
  **A test file anywhere else, or one named `*.test.ts`, never runs, and nothing warns you.** Don't widen the glob in a feature PR.
- Tests import `.ts` source directly, so code under test must be pure: no electron, `fs`, DOM, React or store imports;
  relative imports with an explicit `.ts` extension (no `@/` alias); and only erasable TypeScript (no `enum`, `namespace`
  or constructor parameter properties).
- Put testable logic in a pure module. In `electron/ipc/`, that's a `*-core.ts` beside its impure shell (`stream-core.ts`
  beside `stream.ts`). `tsconfig.node.json` doesn't allow `.ts` import extensions, so give those files no relative runtime imports.
  In the renderer, it's a module in `src/lib/` (like `library-core.ts` or `queue.ts`). Keep the shells thin. New logic ships with tests.
- Components have no unit tests. You verify UI by running the app, and the PR shows it with screenshots or a GIF.

## Invariants (don't break these)

- **Genuinely offline.** A fresh launch makes zero network requests. Only the opt-in downloader and an
  explicit update check may use the network. Don't add network calls, remote fonts, images or CDNs, analytics, or telemetry.
- **Audio files are never modified** except on an explicit metadata save. They are never deleted except
  through "Delete song", which sends them to the Recycle Bin.
- **A folder is a source of songs, not their owner.** Tracks can belong to no folder, and removing a folder
  asks whether its songs stay. See README → "How the library thinks about your music".
- **`tracks.id` is the add-order.** It is AUTOINCREMENT and never reused, and it backs the default sort and the id column. Never renumber it.
- **Track identity is the content fingerprint `tracks.uid`.** When a file is moved or renamed, it is re-linked to its
  existing row, so its id, tags and playlist memberships survive. Store any new per-song data in a table keyed on
  `tracks(id)` with `ON DELETE CASCADE`, as `track_tags` does. Never key it on `path`.
- **Schema changes are additive and idempotent.** Make them in `migrate()` in `electron/ipc/db.ts`. Use one of the
  existing patterns: `CREATE TABLE IF NOT EXISTS`, a guarded `ALTER TABLE`, or a one-time step keyed in `app_meta`
  (like `migrateTrackUid`). An existing user's library must upgrade in place with no data loss. Call out any schema change in the PR.
- **Preferences live on the renderer side** (zustand `persist` or `localStorage`; see `SETTINGS.md`).
  - A new Settings-panel preference also goes into `src/lib/settings-schema.ts` (default, clamp and test) and
    `src/lib/settings-io.ts` (gather and apply), so the settings backup round-trips it.
  - A display preference that must apply before first paint follows the `theme.ts` pattern: its own `localStorage`
    key, applied in `bootDisplayPreferences()`.

## Keep it lightweight

- Nothing costs anything while it's idle. No timers, `requestAnimationFrame` loops or polling may run while a feature is closed
  or idle. Mount heavy UI only when it is opened.
- The player store's `currentTime` updates about 4 times a second during playback. In new code, subscribe with narrow
  selectors (`usePlayerStore(s => s.x)`), never a selector-less `usePlayerStore()`. See `PERFORMANCE.md`.
- In either process, don't add work that scales with library size to startup or to anything that runs every tick or
  frame. Batch SQLite writes in a transaction.
- Aim for zero new dependencies. If you add one, justify it in the PR: what it costs and why a few lines of our own code won't do.

## Contributor workflow

1. **Get the code.**
   - **Invited collaborators** push branches straight to this repo. `main` is protected: every change lands through a PR
     that @TerraByte-Dev approves (CODEOWNERS + ruleset), so nothing you push can reach `main` on its own.
     ```bash
     gh repo clone TerraByte-Dev/TerraPlayer && cd TerraPlayer
     git switch -c feat/<N>-<slug> origin/main   # N = issue number; fix/<N>-<slug> for bugs
     npm ci
     # ...work and commit...
     git push -u origin feat/<N>-<slug>
     ```
   - **Everyone else** works from a fork: `gh repo fork TerraByte-Dev/TerraPlayer --clone` makes your fork `origin` and
     this repo `upstream`. Branch from `upstream/main` and push to your fork.
2. **Use one branch and one PR per issue.** Cut each branch from a freshly fetched `main`. Keep the diff to
   what the issue asks for, with no drive-by refactors or reformatting. If you notice unrelated problems, list them in the PR body instead.
3. **Use Conventional Commits**, scoped the way the history is: `feat(tags): …`, `fix(library): …`, `feat(settings): …`.
   The PR title uses the same format.
4. **Open the PR early, as a draft,** against `TerraByte-Dev/TerraPlayer:main`. Fill in the PR template, include `Closes #N`,
   and (from a fork) leave "Allow edits by maintainers" checked.
5. **Before you mark it Ready for review:** `npm run typecheck`, `npm test` and `npm run compile` pass locally, UI changes
   include before/after screenshots or a GIF, and the human contributor has read the whole diff. CI re-runs typecheck and
   tests on the PR. From a fork, a first-time contributor's CI run waits for maintainer approval.
6. **Address review with new commits.** Don't force-push over commits that have already been reviewed unless you're asked to.
   To pick up newer `main`, merge it into your branch instead of rebasing.
7. **@TerraByte-Dev reviews and merges. Contributors never merge.** A PR is done only when the maintainer approves it.

**Don't:**
- bump `version` in `package.json` or write release notes. Releases are maintainer-only.
- create, edit or delete **GitHub Releases** or tags, even though collaborator access technically allows editing
  releases. The in-app updater installs whatever the latest Release holds, so a touched Release ships to every user.
- push to, delete or force-push any branch you didn't create.
- touch release, packaging or CI config: the `build` block in `package.json` (electron-builder, including
  `publish`), `scripts/stage-downloader.mjs`, or `.github/workflows/`.
- commit build output or local state: `out/`, `dist/`, `release/`, `*.tsbuildinfo`, `downloader.local.json`,
  `CLAUDE.md`, `.claude/`, `.env*`.
- commit an unrelated `package-lock.json` rewrite. Install with `npm ci`. The lockfile changes only alongside a justified dependency change.
- put secrets, tokens or machine-specific paths in code, commits or PR text.

**Agents:** the human contributor is accountable for every line. When the issue leaves a product or UX question open,
don't guess silently. Pick the simplest option and list the decision under "Open questions" in the PR body. Leave the PR
as a draft. The human marks it ready after reviewing it.
