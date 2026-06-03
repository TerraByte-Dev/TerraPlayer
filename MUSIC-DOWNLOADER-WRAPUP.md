# Music Downloader — wrap-up handoff (TerraPlayer)

> The **Add Music** downloader + bulletproof **YouTube-auth** was built and verified,
> then ported into this repo (`TerraByte-Dev/TerraPlayer`, `terra-player` 2.0.2).
> Everything **tests, typechecks, and builds** here — the changes are **uncommitted**
> on `main`. This doc is the single source of truth to finish wrapping it up
> (review → commit per conventions → optional release).

---

## 1. What it is

An **Add Music** panel (open from **Settings → ADD MUSIC → Open Music Downloader**)
that wraps the Media project's `download_music.py` backend (its `--json` NDJSON mode).
Paste an `Artist - Track` list / YouTube URL / Spotify `.csv`; **preview** the chosen
version with a colour-coded **confidence** flag (HIGH/MEDIUM/LOW/PINNED + explicit `E`);
**swap / pin / edit / remove** per row; **download** with live progress + auto-reindex.

- **Preflight banner**: per-tool checklist (yt-dlp incl. stale-version, ffmpeg, Deno,
  ytmusicapi) + a real **YouTube auth probe**, with **copy-fix** commands and a
  **"Fix it for me"** one-click installer (winget/pip + Windows PATH-refresh).
- **YouTube sign-in** (3 sources, all verified by the probe): **Connect YouTube**
  (in-app isolated, hardened login window → managed cookies.txt), **browser**, and
  **cookies.txt** import. Persisted in `userData`; an **(i)** explains it. No password
  is ever stored; nothing leaves the machine.

Feature docs: **`DOWNLOADER.md`** (this repo). Backend contract:
`C:\Users\tatew\Desktop\Media\Tools\MusicDownloader\JSON-PROTOCOL.md`.

---

## 2. Changeset (uncommitted, on `main`)

```
NEW  electron/ipc/downloader.ts            spawn CLI, NDJSON stream, install runner, PATH refresh
NEW  electron/ipc/downloader-core.ts       pure helpers — paths, install map, Netscape export, auth allowlist (unit-tested)
NEW  electron/ipc/ytauth.ts                in-app login window, capture/persist, source resolver
NEW  electron/ipc/__tests__/downloader-core.test.mjs   node --test (20 tests)
NEW  src/store/downloader.ts               zustand state machine (preview→download→done, auth, install)
NEW  src/components/Downloader.tsx          the overlay UI
NEW  DOWNLOADER.md                          feature + architecture docs
NEW  downloader.local.example.json          per-machine path template (downloader.local.json is gitignored)
MOD  electron/main.ts                       dl:* + ytauth:* IPC handlers (+ a saveImage type fix)
MOD  electron/preload.ts                    bridge methods
MOD  src/lib/ipc.ts                          window.hub types + hub const
MOD  src/App.tsx                             mounts <Downloader>, routes open via Settings
MOD  src/components/Settings.tsx             new "ADD MUSIC" section → opens the downloader
MOD  package.json                            extraResources(download_music.py) + scripts: test, typecheck
MOD  .gitignore                              downloader.local.json
```

The backend (`Media/Tools/MusicDownloader/download_music.py` + its 56 tests +
`JSON-PROTOCOL.md`) is **already saved** in the Media project (not a git repo). The
human CLI is unchanged — `--json` is purely additive. The feature was built against
the sibling `t-play` 2.1.0 repo and reviewed there with two adversarial passes; all
confirmed findings were fixed before porting here.

---

## 3. Verify (all green here)

```bash
npm test                                        # 20 node tests
npx tsc --noEmit -p tsconfig.web.json           # renderer types
npx tsc --noEmit -p tsconfig.node.json          # electron types
npm run compile                                 # electron-vite (2.x) production build
npm run dev                                     # launch → Settings → ADD MUSIC → Connect

# backend (Media project)
python C:\Users\tatew\Desktop\Media\Tools\MusicDownloader\test_download_music.py   # 56 tests
```

---

## 4. Wrap-up tasks

1. **Review the diff** (it's clean — 7 modified, 8 new; no package-lock churn).
2. **Branch + commit + PR** per `~/.claude/CLAUDE.md`: open an issue, branch-first off
   `main` (`feat/<issue>-music-downloader`), Conventional Commits, **draft PR** with
   `Closes #<issue>`, merge-commit. Repo is in sync with `origin/main`.
3. **Backend path — already handled correctly, just know how it works:**
   `download_music.py` lives in the Media project. **Dev** uses it live via the
   canonical-path fallback in `electron/ipc/downloader.ts` (single source of truth —
   your edits to the Media script flow straight through). A **packaged build** bundles
   a copy from it at build time via the `package.json` `extraResources` absolute path
   (self-contained installer). This works because releases are built on this machine.
   *Only if you ever build on another machine / CI:* set `TPLAY_DOWNLOADER_SCRIPT` or
   `downloader.local.json`, or vendor `download_music.py` into the repo (like
   `tag_writer.py`) and switch `extraResources`/the resolver to the relative path.
4. **Release (optional).** `npm run build` (NSIS) or `npm run release` once committed.
5. Optionally add a feature blurb to `README.md` (not yet touched here).

---

## 5. Caveats (for release notes)

- **Cold-start needs Python + a YouTube login.** The app installs yt-dlp/ffmpeg/Deno/
  ytmusicapi ("Fix it for me"); **Python** must be installed by hand (detected + guided);
  and the user must **sign into YouTube** (Connect / browser / cookies.txt — a login,
  not an install).
- **Embedded login** (Connect) usually works with the spoofed Chrome UA, but Google can
  block it on some setups; the browser + cookies.txt fallbacks cover it, and the probe
  verifies whichever source. Chrome/Edge cookies are encryption-locked → Firefox or
  cookies.txt. **winget** is required for the ffmpeg/Deno installs (present on Win10/11).
