import React from 'react'
import { Clock3, Dice5, PenLine } from 'lucide-react'

export type UtilityMode = 'board' | 'timer' | 'rng'

const TOOLS: Array<{ mode: UtilityMode; title: string; icon: React.ReactNode }> = [
  { mode: 'board', title: 'Dry erase board', icon: <PenLine size={14} strokeWidth={1.6} /> },
  { mode: 'timer', title: 'Timer tools', icon: <Clock3 size={14} strokeWidth={1.6} /> },
  { mode: 'rng', title: 'Random number generator', icon: <Dice5 size={14} strokeWidth={1.6} /> },
]

export default function UtilityDock({ onOpen }: { onOpen: (mode: UtilityMode) => void }) {
  return (
    <div className="px-3 pb-2">
      <div className="grid grid-cols-3 gap-1.5 rounded-lg border border-white/[0.04] bg-black/[0.08] p-1">
        {TOOLS.map((tool) => (
          <button
            key={tool.mode}
            onClick={() => onOpen(tool.mode)}
            title={tool.title}
            className="group relative flex h-8 items-center justify-center rounded-md border border-white/[0.035] bg-white/[0.018] text-muted/32 transition-colors hover:border-aero-aqua/14 hover:bg-white/[0.04] hover:text-aero-aqua/70"
          >
            {tool.icon}
          </button>
        ))}
      </div>
    </div>
  )
}
