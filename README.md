# tb-mediaplayer

An offline desktop music player with a y2k / phosphor-terminal aesthetic. Built with Electron, React, and TypeScript.

Point it at a folder of local audio files — it scans the library, reads metadata and cover art, and gives you a fully featured player with no internet dependency.

![MAINFRAME](build/icon.ico)

---

## What's new in v2

- **MAINFRAME theme** — full y2k phosphor-green aesthetic: LCD fonts, scanline overlays, glowing transport keys, CRT-green progress bars
- **MEDIA.DRIVE panel** — live sidebar stats: song count, disk space used (bar, 50 GB cap), total library length (HH:MM:SS), uptime
- **Seek bar fix** — click-to-seek now maps to the visible progress bar, not the full player width
- **Themed window controls** — native title bar overlay matches the phosphor palette (black bg, green symbols)
- **VectorGrid cover art** — generative procedural cover for tracks without embedded art
- **Popout visualizer** — pop the audio visualizer out to a second display in fullscreen

---

## Features

- **Local library** — scans folders for `.m4a` and `.mp3`, reads embedded metadata and cover art
- **Playlists & tags** — create playlists and custom tags, assign tracks, filter by either
- **Metadata editor** — edit title, artist, album, year; writes back to the file via IPC
- **Playback** — play/pause, skip, shuffle, repeat (off / all / one), seek, volume
- **EQ / audio enhancement** — bass lift, voice, YT-polish presets + manual low/mid/high bands
- **Audio visualizer** — spectrum bar visualizer, fullscreen mode, pop-out to a second display
- **Queue panel** — Up Next queue; "Play next" context-menu on any track
- **Cover art** — embedded art shown on player bar and track list; procedural fallback

## Tech stack

| Layer | Tech |
|---|---|
| Shell | Electron 32 |
| Renderer | React 18 + TypeScript |
| Build | electron-vite + Vite 5 |
| Styling | Tailwind CSS |
| Database | sql.js (SQLite in-memory, persisted to disk) |
| Audio | Web Audio API |
| Metadata | music-metadata |

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
# outputs: hub/dist/Media Player Setup 2.0.0.exe
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

## Notes

- Library database lives in `%APPDATA%/tb-media-player` — persists across updates
- Audio files are never modified except when explicitly saving metadata changes
- M4A (AAC) and MP3 are both fully supported
- Window controls on Windows use Electron's native title bar overlay (black bg, phosphor green symbols)
