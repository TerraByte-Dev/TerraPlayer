# Add Music — the in-app downloader

TerraPlayer can download new songs straight into your library, preferring the
**explicit / original master** instead of clean or radio edits. Open it from
**Settings (gear icon) → ADD MUSIC → Open Music Downloader**.

It is a UI over the Media project's `download_music.py` — that script is the
backend and is **not** reimplemented here. TerraPlayer spawns it in `--json` mode and
renders the streamed events.

```
┌─────────────────── TerraPlayer (Electron) ───────────────────┐
│  Renderer (React)            Main process (Node)         │
│  Downloader.tsx ──IPC──►  electron/ipc/downloader.ts     │
│  store/downloader.ts  ◄──        │  spawn python         │
│        ▲  dl:event (NDJSON)      ▼                        │
│        └──────────────  download_music.py --json ────────┼─► YouTube / YT Music
└──────────────────────────────────────────────────────────┘
                                   └─ writes .m4a ─► Media/Music  ─► rescan
```

## The flow (what the UI does)

1. **Preflight banner** — on open, runs `--json --preflight-only` and shows a
   per-tool checklist: yt-dlp (incl. a **stale-version** warning), ffmpeg, Deno,
   ytmusicapi, and a **real YouTube sign-in probe** (a no-download yt-dlp
   extraction that catches the *"confirm you're not a bot"* wall up front instead
   of after a failed download). Each problem carries a **copy-fix** command, and
   a **"Fix it for me"** button installs the missing tools for you (winget for
   ffmpeg/deno, pip for yt-dlp/ytmusicapi) — streaming the install log and
   refreshing `PATH` so the re-check passes without an app restart. A **sign-in
   source** control lets you pick the cookie browser or load a `cookies.txt`.
   Downloads are gated only on *error*-severity checks (warnings don't block).
2. **Input** — paste `Artist - Track` lines (or a YouTube URL, or
   `Artist - Track | https://youtu.be/ID` to pin an exact source). You can also
   drop a `.txt` (one per line) or a Spotify `.csv` export.
3. **Preview** (`--json --dry-run`) — one row per song: the chosen
   `artist · title · duration`, the **source** (`ytmusic` / `ytsearch` /
   `pinned`), and a **confidence** badge, colour-coded
   **HIGH = green / MEDIUM = amber / LOW = red / PINNED = cyan** (plus an `E`
   chip for explicit masters). No download happens yet.
4. **Fix anything** per row — Accept toggle · **Swap version** (a dropdown of
   alternates from YT Music + yt-dlp, `--json --candidates-json`) · **Pin** a
   URL/id · **Edit** the query · **Remove**.
5. **Download** (`--json`) — runs the real download for accepted rows; each row
   streams `queued → downloading X% → embedding → done` (or `failed` /
   `already have it`). LOW-confidence picks are flagged the whole way.
6. **Done** — a summary (new / skipped / failed) with any LOW grabs highlighted
   to verify, and the library is **automatically reindexed** so new tracks
   appear immediately.

Accepted rows are pinned to their exact chosen video id when handed to the
backend, so the download grabs the *same* version you previewed/approved — it
does not re-resolve.

## YouTube sign-in (auth)

yt-dlp authenticates to YouTube with **browser cookies** — there is no official
download login/OAuth. The banner's **YOUTUBE SIGN-IN** row offers three sources,
all verified by the live auth probe (so a bad source is never assumed to work):

1. **Connect YouTube (in-app)** — opens an isolated sign-in `BrowserWindow`
   (its own `persist:tplay-youtube` session = a dedicated profile, with a real
   Chrome UA so Google doesn't reject it). On detecting a Google session
   (`SAPISID`/`__Secure-3PSID`/…), it exports the youtube.com+google.com cookies
   to `userData/yt-cookies.txt`. A **Reconnect** button refreshes on expiry.
2. **browser** — `--cookies-from-browser <b>` (Firefox works out of the box;
   Chrome/Edge encrypt their cookie DB — the probe says so).
3. **cookies.txt** — import a Netscape cookie file.

The chosen source persists in `userData/yt-auth.json` and is resolved by
`ytauth.resolveCookieArgs()`; in-app/file only "win" if the cookie file exists,
else it falls back to a browser read (bulletproof — downloads keep working; the
UI shows `connected:false` and the probe shows the real result). **No password
is stored** — only the session cookie, in `userData`, never transmitted anywhere
but to YouTube via yt-dlp. The login window is hardened: `sandbox` +
`contextIsolation` + no `nodeIntegration`, and a navigation allowlist
(`isAllowedAuthUrl`) keeps it on Google/YouTube (off-site links open externally).
The **(i)** button in the row explains all this in plain language.

## Where it finds the backend (and the output folder)

`electron/ipc/downloader.ts` resolves the script path in this order (first that
exists wins):

1. `TPLAY_DOWNLOADER_SCRIPT` env var
2. `hub/downloader.local.json → "script"` (gitignored, per-machine — copy
   `downloader.local.example.json`)
3. packaged build: `resources/download_music.py` (bundled via `extraResources`)
4. `<appPath>/../download_music.py` (colocated copy, mirrors `tag_writer.py`)
5. the canonical Media path baked into `downloader.ts` (`CANONICAL_SCRIPT`)

Output directory order: `TPLAY_MUSIC_OUT` env → the library folder you're
currently viewing → `downloader.local.json → "out"` → `Media/Music`. The bar at
the bottom of the input screen shows the target and lets you **change** it; if
the folder isn't in your library yet, an **+ add to library** button appears.

`python` and the cookies browser are likewise overridable via
`downloader.local.json` (`"python"`, `"cookiesFromBrowser"`) or the
`TPLAY_PYTHON` / `TPLAY_COOKIES_BROWSER` env vars. Default cookies browser is
Firefox (Chrome/Edge cookies are encryption-locked).

## The NDJSON contract

In `--json` mode the backend prints one JSON object per line on stdout:

```jsonc
{"event":"preflight","ok":true,"problems":[]}
{"event":"resolved","i":1,"query":"…","id":"…","title":"…","channel":"…",
  "album":"…","duration":217,"confidence":"HIGH","source":"ytmusic",
  "explicit":true,"stem":"Artist - Track"}
{"event":"stage","i":1,"id":"…","stage":"downloading"}     // → "embedding"
{"event":"progress","i":1,"id":"…","pct":42.5}
{"event":"done","i":1,"status":"ok","stem":"…","path":"…/Music/…m4a","confidence":"HIGH"}
{"event":"summary","new":5,"skipped":0,"failed":1,"low_confidence":["…"]}
```

Sub-modes used by the picker / banner:
`--json --preflight-only` → one `preflight` event;
`--json --candidates-json "<query>"` → one `candidates` event;
`--json --dry-run …` → resolve only (preview), no download.

Full reference: `Media/Tools/MusicDownloader/JSON-PROTOCOL.md`.

## IPC surface (added to `window.hub`)

`downloaderPreflight(opts?)` · `downloaderInstall(tools, cookieOpts?)` (streams
`dl:install-event`) · `downloaderPickCookies()` · `downloaderResolve({lines|csvPath})` ·
`downloaderCandidates(query)` · `downloaderDownload(rows, outDir, cookieOpts?)`
(streams `dl:event`) · `downloaderCancel()` · `downloaderResolveOutDir(preferred)` ·
`downloaderReadText(path)` · `onDownloaderEvent(cb)` · `onDownloaderInstallEvent(cb)`.

Plus YouTube-auth: `ytauthStatus()` · `ytauthConnect()` (opens the in-app login)
· `ytauthDisconnect()` · `ytauthSetBrowser(b)` · `ytauthDetectBrowsers()` ·
`ytauthImport()`. The active source is persisted in the main process, so
preflight/download resolve it themselves (no cookie args from the renderer). The
install runner + Windows `PATH`-refresh live in `downloader.ts`; the
tool→command mapping, the auth source resolver, the Netscape exporter, and the
sign-in navigation allowlist are pure in `downloader-core.ts` (all unit-tested).

## Files (auth)

| File | Role |
|---|---|
| `electron/ipc/ytauth.ts` | in-app login window, capture, persist, status, disconnect, import, detect |
| `electron/ipc/downloader-core.ts` | `toNetscape`, `cookieArgsForAuth`, `isAllowedAuthUrl` (pure, tested) |
| userData `yt-auth.json` / `yt-cookies.txt` | persisted source + captured cookies (per-machine, app-private) |

## Tests

```bash
npm test          # node --test over electron/ipc — NDJSON framing, task-line
                  # building, script/output path precedence (pure, offline)
npm run typecheck # tsc --noEmit for both renderer + electron
```

The backend's own offline suite (heuristics + the full NDJSON contract,
monkeypatched — no network):

```bash
python Media/Tools/MusicDownloader/test_download_music.py
```

## Files

| File | Role |
|---|---|
| `electron/ipc/downloader.ts` | spawns the CLI, frames NDJSON, streams events, cancel |
| `electron/ipc/downloader-core.ts` | pure helpers (LineBuffer, path precedence, task lines) |
| `electron/ipc/__tests__/downloader-core.test.mjs` | `node --test` unit tests |
| `src/store/downloader.ts` | zustand state machine (preview → download → done) |
| `src/components/Downloader.tsx` | the overlay UI |
| `downloader.local.example.json` | per-machine path template |
