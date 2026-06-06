import React, { useEffect, useState } from 'react'
import { Plus, Check, ListMusic } from 'lucide-react'
import { useLibraryStore } from '@/store/library'
import { hub } from '@/lib/ipc'
import { isInPlaylist, normalizeName } from '@/lib/library-core'

// Right-panel control: add the selected song to an existing playlist (or a new
// one). Reuses the existing addTrackToPlaylist / createPlaylist path; the only
// new IPC is the membership read that drives the "added" state + dedupe.
export default function AddToPlaylist() {
  const { selectedTrack, playlists, loadPlaylists } = useLibraryStore()
  const track = selectedTrack()

  const [open, setOpen] = useState(false)
  const [memberIds, setMemberIds] = useState<number[]>([])
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  // Clear stale membership/note the instant the selected track changes, so a slow
  // fetch can't briefly show the previous song's playlists.
  useEffect(() => {
    setMemberIds([])
    setNote(null)
  }, [track?.id])

  // (Re)fetch which playlists contain the track — keyed on `playlists` too, so an
  // add/remove from elsewhere (e.g. the TrackList right-click menu) re-syncs the
  // picker's "added" state instead of leaving it stale until the track changes.
  useEffect(() => {
    if (!track) return
    let cancelled = false
    hub.getPlaylistIdsForTrack(track.id).then((ids) => { if (!cancelled) setMemberIds(ids) })
    return () => { cancelled = true }
  }, [track?.id, playlists])

  if (!track) return null

  async function addToExisting(playlistId: number, name: string) {
    if (!track || busy || isInPlaylist(memberIds, playlistId)) return
    setBusy(true)
    setNote(null)
    try {
      await hub.addTrackToPlaylist(playlistId, track.id)
      setMemberIds((ids) => (ids.includes(playlistId) ? ids : [...ids, playlistId]))
      await loadPlaylists()
      setNote(`Added to ${name}`)
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Could not add to playlist')
    } finally {
      setBusy(false)
    }
  }

  async function createAndAdd() {
    const clean = normalizeName(newName)
    if (!clean || !track || busy) return
    setBusy(true)
    setNote(null)
    try {
      // createPlaylist resolves case-insensitively, so an existing name — even a
      // case variant — returns that playlist rather than spawning a duplicate; the
      // add below is idempotent (INSERT OR IGNORE) either way.
      const pl = await hub.createPlaylist(clean)
      await hub.addTrackToPlaylist(pl.id, track.id)
      setMemberIds((ids) => (ids.includes(pl.id) ? ids : [...ids, pl.id]))
      setNewName('')
      await loadPlaylists()
      setNote(`Added to ${pl.name}`)
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Could not create playlist')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="p-4 space-y-3">
      <p className="font-mono text-[9px] uppercase tracking-[2px]" style={{ color: 'var(--accent2)' }}>PLAYLISTS</p>

      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="metal-key w-full py-1.5 font-term text-[12px] tracking-[1px] flex items-center justify-center gap-1.5"
      >
        <Plus size={12} style={{ transform: open ? 'rotate(45deg)' : 'none', transition: 'transform 120ms' }} />
        add to playlist
      </button>

      {open && (
        <div className="space-y-2">
          {playlists.length > 0 && (
            <div className="max-h-44 overflow-y-auto flex flex-col gap-1 pr-0.5">
              {playlists.map((p) => {
                const member = isInPlaylist(memberIds, p.id)
                return (
                  <button
                    key={p.id}
                    onClick={() => addToExisting(p.id, p.name)}
                    disabled={member || busy}
                    title={member ? 'Already in this playlist' : `Add to ${p.name}`}
                    className="flex items-center gap-2 px-2 py-1 font-term text-[12px] text-left transition-colors disabled:cursor-default"
                    style={{
                      border: '1px solid rgb(var(--accent-rgb) / 0.20)',
                      background: member ? 'rgb(var(--accent-rgb) / 0.10)' : 'transparent',
                      color: member ? 'var(--accent)' : 'rgb(var(--ink-rgb) / 0.65)',
                      borderRadius: 0,
                    }}
                  >
                    {member ? <Check size={12} /> : <ListMusic size={12} style={{ opacity: 0.5 }} />}
                    <span className="flex-1 truncate">{p.name}</span>
                    {member && <span className="text-[10px]" style={{ opacity: 0.7 }}>added</span>}
                  </button>
                )
              })}
            </div>
          )}

          {/* Create a new playlist and drop the song straight in. */}
          <div className="flex gap-1.5">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && createAndAdd()}
              placeholder="new playlist..."
              className="flex-1 min-w-0 font-term text-[12px] px-2.5 py-1.5 outline-none transition-colors placeholder:opacity-30"
              style={{
                background: '#000',
                border: '1px solid rgb(var(--accent-rgb) / 0.25)',
                color: 'var(--ink)',
                borderRadius: 0,
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = 'rgb(var(--accent-rgb) / 0.55)')}
              onBlur={(e) => (e.currentTarget.style.borderColor = 'rgb(var(--accent-rgb) / 0.25)')}
            />
            <button
              onClick={createAndAdd}
              disabled={!newName.trim() || busy}
              className="metal-key is-primary p-1.5 disabled:opacity-40"
              title="Create playlist & add"
            >
              <Plus size={13} />
            </button>
          </div>

          {note && (
            <p className="font-term text-[11px]" style={{ color: 'var(--accent2)' }}>{note}</p>
          )}
        </div>
      )}
    </div>
  )
}
