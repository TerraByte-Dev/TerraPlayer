# TerraPlayer

An offline desktop music player with a y2k / phosphor-terminal aesthetic. Built with Electron, React, and TypeScript.

Point it at a folder of local audio files — it scans the library, reads metadata and cover art, and gives you a fully featured player with no internet dependency.

---

## What's new in v2

- **MAINFRAME theme** — full y2k phosphor-green aesthetic: LCD fonts, scanline overlays, glowing transport keys, CRT-green progress bars
- **MEDIA.DRIVE panel** — live sidebar stats: song count, disk space used (bar, 50 GB cap), total library length (HH:MM:SS), uptime
- **Seek bar fix** — click-to-seek now maps to the visible progress bar, not the full player width
- **Themed window controls** — native title bar overlay matches the phosphor palette (black bg, green symbols)
- **VectorGrid cover art** — generative procedural cover for tracks without embedded art
- **Popout visualizer** — pop the audio visualizer out to a second display in fullscreen
- **Settings panel** — 3-dot menu next to MAINFRAME; check for updates from inside the app

---

## Features

- **Local library** — scans folders for `.m4a` and `.mp3`, reads embedded metadata and cover art
- **Playlists & tags** — create playlists and custom tags, assign tracks, filter by either
- **Metadata editor** — edit title, artist, album, year; writes back to the file via IPC
- **Playback** — play/pause, skip, shuffle, repeat (off / all / one), seek, volume
- **Themes** — 12 phosphor recolors (Mainframe, Matrix, Ice, Synthwave, Ultraviolet, Amber…) that recolor the whole app instantly; scanline + reduced-motion toggles ([SETTINGS.md](SETTINGS.md))
- **Full settings panel** — Appearance, Audio, Playback, Library, Updates, About; every preference persists across restarts
- **EQ / audio enhancement** — bass lift, voice, YT-polish presets + manual low/mid/high bands, a pre-amp, and a mono downmix — all wired to the Web Audio graph
- **Audio visualizer** — spectrum bar visualizer, fullscreen mode, pop-out to a second display
- **Queue panel** — Up Next queue; "Play next" context-menu on any track
- **Cover art** — embedded art shown on player bar and track list; procedural fallback
- **Add Music** — download songs straight into your library, preferring the explicit / original master over clean or radio edits (Settings → ADD MUSIC)
- **Settings backup** — export/import all preferences (incl. theme) as a portable JSON file
- **Auto-updater** — check for updates from Settings; downloads and installs on restart

## Add Music (downloader)

Open from **Settings (gear) → ADD MUSIC → Open Music Downloader**. Paste an
`Artist - Track` list (or a YouTube URL, or a Spotify `.csv`), **preview** the
chosen version with a colour-coded confidence flag, fix anything per row
(swap / pin / edit / remove), then **download** with live progress — the
library reindexes automatically so new tracks appear right away.

- **Preflight banner** checks your environment (yt-dlp, ffmpeg, Deno, ytmusicapi)
  with a one-click **"Fix it for me"** installer, plus a real YouTube sign-in probe.
- **YouTube sign-in** offers three probe-verified sources — in-app login, browser
  cookies, or a `cookies.txt` import. No password is stored; nothing leaves your machine.

It's a UI over the Media project's `download_music.py` backend (run in `--json`
mode). Full details in [`DOWNLOADER.md`](DOWNLOADER.md).

## Themes & settings

Open **Settings (gear)** for a full control surface. **Appearance** offers 12 themes that
recolor the entire interface instantly — phosphor recolors (Mainframe green, Matrix lime,
Amber, Tangerine, Crimson), cool tones (Ice, Aqua, Slate), and neon duotones (Synthwave,
Vapor, Ultraviolet, Gold) — plus scanline and reduced-motion toggles. **Audio** surfaces a
3-band EQ with presets, a pre-amp, and a mono downmix, all wired live to the Web Audio
graph. **Playback** remembers your volume and shuffle/repeat modes; **Library** manages
your scanned folders and shows live stats; **About** carries your whole setup between
machines via export/import.

The UI chrome is fully CSS-variable driven, so a theme is just a bundle of token overrides.
Architecture + how to add a theme: [SETTINGS.md](SETTINGS.md).

## Tech stack

| Layer | Tech |
|---|---|
| Shell | Electron 32 |
| Renderer | React 18 + TypeScript |
| Build | electron-vite + Vite 5 |
| Styling | Tailwind CSS |
| Database | better-sqlite3 (SQLite, native file-backed, WAL mode) |
| Audio | Web Audio API |
| Metadata | music-metadata |
| Updates | electron-updater + GitHub Releases |

## Getting started

```bash
cd hub
npm install
npm run dev
```

On first launch click **Add folder** and point the app at a directory of music files. Hit **> reindex** any time you add new tracks.

### Build installer (Windows)

```bash
npm run build
# outputs: hub/dist/TerraPlayer Setup 2.0.0.exe
```

## Project structure

```
hub/
  electron/       # Main process + IPC handlers
    ipc/          # library, metadata, stream, db
  src/
    components/   # React UI components
    store/        # Zustand state (player, library)
    lib/          # IPC bridge, audio engine, utilities
  build/          # App icon (icon.ico)
```

## Releasing

Releases are published to GitHub Releases and picked up automatically by the in-app updater.

```powershell
# One-time: set your GitHub token
$env:GH_TOKEN = (gh auth token)

# Bump version in package.json, then:
npm run release
```

This builds the installer, generates `latest.yml`, creates a tagged GitHub release, and uploads both files. Users running the previous version will see the update available in Settings → Updates.

## Notes

- Library database lives in `%APPDATA%/TerraPlayer` — persists across updates
- Upgrading from a previous install automatically migrates data from the old `tb-media-player` folder
- Audio files are never modified except when explicitly saving metadata changes
- M4A (AAC) and MP3 are both fully supported
- Window controls on Windows use Electron's native title bar overlay (black bg, phosphor green symbols)
