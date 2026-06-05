# Screenshots

Captured live from the app for the root `README.md`. Drop the PNGs here with these exact names.

## Shots

| File | View | What to show |
|---|---|---|
| `visualizer.png` | **Fullscreen visualizer** (hero, full-width) | Pop out / go fullscreen with **music playing** so the spectrum bars, radial ring, and vector grid are lit. The money shot. |
| `library.png` | **Library / track list** | The main window: sidebar (playlists/tags + MEDIA.DRIVE stats), a populated track list, the player bar with a track playing + the mini spectrum. |
| `audio.png` | **Settings → Audio** | The **10-band graphic EQ** with a non-flat preset selected (e.g. Rock), pre-amp + mono, and the Crossfade/Speed controls visible. *(Capture on a build that includes the audio update — PR #13.)* |
| `themes.png` | **Settings → Appearance** | The theme picker, ideally mid-recolor so a couple of the phosphor themes are visible. |
| `downloader.png` | **Add Music → downloader** | The preview step: a few resolved rows with the colour-coded confidence badges + source chips. |

## Capture settings

- **Format:** PNG. Capture the **app window** (the custom phosphor title bar is part of the look — keep it; skip the OS chrome / desktop).
- **Consistency:** same window size across shots (≈ **1280 × 820** works well) and the default **Mainframe** green theme — except `themes.png`, which shows the recolors.
- **Make it look alive:** have a real track playing for `library.png` and `visualizer.png` so the spectrum/visualizer are active; pick a track *with* cover art for `library.png`.
- **Resolution:** capture at the real device-pixel size (don't upscale). GitHub renders the hero at 100% width and the grid at ~50% each, so crisp full-res shots look best.
- **Trim:** tight crop to the window edges; no large empty margins.

> Tooling: Windows **Snipping Tool** (Win+Shift+S) window-capture is fine. For pixel-exact window grabs, ShareX "Capture → Window" works great.
