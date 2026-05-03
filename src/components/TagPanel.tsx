import React, { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { useLibraryStore } from '@/store/library'
import { hub } from '@/lib/ipc'
import type { Tag, TagKind } from '@/lib/ipc'

export default function TagPanel() {
  const { selectedTrack, tags, loadTags } = useLibraryStore()
  const track = selectedTrack()

  const [trackTags, setTrackTags] = useState<Tag[]>([])
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!track) return
    hub.getTrackTags(track.id).then(setTrackTags)
  }, [track?.id])

  if (!track) return null

  const tagIds = new Set(trackTags.map((t) => t.id))

  async function toggleTag(tag: Tag) {
    if (!track) return
    let next: number[]
    if (tagIds.has(tag.id)) {
      next = trackTags.filter((t) => t.id !== tag.id).map((t) => t.id)
    } else {
      next = [...Array.from(tagIds), tag.id]
    }
    setSaving(true)
    await hub.setTrackTags(track.id, next)
    const updated = await hub.getTrackTags(track.id)
    setTrackTags(updated)
    setSaving(false)
  }

  async function handleCreate() {
    if (!newName.trim()) return
    await hub.createTag(newName.trim(), 'custom' as TagKind)
    setNewName('')
    loadTags()
  }

  return (
    <div className="p-4 space-y-3">
      <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-muted/40">Tags</p>

      <div className="flex flex-wrap gap-1.5">
        {tags.map((tag) => {
          const active = tagIds.has(tag.id)
          return (
            <button
              key={tag.id}
              onClick={() => toggleTag(tag)}
              disabled={saving}
              className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
                active
                  ? 'bg-accent/20 text-accent border border-accent/30'
                  : 'bg-white/[0.05] text-muted/60 border border-white/[0.06] hover:text-white/70 hover:bg-white/[0.08]'
              }`}
            >
              {tag.name}
            </button>
          )
        })}
        {tags.length === 0 && (
          <p className="text-[11px] text-muted/30">No tags defined</p>
        )}
      </div>

      <div className="flex gap-1.5">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          placeholder="New tag…"
          className="flex-1 bg-white/[0.05] text-white/80 text-[11px] rounded-md px-2.5 py-1.5 outline-none border border-white/[0.07] focus:border-accent/40 transition-colors placeholder:text-muted/30"
        />
        <button
          onClick={handleCreate}
          className="p-1.5 rounded-md bg-accent/15 hover:bg-accent/25 text-accent transition-colors"
        >
          <Plus size={13} />
        </button>
      </div>
    </div>
  )
}
