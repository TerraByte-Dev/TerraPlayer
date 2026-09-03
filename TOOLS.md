# Tools

TerraPlayer bundles a set of lightweight in-app **tools** — utilities and little games — reachable from the
**TOOLS** bar at the bottom of the sidebar. Clicking it opens a grid of unlabelled, theme-aware icons; pick
one and it opens in a framed overlay (with a fullscreen toggle).

The four games are not in that grid. They live behind the single **ARCADE** tile, in a cabinet that
floats over the app instead of covering it — see [The arcade](#the-arcade) below.

```
sidebar ▸ [ 🔧 TOOLS ⌃ ]
            └─ popover grid (icons only, tooltips on hover) ─┐
                                                              ▼
                              ┌──────── Shell (overlay) ────────┐
                              │  title · ⛶ fullscreen · ✕ close │
                              │            <Tool />             │
                              └─────────────────────────────────┘
```

## The tool set

| Tool | What it does |
|---|---|
| **Dry-Erase Board** | Brush / eraser / flood-fill, 9-color palette, size, **undo/redo**, save to PNG. Keyboard: `B`/`E`/`F`, `Ctrl+Z`/`Ctrl+Shift+Z`, `[` / `]`. |
| **Timer Tools** | Countdown timer (with a song/stop alarm action), stopwatch with laps, and a multi-zone world clock. |
| **Random Number** | Coin flip, dice, or 1–N with a roll animation. |
| **Calculator** | Safe expression evaluator (no `eval`): precedence, parentheses, %, exponent, unary minus. Full keyboard. |
| **Metronome** | Web-Audio click with accented downbeat, 30–300 BPM, time signature, tap tempo, pulsing beat dots. |
| **Scratchpad** | A persistent terminal notepad (debounced autosave) with live char/word/line counts. |

## The arcade

One **ARCADE** tile in the dock opens a cabinet holding all four games — a cartridge rail down the left
switches between them, and only the one you're playing is mounted.

| Game | What it does |
|---|---|
| **2048** | The tile game — arrows/WASD, score + best. |
| **Snake** | Canvas snake — arrows/WASD, pause, score + best. |
| **Minesweeper** | Beginner/Intermediate, first-click-safe, flags, timer, mine counter. |
| **Tic-Tac-Toe** | Vs. an unbeatable minimax AI; score tally. |

```
sidebar ▸ [ 🔧 TOOLS ⌃ ] ▸ [🎮]
   ┌─ ARCADE / Snake ────── KEYS ▸ GAME ── ⛶ ✕ ─┐  ← marquee: drag here
   │ 2048  │                                    │
   │ SNAKE │            <Game />                │
   │ MINES │                                    │
   │ T-T-T │                                    │
   ├────────────────────────────────────────────┤
   │ ⏮ ⏯ ⏭   track · 1:12 / 3:40    🔊 ──○  ⚙  │  ← deck
   └────────────────────────────────────────────┘
```

Unlike the tool `Shell`, the cabinet is **not modal**. It has no backdrop, you drag it by its marquee, and
the app underneath stays clickable — so a game can sit in the corner while you browse your library.

**Focus decides who gets the keyboard.** The games bind arrows and Space; so does the transport. While the
cabinet is focused the game gets them and the marquee reads `KEYS ▸ GAME`; click away and it reads
`KEYS ▸ APP`, the game unbinds its listener entirely, and Space plays music again. That is why the cabinet
carries its own transport — the keys it borrows stay reachable by hand. Snake pauses itself when the cabinet
loses focus, so clicking away never costs a run.

**Fullscreen** takes the whole display and the game scales up into it. A low spectrum band — the same light
28-bar `Visualizer` the player bar runs — glows up from the bottom edge at 22% opacity behind the game:
enough to feel the music, not enough to compete with it. It stops on its own when playback pauses, and it
is hidden entirely under Reduce Motion.

The one setting (⚙ in the deck) turns that band off. Window position and the last game played are
remembered; the position is re-clamped on restore so the marquee is always reachable.

## Architecture

Everything lives under `src/components/tools/`:

| File | Role |
|---|---|
| `types.ts` | `ToolProps` — `{ fullscreen, active }` — plus the `ToolId` union (the six dock tools) |
| `registry.tsx` | `TOOLS: ToolDef[]` — `{ id, title, hint, icon, Component }`. The dock grid and the overlay host both read this. Games are **not** here. |
| `games.tsx` | `GAMES: GameDef[]` — the arcade's cartridge rack. Separate from the registry so `Arcade` can read it without an import cycle. |
| `Shell.tsx` | The framed overlay window (title bar, fullscreen toggle, close, Esc) every tool renders inside |
| `shared.tsx` | Theme-aware primitives — `ToolButton`, `Readout`, `SegmentedButton`, `TextTab`, `NumberField`, input styles |
| `<Tool>.tsx` | One component per tool, `export default function Tool({ fullscreen, active }: ToolProps)` |

A tool that binds keys on `window` **must skip binding entirely** when `active` is false, not merely return
early inside the handler — a game in an unfocused cabinet has to be deaf, or its keys fire under Settings
and under the library. The six dock tools are always active (their `Shell` is modal); only the arcade passes
`active` through.

The cabinet itself lives in `src/components/arcade/`:

| File | Role |
|---|---|
| `Arcade.tsx` | The floating window — marquee/drag, cartridge rail, screen, deck, focus contract |
| `../../lib/arcade-window.ts` | Pure geometry: `clampWindow` keeps the marquee reachable (never under the 30px title bar, where Windows paints its caption buttons over web content, and never past the bottom edge). Unit-tested. |
| `../../store/arcade.ts` | Persisted last game, window position, and the spectrum toggle |

Pure, DOM-free logic lives in `src/lib/tools/<name>.ts` (calculator, metronome, game2048, snake, minesweeper,
tictactoe, notes) and is unit-tested in `src/lib/tools/__tests__/*.test.mjs`. Randomness is injected
(`rng: () => number`) so the tests are deterministic.

`src/components/utilities/UtilityDock.tsx` renders the TOOLS bar + grid popover (portaled to `<body>`);
`src/components/utilities/UtilityOverlay.tsx` is the thin host that looks a tool up in the registry and renders
it inside the `Shell`.

### Adding a tool

1. (Optional) Add pure logic to `src/lib/tools/<name>.ts` + a `__tests__/<name>.test.mjs`.
2. Create `src/components/tools/<Tool>.tsx` implementing `ToolProps`.
3. Register it in `registry.tsx` (id in `types.ts`, then an entry in `TOOLS` with an icon + hint).

That's it — the grid and host pick it up automatically.

## Memory discipline

The app targets **< 300 MB** resident. Tools mount only while open and unmount on close, and every tool
cleans up after itself in `useEffect` returns: intervals/timeouts cleared, animation frames cancelled,
event listeners removed, and any `AudioContext` / `ResizeObserver` closed. No tool holds large buffers when
closed (the whiteboard caps its undo history; canvases are released on unmount).

## Tests

```bash
npm test   # node --test — includes every tool's pure-logic suite under src/lib/tools/__tests__/
```
