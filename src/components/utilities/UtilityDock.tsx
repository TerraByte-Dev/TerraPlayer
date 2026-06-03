import React from 'react'
import { Clock3, Dice5, PenLine } from 'lucide-react'

export type UtilityMode = 'board' | 'timer' | 'rng'

const TOOLS: Array<{ mode: UtilityMode; title: string; icon: React.ReactNode }> = [
  { mode: 'board', title: 'Dry erase board', icon: <PenLine size={13} strokeWidth={1.6} /> },
  { mode: 'timer', title: 'Timer tools', icon: <Clock3 size={13} strokeWidth={1.6} /> },
  { mode: 'rng', title: 'Random number generator', icon: <Dice5 size={13} strokeWidth={1.6} /> },
]

export default function UtilityDock({ onOpen }: { onOpen: (mode: UtilityMode) => void }) {
  return (
    <div className="px-3 pb-2">
      <div className="grid grid-cols-3 gap-1.5 p-1" style={{ border: '1px solid rgb(var(--accent-rgb) / 0.12)', background: 'rgba(0,0,0,0.25)' }}>
        {TOOLS.map((tool) => (
          <button
            key={tool.mode}
            onClick={() => onOpen(tool.mode)}
            title={tool.title}
            className="metal-key h-7 justify-center"
          >
            {tool.icon}
          </button>
        ))}
      </div>
    </div>
  )
}
