<!-- Hero: CRT "TERRAPLAYER" phosphor wordmark — see docs/assets/README.md for the image-gen prompt. -->
<p align="center">
  <img src="docs/assets/terraplayer-wordmark.png" alt="TerraPlayer" width="680" />
</p>

<p align="center">
  <strong>An offline music player that lives in the terminal.</strong><br/>
  A local-first desktop player with a y2k phosphor-CRT soul — your folders, your files, no internet required.
</p>

<p align="center">
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/License-MIT-00FF88.svg"></a>
  <a href="https://github.com/TerraByte-Dev/TerraPlayer/releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/TerraByte-Dev/TerraPlayer?color=00FF88&label=release"></a>
  <img alt="100% offline" src="https://img.shields.io/badge/100%25-offline-00FF88">
  <img alt="Electron 32 · React 18 · TypeScript" src="https://img.shields.io/badge/Electron%2032-React%2018%20%C2%B7%20TypeScript-00FF88">
</p>

<p align="center">
  <a href="#features">Features</a> ·
  <a href="#screenshots">Screenshots</a> ·
  <a href="#quickstart">Quickstart</a> ·
  <a href="#architecture">Architecture</a> ·
  <a href="#development">Development</a> ·
  <a href="LICENSE">License</a>
</p>

<p align="center">
  <sub>brought to you by</sub><br/>
  <a href="https://github.com/TerraByte-Dev"><img src="docs/assets/terrabyte-logo.png" alt="TerraByte Solutions LLC" width="84" /></a>
</p>

---

TerraPlayer points at folders of music you already own, indexes them into a local **SQLite** library, and plays
them through a custom in-process stream — wrapped in a green-phosphor mainframe UI. It's built to be **genuinely
offline**: no account, no telemetry, no open ports, and the fonts are bundled, so a fresh launch makes **zero**
network requests. The only time it ever touches the internet is the optional, explicit music downloader — and
only when you ask it to.

## Features

- **Your library, your files** — point it at folders; a recursive scan indexes your `.mp3` / `.m4a` into SQLite. Instant search, playlists, a genre / mood / custom **tag** system, and a built-in metadata + cover-art editor (procedural cover art for files without embedded art).
- **A real audio chain** — a **10-band graphic EQ** with a dozen presets, pre-amp, true mono downmix, **crossfade between songs**, and pitch-preserved **playback speed** — all native Web Audio, so it costs nothing per frame.
- **A visualizer worth staring at** — a live spectrum in the transport bar plus a **fullscreen phosphor visualizer** you can pop out to a second display.
- **100% offline & private** — no account, no telemetry, no listening sockets; fonts are vendored locally. Your data is a local SQLite database that never leaves your machine.
- **Optional in-app downloader** — paste `Artist - Track` (or a URL) and pull new songs straight into your library, preferring the original/explicit master. Wraps `yt-dlp`, previews each match, and lets you swap the exact version before downloading. The *only* networked feature — opt-in; see [`DOWNLOADER.md`](DOWNLOADER.md).
- **A whole toolbox** — a dock of mini-tools and games: calculator, notes, whiteboard, metronome, world clock, timer, random number — plus Snake, 2048, Minesweeper, and Tic-Tac-Toe ([`TOOLS.md`](TOOLS.md)).
- **Themes** — a CRT phosphor-green default with 11 recolors (Matrix, Ice, Aqua, Ultraviolet, Synthwave, Vapor, Crimson, Tangerine…), all CSS-variable driven and applied **before first paint** so there's no flash, plus scanline + reduced-motion toggles ([`SETTINGS.md`](SETTINGS.md)).
- **Keyboard-first & auto-updating** — global transport shortcuts (space · seek · prev/next · volume · mute), and a Windows installer that auto-updates from GitHub Releases.

## Screenshots

> Captured live in `npm run dev`. See [`docs/assets/screenshots/README.md`](docs/assets/screenshots/README.md) for the shot list + capture settings.

<p align="center">
  <img src="docs/assets/screenshots/visualizer.png" alt="Fullscreen phosphor visualizer — spectrum bars, radial ring, and vector grid over a black CRT field" width="100%" />
</p>
<p align="center">
  <sub><b>Fullscreen visualizer</b> — a reactive phosphor spectrum you can pop out to a second display.</sub>
</p>

<table>
  <tr>
    <td width="50%" valign="top">
      <img src="docs/assets/screenshots/library.png" alt="Library view — the terminal-styled track list" /><br/>
      <sub><b>Library</b> — your folders indexed into a searchable track list, with playlists &amp; tags.</sub>
    </td>
    <td width="50%" valign="top">
      <img src="docs/assets/screenshots/audio.png" alt="Audio settings — the 10-band graphic EQ + presets" /><br/>
      <sub><b>Audio</b> — a 10-band graphic EQ, presets, pre-amp, mono, crossfade &amp; speed.</sub>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <img src="docs/assets/screenshots/themes.png" alt="CRT theme picker" /><br/>
      <sub><b>Themes</b> — a CRT phosphor look with recolors, all CSS-variable driven.</sub>
    </td>
    <td width="50%" valign="top">
      <img src="docs/assets/screenshots/downloader.png" alt="In-app music downloader preview" /><br/>
      <sub><b>Downloader</b> — pull new songs into your library, preview &amp; pick the version (opt-in).</sub>
    </td>
  </tr>
</table>

## Quickstart

**Prerequisites**

- [Node.js](https://nodejs.org/) 20.19+ or 22.12+
- _(optional, for the in-app downloader only)_ [Python 3](https://www.python.org/) with [`yt-dlp`](https://github.com/yt-dlp/yt-dlp) + `ffmpeg` — the app walks you through this on first open.

**Run**

```bash
git clone https://github.com/TerraByte-Dev/TerraPlayer.git
cd TerraPlayer
npm install
npm run dev          # launches the desktop app with hot reload
```

On first run, add a folder (drag one in, or use the picker) to index your music, then hit play. Everything else —
EQ, crossfade, themes, the visualizer — lives behind the gear (**Settings**) and the player bar.

> Prefer a prebuilt installer? Grab the latest from [**Releases**](https://github.com/TerraByte-Dev/TerraPlayer/releases/latest) — installed apps auto-update.

## Development

```bash
npm run dev          # dev app with HMR (electron-vite)
npm test             # unit tests (node --test): audio math, queue, settings, tools
npm run typecheck    # tsc --noEmit for the renderer + the electron main/preload
npm run compile      # production build (electron-vite, no installer)
npm run release      # build + publish a GitHub Release (needs GH_TOKEN)
```

## Architecture

Electron **main** ↔ **preload** (`contextBridge` → `window.hub`) ↔ a React **renderer**. The library is a local
SQLite database (`better-sqlite3`, stored under `%APPDATA%/TerraPlayer`), and local files are served to the
`<audio>` element through a custom in-process **`hub://`** stream protocol that honors range requests, so
seeking is instant. A few orientation points:

- `electron/main.ts` — IPC handlers + the electron-updater wiring.
- `electron/ipc/*` — `library` (scan → SQLite), `stream` (the `hub://` protocol), `metadata`, `downloader` + `ytauth`.
- `src/store/*` — zustand stores (player, library, settings, …).
- `src/lib/*` — the Web Audio graph (`audio.ts`), pure audio math (`audio-math.ts`), the CSS-variable theme system (`theme.ts`).
- `src/components/*` — the UI; `settings/*` is modular and `tools/*` is the utilities dock.

Deeper notes: [`AUDIO.md`](AUDIO.md) (the audio chain), [`DOWNLOADER.md`](DOWNLOADER.md) (the in-app downloader),
[`SETTINGS.md`](SETTINGS.md) (themes + settings), [`TOOLS.md`](TOOLS.md) (the utilities dock), and
[`PERFORMANCE.md`](PERFORMANCE.md) (the perf model). Audio files are never modified except when you explicitly
save metadata.

## License

[MIT](LICENSE) © TerraByte Solutions LLC.

<p align="center">
  <a href="https://github.com/TerraByte-Dev"><img src="docs/assets/terrabyte-logo.png" alt="TerraByte Solutions LLC" width="64" /></a><br/>
  <sub>An open-source project by <strong>TerraByte Solutions LLC</strong></sub>
</p>
