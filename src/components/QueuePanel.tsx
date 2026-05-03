import React, { useRef, useState } from 'react'
import { X, GripVertical, Music } from 'lucide-react'
import { usePlayerStore } from '@/store/player'
import { fmtDuration } from '@/lib/ipc'
import type { Track } from '@/lib/ipc'

type QueueSection = 'upNext' | 'comingUp'

export default function QueuePanel() {
  const {
    upNext, removeFromUpNext, moveFutureTrack, clearUpNext,
    currentTrack, activeQueue, queueIndex,
  } = usePlayerStore()

  const dragItem = useRef<{ section: QueueSection; index: number } | null>(null)
  const [dragOver, setDragOver] = useState<string | null>(null)

  const current = currentTrack()
  const aq = activeQueue()
  const remaining = aq.slice(queueIndex + 1)

  function dropKey(section: QueueSection, index: number) {
    return `${section}-${index}`
  }

  function handleDragStart(section: QueueSection, index: number) {
    dragItem.current = { section, index }
  }

  function handleDragOver(e: React.DragEvent, section: QueueSection, index: number) {
    e.preventDefault()
    setDragOver(dropKey(section, index))
  }

  function handleDrop(section: QueueSection, index: number) {
    if (dragItem.current) {
      moveFutureTrack(dragItem.current, { section, index })
    }
    dragItem.current = null
    setDragOver(null)
  }

  function handleDragEnd() {
    dragItem.current = null
    setDragOver(null)
  }

  return (
    <aside className="w-64 flex-shrink-0 bg-surface-300 border-l border-white/[0.05] flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-white/[0.05] flex items-center justify-between flex-shrink-0">
        <h3 className="text-[10px] font-medium uppercase tracking-[0.1em] text-muted/50">Queue</h3>
        {upNext.length > 0 && (
          <button
            onClick={clearUpNext}
            className="text-[10px] text-muted/30 hover:text-muted/70 transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Now playing */}
        {current && (
          <div className="px-3 pt-3 pb-2">
            <p className="text-[9px] font-mono text-muted/30 uppercase tracking-[0.12em] mb-2">Now playing</p>
            <QueueRow track={current} isCurrent />
          </div>
        )}

        {/* Up Next */}
        <div className="px-3 pt-1 pb-2">
          <p className="text-[9px] font-mono text-muted/30 uppercase tracking-[0.12em] mb-2">Up next</p>
          {upNext.length > 0 ? (
            upNext.map((track, i) => (
              <div
                key={`upnext-${track.id}-${i}`}
                draggable
                onDragStart={() => handleDragStart('upNext', i)}
                onDragOver={(e) => handleDragOver(e, 'upNext', i)}
                onDrop={() => handleDrop('upNext', i)}
                onDragEnd={handleDragEnd}
                className={`flex items-center gap-1.5 py-1 pl-0.5 pr-1 rounded-lg transition-colors ${
                  dragOver === dropKey('upNext', i) ? 'bg-white/[0.09]' : 'hover:bg-white/[0.04]'
                }`}
              >
                <GripVertical size={11} className="text-muted/20 flex-shrink-0 cursor-grab" />
                <QueueRow track={track} />
                <button
                  onClick={() => removeFromUpNext(i)}
                  className="flex-shrink-0 text-muted/20 hover:text-muted/60 transition-colors"
                >
                  <X size={11} />
                </button>
              </div>
            ))
          ) : (
            <div
              onDragOver={(e) => handleDragOver(e, 'upNext', 0)}
              onDrop={() => handleDrop('upNext', 0)}
              className={`rounded-lg border border-dashed px-2 py-3 text-center text-[10px] transition-colors ${
                dragOver === dropKey('upNext', 0)
                  ? 'border-aero-aqua/35 bg-aero-aqua/10 text-aero-aqua/70'
                  : 'border-white/[0.06] text-muted/25'
              }`}
            >
              Drop here to play next
            </div>
          )}
        </div>

        {/* Coming up */}
        {(remaining.length > 0 || upNext.length > 0) && (
          <div className="px-3 pt-1 pb-3">
            <p className="text-[9px] font-mono text-muted/30 uppercase tracking-[0.12em] mb-2">Coming up</p>
            {remaining.map((track, i) => (
              <div
                key={`next-${track.id}-${i}`}
                draggable
                onDragStart={() => handleDragStart('comingUp', i)}
                onDragOver={(e) => handleDragOver(e, 'comingUp', i)}
                onDrop={() => handleDrop('comingUp', i)}
                onDragEnd={handleDragEnd}
                className={`flex items-center gap-1.5 rounded-lg py-1 pl-0.5 pr-1 transition-colors ${
                  dragOver === dropKey('comingUp', i) ? 'bg-white/[0.09]' : 'hover:bg-white/[0.04]'
                }`}
              >
                <GripVertical size={11} className="text-muted/20 flex-shrink-0 cursor-grab" />
                <QueueRow track={track} dim />
              </div>
            ))}
            {remaining.length === 0 && (
              <div
                onDragOver={(e) => handleDragOver(e, 'comingUp', 0)}
                onDrop={() => handleDrop('comingUp', 0)}
                className={`rounded-lg border border-dashed px-2 py-3 text-center text-[10px] transition-colors ${
                  dragOver === dropKey('comingUp', 0)
                    ? 'border-aero-sky/35 bg-aero-sky/10 text-aero-sky/70'
                    : 'border-white/[0.06] text-muted/25'
                }`}
              >
                Drop here for later
              </div>
            )}
          </div>
        )}

        {upNext.length === 0 && remaining.length === 0 && !current && (
          <div className="flex items-center justify-center h-32 text-muted/25 text-[11px]">
            Queue is empty
          </div>
        )}
      </div>
    </aside>
  )
}

function QueueRow({
  track,
  isCurrent,
  dim,
}: {
  track: Pick<Track, 'title' | 'artist' | 'coverDataUrl' | 'duration'>
  isCurrent?: boolean
  dim?: boolean
}) {
  return (
    <div className={`flex items-center gap-2 min-w-0 flex-1 ${dim ? 'opacity-40' : ''}`}>
      <div className="w-7 h-7 rounded flex-shrink-0 bg-white/[0.05] overflow-hidden">
        {track.coverDataUrl ? (
          <img src={track.coverDataUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Music size={10} className="text-muted/20" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className={`text-[11px] font-medium truncate leading-tight ${isCurrent ? 'text-accent' : 'text-white/75'}`}>
          {track.title || '—'}
        </p>
        <p className="text-[10px] text-muted/40 truncate">{track.artist || '—'}</p>
      </div>
      <span className="text-[10px] text-muted/25 font-mono flex-shrink-0 tabular-nums">
        {fmtDuration(track.duration)}
      </span>
    </div>
  )
}
