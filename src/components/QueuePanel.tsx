import React, { useRef, useState } from 'react'
import { X, GripVertical, Music } from 'lucide-react'
import { usePlayerStore } from '@/store/player'
import { fmtDuration } from '@/lib/ipc'
import type { Track } from '@/lib/ipc'
import { windowComingUp, COMING_UP_WINDOW } from '@/lib/queue'
import VectorGridCover from './VectorGridCover'

type QueueSection = 'upNext' | 'comingUp'

export default function QueuePanel() {
  const {
    upNext, removeFromUpNext, moveFutureTrack, clearUpNext,
    currentTrack, activeQueue, queueIndex,
  } = usePlayerStore()

  const dragItem = useRef<{ section: QueueSection; index: number } | null>(null)
  const [dragOver, setDragOver] = useState<string | null>(null)
  // Render only a bounded window of "Coming Up" — the queue can be the whole
  // library, and rendering every row spikes memory. Resets to the default each
  // time the panel mounts (open/close); "show more" expands it on demand.
  const [limit, setLimit] = useState(COMING_UP_WINDOW)

  const current = currentTrack()
  const aq = activeQueue()
  const remaining = aq.slice(queueIndex + 1)
  const { shown: shownRemaining, hidden: hiddenCount } = windowComingUp(remaining, limit)

  function dropKey(section: QueueSection, index: number) {
    return `${section}-${index}`
  }

  function handleDragStart(section: QueueSection, index: number) {
    dragItem.current = { section, index }
  }

  // dragover stops propagation so an internal reorder doesn't flash App's
  // "drop songs to index" overlay. drop deliberately does NOT: App's handler is a
  // no-op for a reorder (no files on the DataTransfer) and it's what clears that
  // overlay — and a song dragged from Explorer onto a queue row still has to
  // reach the library. preventDefault stays on both, or Chromium handles the drop.
  function handleDragOver(e: React.DragEvent, section: QueueSection, index: number) {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(dropKey(section, index))
  }

  function handleDrop(e: React.DragEvent, section: QueueSection, index: number) {
    e.preventDefault()
    if (dragItem.current) moveFutureTrack(dragItem.current, { section, index })
    dragItem.current = null
    setDragOver(null)
  }

  function handleDragEnd() {
    dragItem.current = null
    setDragOver(null)
  }

  return (
    <aside
      className="w-64 flex-shrink-0 flex flex-col overflow-hidden"
      style={{ borderLeft: '1px solid rgb(var(--accent-rgb) / 0.18)', background: 'var(--bg-1)' }}
    >
      <div
        className="px-4 py-3 flex items-center justify-between flex-shrink-0"
        style={{ borderBottom: '1px solid rgb(var(--accent-rgb) / 0.10)' }}
      >
        <h3 className="font-mono text-[9px] uppercase tracking-[2px]" style={{ color: 'var(--accent2)' }}>QUEUE</h3>
        {upNext.length > 0 && (
          <button
            onClick={clearUpNext}
            className="font-term text-[11px] transition-opacity hover:opacity-70"
            style={{ color: 'rgb(var(--ink-rgb) / 0.30)' }}
          >
            clear
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {current && (
          <div className="px-3 pt-3 pb-2">
            <p className="font-mono text-[9px] uppercase tracking-[2px] mb-2" style={{ color: 'var(--accent2)' }}>
              NOW PLAYING
            </p>
            <QueueRow track={current} isCurrent />
          </div>
        )}

        <div className="px-3 pt-1 pb-2">
          <p className="font-mono text-[9px] uppercase tracking-[2px] mb-2" style={{ color: 'var(--accent2)' }}>
            UP NEXT
          </p>
          {upNext.length > 0 ? (
            upNext.map((track, i) => (
              <div
                key={`upnext-${track.id}-${i}`}
                draggable
                onDragStart={() => handleDragStart('upNext', i)}
                onDragOver={(e) => handleDragOver(e, 'upNext', i)}
                onDrop={(e) => handleDrop(e, 'upNext', i)}
                onDragEnd={handleDragEnd}
                className="flex items-center gap-1.5 py-1 pl-0.5 pr-1 transition-colors"
                style={{
                  background: dragOver === dropKey('upNext', i) ? 'rgb(var(--accent-rgb) / 0.08)' : undefined,
                  borderLeft: dragOver === dropKey('upNext', i) ? '2px solid var(--accent)' : '2px solid transparent',
                }}
              >
                <GripVertical size={11} className="flex-shrink-0 cursor-grab" style={{ color: 'rgb(var(--ink-rgb) / 0.20)' }} />
                <QueueRow track={track} />
                <button
                  onClick={() => removeFromUpNext(i)}
                  className="flex-shrink-0 transition-opacity hover:opacity-70"
                  style={{ color: 'rgb(var(--ink-rgb) / 0.20)' }}
                >
                  <X size={11} />
                </button>
              </div>
            ))
          ) : (
            <div
              onDragOver={(e) => handleDragOver(e, 'upNext', 0)}
              onDrop={(e) => handleDrop(e, 'upNext', 0)}
              className="px-2 py-3 text-center font-term text-[12px] transition-colors"
              style={{
                border: dragOver === dropKey('upNext', 0)
                  ? '1px dashed rgb(var(--accent-rgb) / 0.55)'
                  : '1px dashed rgb(var(--accent-rgb) / 0.15)',
                color: dragOver === dropKey('upNext', 0)
                  ? 'rgb(var(--accent-rgb) / 0.70)'
                  : 'rgb(var(--ink-rgb) / 0.25)',
                background: dragOver === dropKey('upNext', 0) ? 'rgb(var(--accent-rgb) / 0.06)' : undefined,
              }}
            >
              drop here to play next
            </div>
          )}
        </div>

        {(remaining.length > 0 || upNext.length > 0) && (
          <div className="px-3 pt-1 pb-3">
            <p className="font-mono text-[9px] uppercase tracking-[2px] mb-2" style={{ color: 'var(--accent2)' }}>
              COMING UP
            </p>
            {shownRemaining.map((track, i) => (
              <div
                key={`next-${track.id}-${i}`}
                draggable
                onDragStart={() => handleDragStart('comingUp', i)}
                onDragOver={(e) => handleDragOver(e, 'comingUp', i)}
                onDrop={(e) => handleDrop(e, 'comingUp', i)}
                onDragEnd={handleDragEnd}
                className="flex items-center gap-1.5 py-1 pl-0.5 pr-1 transition-colors"
                style={{
                  background: dragOver === dropKey('comingUp', i) ? 'rgb(var(--accent-rgb) / 0.08)' : undefined,
                  borderLeft: dragOver === dropKey('comingUp', i) ? '2px solid var(--accent)' : '2px solid transparent',
                }}
              >
                <GripVertical size={11} className="flex-shrink-0 cursor-grab" style={{ color: 'rgb(var(--ink-rgb) / 0.20)' }} />
                <QueueRow track={track} dim />
              </div>
            ))}
            {hiddenCount > 0 && (
              <button
                onClick={() => setLimit((l) => l + COMING_UP_WINDOW)}
                className="w-full mt-1 py-1.5 font-term text-[11px] tracking-[0.5px] transition-opacity hover:opacity-80"
                style={{
                  color: 'rgb(var(--accent-rgb) / 0.65)',
                  border: '1px dashed rgb(var(--accent-rgb) / 0.20)',
                }}
                title={`${remaining.length} tracks queued — showing ${shownRemaining.length}`}
              >
                show {Math.min(hiddenCount, COMING_UP_WINDOW)} more
                <span style={{ color: 'rgb(var(--ink-rgb) / 0.30)' }}> · {hiddenCount} hidden</span>
              </button>
            )}
            {remaining.length === 0 && (
              <div
                onDragOver={(e) => handleDragOver(e, 'comingUp', 0)}
                onDrop={(e) => handleDrop(e, 'comingUp', 0)}
                className="px-2 py-3 text-center font-term text-[12px] transition-colors"
                style={{
                  border: dragOver === dropKey('comingUp', 0)
                    ? '1px dashed rgb(var(--accent2-rgb) / 0.55)'
                    : '1px dashed rgb(var(--accent-rgb) / 0.15)',
                  color: dragOver === dropKey('comingUp', 0)
                    ? 'rgb(var(--accent2-rgb) / 0.70)'
                    : 'rgb(var(--ink-rgb) / 0.25)',
                  background: dragOver === dropKey('comingUp', 0) ? 'rgb(var(--accent2-rgb) / 0.06)' : undefined,
                }}
              >
                drop here for later
              </div>
            )}
          </div>
        )}

        {upNext.length === 0 && remaining.length === 0 && !current && (
          <div className="flex items-center justify-center h-32 font-term text-[12px]" style={{ color: 'rgb(var(--ink-rgb) / 0.25)' }}>
            queue is empty
          </div>
        )}
      </div>
    </aside>
  )
}

// Memoised: dragging toggles the panel's dragOver state on every pointer move,
// which would otherwise re-render (and re-rasterise the SVG cover of) every row.
const QueueRow = React.memo(function QueueRow({
  track,
  isCurrent,
  dim,
}: {
  track: Pick<Track, 'title' | 'artist' | 'coverUrl' | 'duration'>
  isCurrent?: boolean
  dim?: boolean
}) {
  return (
    <div className={`flex items-center gap-2 min-w-0 flex-1 ${dim ? 'opacity-40' : ''}`}>
      <VectorGridCover src={track.coverUrl} size={28} />
      <div className="min-w-0 flex-1">
        <p
          className={`font-term text-[12px] truncate leading-tight ${isCurrent ? 'phosphor-glow' : ''}`}
          style={{ color: isCurrent ? 'var(--accent)' : 'rgb(var(--ink-rgb) / 0.75)' }}
        >
          {isCurrent ? '▶ ' : ''}{track.title || '—'}
        </p>
        <p className="font-term text-[11px] truncate" style={{ color: 'rgb(var(--ink-rgb) / 0.40)' }}>
          {track.artist || '—'}
        </p>
      </div>
      <span className="font-term text-[11px] flex-shrink-0 tabular-nums" style={{ color: 'rgb(var(--ink-rgb) / 0.25)' }}>
        {fmtDuration(track.duration)}
      </span>
    </div>
  )
})
