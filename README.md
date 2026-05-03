# tb-mediaplayer

A desktop offline music player built with Electron, React, and TypeScript.

Point it at a folder of local audio files and it handles the rest — library scanning, metadata, cover art, playlists, tags, and playback. No internet required after your music is on disk.

---

## Features

- **Local library** — scans folders for `.m4a` and `.mp3` files, reads embedded metadata and cover art automatically
- **Playlists & tags** — create playlists and custom tags, assign tracks, filter by either
- **Metadata editor** — edit title, artist, album, and year directly in the app; writes back to the file
- **Playback** — play/pause, skip, shuffle, repeat modes, seek, volume control
- **EQ / audio enhancement** — bass lift, voice, YT-polish presets plus manual low/mid/high bands
- **Audio visualizer** — spectrum bar visualizer, fullscreen mode, pop-out to a second display
- **Queue panel** — Up Next queue with drag-to-reorder; context-menu "Play next" on any track
- **Cover art** — displayed on the player bar and in the track list

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

On first launch, click **Add folder** and point the app at a directory of music files. The library scanner runs automatically.

### Build installer (Windows)

```bash
npm run build
# outputs: hub/dist/Media Player Setup 1.8.0.exe
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
  build/          # App icons
```

## Notes

- Library database is stored in `%APPDATA%/tb-media-player` (Windows) — persists across updates
- Audio files are never copied or modified except when explicitly saving metadata changes
- M4A (AAC) and MP3 are both fully supported
