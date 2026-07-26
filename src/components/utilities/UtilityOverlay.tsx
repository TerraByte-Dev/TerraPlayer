import Shell from '../tools/Shell'
import { getTool } from '../tools/registry'
import type { UtilityMode } from './UtilityDock'

// Thin host: looks up the active tool in the registry and renders it inside the framed Shell. Only one tool
// is mounted at a time (it unmounts on close), keeping resident memory low.
export default function UtilityOverlay({ mode, fullscreen, onClose, onFullscreenChange }: {
  mode: UtilityMode
  fullscreen: boolean
  onClose: () => void
  onFullscreenChange: (fullscreen: boolean) => Promise<void>
}) {
  const tool = getTool(mode)
  const Tool = tool.Component
  return (
    <Shell title={tool.title} fullscreen={fullscreen} onClose={onClose} onFullscreenChange={onFullscreenChange}>
      <Tool fullscreen={fullscreen} />
    </Shell>
  )
}
