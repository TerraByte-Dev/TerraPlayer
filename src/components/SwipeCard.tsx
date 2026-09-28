import React, { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import VectorGridCover from './VectorGridCover'
import { usePlayerStore } from '@/store/player'
import { useLibraryStore } from '@/store/library'
import { useSwipeStore } from '@/store/swipe'
import { swipeVerdict, type SwipeVerdict } from '@/lib/swipe-core'

// Swipe mode: a small floating card that follows whatever is playing. Right (or #tag, or →) adds the
// song to the tag and it keeps playing; left (or X, or ←) passes and jumps to the next undecided song.
// Mounted only while open (App.tsx), and it never subscribes to the 4 Hz currentTime tick.
function SwipeCard() {
  const tagId = useSwipeStore((s) => s.tagId)
  const tagged = useSwipeStore((s) => s.tagged)
  const skipped = useSwipeStore((s) => s.skipped)
  const nothingLeftFor = useSwipeStore((s) => s.nothingLeftFor)
  const error = useSwipeStore((s) => s.error)
  const { decide, close, resetSkips } = useSwipeStore.getState()
  // currentTrack() returns the Track object held in the queue, so this only changes with the song.
  const track = usePlayerStore((s) => s.currentTrack())
  const tag = useLibraryStore((s) => s.tags.find((t) => t.id === tagId))

  const cardRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ pointerId: number; x0: number; trackId: number } | null>(null)

  useEffect(() => { cardRef.current?.focus() }, [tagId])

  // The tag was deleted (from the sidebar or anywhere else): nothing left to fill.
  useEffect(() => { if (!tag) close() }, [tag, close])

  if (!tag) return null

  const status = !track ? null : tagged.has(track.id) ? 'TAGGED' : skipped.has(track.id) ? 'SKIPPED' : null

  function judge(verdict: SwipeVerdict) {
    if (track) decide(verdict, track.id)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return // Shift+←/→ stay prev/next
    const verdict = e.key === 'ArrowLeft' ? 'no' : e.key === 'ArrowRight' ? 'yes' : null
    if (!verdict && e.key !== 'Escape') return
    // Keep ←/→/Esc from reaching PlayerBar's window listener (seek) while the card holds the keys.
    e.preventDefault()
    e.stopPropagation()
    if (verdict) judge(verdict)
    else close()
  }

  // Drag writes the transform straight to the element — no React state per pointermove.
  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0 || !track) return
    e.currentTarget.setPointerCapture(e.pointerId)
    e.currentTarget.style.transition = 'none'
    dragRef.current = { pointerId: e.pointerId, x0: e.clientX, trackId: track.id }
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = dragRef.current
    if (!d || d.pointerId !== e.pointerId) return
    const dx = e.clientX - d.x0
    e.currentTarget.style.transform = `translateX(${dx}px) rotate(${dx / 24}deg)`
  }

  function endDrag(e: React.PointerEvent<HTMLDivElement>, cancelled: boolean) {
    const d = dragRef.current
    if (!d || d.pointerId !== e.pointerId) return
    dragRef.current = null
    const el = e.currentTarget
    // Snap back through the CSS transition (instant under Reduce motion). Nothing waits on
    // transitionend, which never fires at 0s.
    el.style.transition = ''
    el.style.transform = ''
    const verdict = cancelled ? null : swipeVerdict(e.clientX - d.x0, el.offsetWidth)
    if (verdict) decide(verdict, d.trackId)
  }

  // The buttons never take focus, so the card keeps the keys and Space still reaches PlayerBar.
  const keepFocus = (e: React.MouseEvent) => e.preventDefault()
  const disabled = !track

  return (
    <div
      ref={cardRef}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      className="group fixed right-4 z-40 flex flex-col outline-none"
      style={{
        // Above the player bar and clear of the pencil button (bottom 92px, 28px tall).
        bottom: 'calc(80px + 12px + 28px + 8px)',
        width: 260,
        background: 'var(--bg-1)',
        border: '1px solid rgb(var(--accent-rgb) / 0.45)',
        boxShadow: '0 0 24px rgb(var(--accent-rgb) / 0.15)',
      }}
    >
      <header
        className="flex items-center gap-1.5 px-2.5 h-8 border-b"
        style={{ borderColor: 'rgb(var(--accent-rgb) / 0.18)', background: 'rgba(0,0,0,0.35)' }}
      >
        <span className="font-mono flex-shrink-0 text-[9px] uppercase tracking-[0.22em]" style={{ color: 'var(--accent)' }}>
          Swipe ▸
        </span>
        <span className="font-term min-w-0 flex-1 truncate text-[12px]" style={{ color: 'var(--ink)' }} title={`#${tag.name}`}>
          #{tag.name}
        </span>
        {/* Says who has ←/→ — the card only while it's focused, otherwise they still seek. */}
        <span
          className="font-mono flex-shrink-0 text-[8px] uppercase tracking-[0.16em] hidden group-focus-within:inline"
          style={{ color: 'var(--accent2)' }}
          title="← / → judge the song, Esc closes"
        >
          KEYS ▸ SWIPE
        </span>
        <span
          className="font-mono flex-shrink-0 text-[8px] uppercase tracking-[0.16em] group-focus-within:hidden"
          style={{ color: 'rgb(var(--ink-rgb) / 0.28)' }}
          title="Keys go to the app — click the card to swipe with ← / →"
        >
          KEYS ▸ APP
        </span>
        <button onMouseDown={keepFocus} onClick={close} title="Close (Esc)" className="metal-key h-6 w-6 flex-shrink-0 justify-center">
          <X size={12} />
        </button>
      </header>

      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => endDrag(e, false)}
        onPointerCancel={(e) => endDrag(e, true)}
        className="flex items-center gap-3 p-3 select-none transition-transform duration-200"
        style={{ touchAction: 'none', cursor: track ? 'grab' : 'default' }}
      >
        <VectorGridCover src={track?.coverUrl} label={track ? `A:${track.id}` : 'A:---'} size={56} />
        <div className="min-w-0 flex-1">
          {track ? (
            <>
              <p className="font-term text-[14px] truncate leading-tight" style={{ color: 'var(--accent)' }} title={track.title || undefined}>
                {track.title || '—'}
              </p>
              <p className="font-term text-[12px] truncate" style={{ color: 'rgb(var(--ink-rgb) / 0.55)' }} title={track.artist || undefined}>
                {track.artist || '—'}
              </p>
              {status && (
                <span
                  className="inline-block mt-1 px-1 font-mono text-[9px] tracking-[1px]"
                  style={{
                    color: status === 'TAGGED' ? 'var(--bg-0)' : 'rgb(var(--ink-rgb) / 0.6)',
                    background: status === 'TAGGED' ? 'var(--accent)' : 'transparent',
                    border: status === 'TAGGED' ? '1px solid var(--accent)' : '1px solid rgb(var(--ink-rgb) / 0.3)',
                  }}
                >
                  {status}
                </span>
              )}
            </>
          ) : (
            <p className="font-term text-[12px] leading-snug" style={{ color: 'rgb(var(--ink-rgb) / 0.55)' }}>
              Play something — shuffle works best
            </p>
          )}
        </div>
      </div>

      {track && nothingLeftFor === track.id && (
        <p className="px-3 pb-2 font-term text-[11px]" style={{ color: 'var(--accent2)' }}>
          Nothing left to judge in this queue
        </p>
      )}
      {error && (
        <p className="px-3 pb-2 font-term text-[11px] truncate" style={{ color: '#ff6b6b' }} title={error}>
          {error}
        </p>
      )}

      <footer className="flex items-center gap-2 px-2.5 pb-2.5">
        <button
          onMouseDown={keepFocus}
          onClick={() => judge('no')}
          disabled={disabled}
          title="Pass (←) — jump to the next song you haven't judged"
          className="metal-key h-8 w-10 flex-shrink-0 justify-center"
          style={{ opacity: disabled ? 0.4 : 1 }}
        >
          <X size={14} />
        </button>
        <span className="flex-1 min-w-0 text-center font-term text-[11px] truncate" style={{ color: 'rgb(var(--ink-rgb) / 0.4)' }}>
          {skipped.size} skipped ·{' '}
          <button
            onMouseDown={keepFocus}
            onClick={resetSkips}
            disabled={skipped.size === 0}
            title="Forget every song passed on for this tag"
            className="underline disabled:no-underline disabled:cursor-default"
          >
            reset
          </button>
        </span>
        <button
          onMouseDown={keepFocus}
          onClick={() => judge('yes')}
          disabled={disabled}
          title={`Add to #${tag.name} (→) — the song keeps playing`}
          className="metal-key is-primary h-8 max-w-[110px] px-2 flex-shrink-0 justify-center"
          style={{ opacity: disabled ? 0.4 : 1 }}
        >
          <span className="truncate font-term text-[12px]">#{tag.name}</span>
        </button>
      </footer>
    </div>
  )
}

// Memoized: it takes no props, and App re-renders on every playback tick (it reads the whole player
// store). Without this the card would re-render 4×/sec along with it; its own selectors only fire on a
// song change or a decision.
export default React.memo(SwipeCard)
