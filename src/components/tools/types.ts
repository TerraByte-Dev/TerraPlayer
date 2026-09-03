// The contract every tool implements. The overlay Shell supplies the framed window (title bar, close,
// fullscreen toggle); a tool just renders its body and is told whether it is currently fullscreen so it can
// scale its display. Tools mount only while open and must clean up timers / rafs / listeners on unmount
// (memory discipline — the whole app targets < 300 MB resident).

export interface ToolProps {
  fullscreen: boolean
  /**
   * Whether this tool currently owns the keyboard. The six dock tools open in a modal Shell
   * and are always active. A game in the arcade is not: its cabinet floats over a still-usable
   * app, so it only owns the keys while the cabinet is focused. A tool that binds keys on
   * `window` MUST skip binding entirely when this is false — a listener that merely returns
   * early still swallows nothing, but one that stays bound will fire under Settings and under
   * the library, moving tiles the user cannot see.
   */
  active?: boolean
}

// The dock's six tools. The four games moved behind the arcade — see `games.tsx`.
export type ToolId =
  | 'board'
  | 'timer'
  | 'rng'
  | 'calc'
  | 'metronome'
  | 'notes'
