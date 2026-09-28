import { create } from 'zustand'
import { hub } from '@/lib/ipc'
import { stepsToNextUndecided, type SwipeVerdict } from '@/lib/swipe-core'
import { usePlayerStore } from './player'
import { useLibraryStore } from './library'

// Swipe mode: fill one tag song by song while music plays. Not persisted — "yes" lives in track_tags
// and "no" in tag_skips, both read once when the card opens. Closed = tagId null and empty sets, so
// nothing here costs anything until someone opens it.
interface SwipeState {
  tagId: number | null
  tagged: Set<number>
  skipped: Set<number>
  /** The song a "no" was said to when nothing undecided was left ahead of it. */
  nothingLeftFor: number | null
  error: string | null
  open: (tagId: number) => Promise<void>
  close: () => void
  decide: (verdict: SwipeVerdict, trackId: number) => Promise<void>
  resetSkips: () => Promise<void>
}

const EMPTY = { tagId: null, tagged: new Set<number>(), skipped: new Set<number>(), nothingLeftFor: null, error: null }

export const useSwipeStore = create<SwipeState>((set, get) => ({
  ...EMPTY,

  open: async (tagId) => {
    set({ ...EMPTY, tagId })
    try {
      const { taggedIds, skippedIds } = await hub.getSwipeState(tagId)
      // Switched to another tag (or closed) while this was loading.
      if (get().tagId !== tagId) return
      set({ tagged: new Set(taggedIds), skipped: new Set(skippedIds) })
    } catch (e) {
      if (get().tagId === tagId) set({ error: e instanceof Error ? e.message : String(e) })
    }
  },

  close: () => set(EMPTY),

  // `trackId` is the song the card was showing when the user decided, not whatever is current
  // by the time the write lands, so a song change mid-click can't tag the wrong song.
  decide: async (verdict, trackId) => {
    const { tagId } = get()
    if (tagId === null) return
    set({ error: null })
    try {
      if (verdict === 'yes') {
        // Yes never advances: the song keeps playing, now tagged.
        if (get().tagged.has(trackId)) return
        await hub.addTrackToTag(tagId, trackId)
        if (get().tagId !== tagId) return
        const skipped = new Set(get().skipped)
        skipped.delete(trackId)
        set({ tagged: new Set(get().tagged).add(trackId), skipped })
        useLibraryStore.getState().bumpTagEpoch()
        return
      }
      // Swipe never removes a tag: "no" on a tagged song writes nothing and just moves on.
      if (!get().tagged.has(trackId) && !get().skipped.has(trackId)) {
        await hub.skipTrackForTag(tagId, trackId)
        if (get().tagId !== tagId) return
        set({ skipped: new Set(get().skipped).add(trackId) })
      }
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) })
      return
    }

    // Advance only if that song is still the one playing — this also makes a double-click harmless.
    const player = usePlayerStore.getState()
    if (player.currentTrack()?.id !== trackId) return
    const { tagged, skipped } = get()
    const decided = new Set([...tagged, ...skipped])
    const upcoming = [
      ...player.upNext.map((t) => t.id),
      ...player.activeQueue().slice(player.queueIndex + 1).map((t) => t.id),
    ]
    const n = stepsToNextUndecided(upcoming, decided)
    if (n === null) {
      set({ nothingLeftFor: trackId })
      return
    }
    // Back to back with no await in between: React batches them into one render, so PlayerBar's
    // track effect only ever loads the destination song — the jumped-over ones never start.
    for (let i = 0; i < n; i++) usePlayerStore.getState().next()
  },

  resetSkips: async () => {
    const { tagId } = get()
    if (tagId === null) return
    try {
      await hub.clearTagSkips(tagId)
      if (get().tagId === tagId) set({ skipped: new Set(), nothingLeftFor: null })
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) })
    }
  },
}))
