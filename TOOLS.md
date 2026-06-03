# Tools

TerraPlayer bundles a set of lightweight in-app **tools** — utilities and little games — reachable from the
**TOOLS** bar at the bottom of the sidebar. Clicking it opens a grid of unlabelled, theme-aware icons; pick
one and it opens in a framed overlay (with a fullscreen toggle).

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
| **2048** | The tile game — arrows/WASD, score + best. |
| **Snake** | Canvas snake — arrows/WASD, pause, score + best. |
| **Minesweeper** | Beginner/Intermediate, first-click-safe, flags, timer, mine counter. |
| **Tic-Tac-Toe** | Vs. an unbeatable minimax AI; score tally. |

## Architecture

Everything lives under `src/components/tools/`:

| File | Role |
|---|---|
| `types.ts` | `ToolProps` (the `{ fullscreen }` contract) + the `ToolId` union |
| `registry.tsx` | `TOOLS: ToolDef[]` — `{ id, title, hint, icon, Component }`. The dock grid and the overlay host both read this. |
| `Shell.tsx` | The framed overlay window (title bar, fullscreen toggle, close, Esc) every tool renders inside |
| `shared.tsx` | Theme-aware primitives — `ToolButton`, `Readout`, `SegmentedButton`, `TextTab`, `NumberField`, input styles |
| `<Tool>.tsx` | One component per tool, `export default function Tool({ fullscreen }: ToolProps)` |

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
