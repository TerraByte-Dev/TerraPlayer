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
    // Clear immediately so a slow fetch can't briefly show the previous song's tags.
    setTrackTags([])
    if (!track) return
    let cancelled = false
    hub.getTrackTags(track.id).then((t) => { if (!cancelled) setTrackTags(t) })
    return () => { cancelled = true }
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
      <p className="font-mono text-[9px] uppercase tracking-[2px]" style={{ color: 'var(--accent2)' }}>TAGS</p>

      <div className="flex flex-wrap gap-1.5">
        {tags.map((tag) => {
          const active = tagIds.has(tag.id)
          return (
            <button
              key={tag.id}
              onClick={() => toggleTag(tag)}
              disabled={saving}
              className={`px-2.5 py-1 font-term text-[12px] transition-colors ${active ? 'phosphor-glow' : ''}`}
              style={{
                background: active ? 'rgb(var(--accent-rgb) / 0.15)' : 'transparent',
                border: active ? '1px solid rgb(var(--accent-rgb) / 0.55)' : '1px solid rgb(var(--accent-rgb) / 0.20)',
                color: active ? 'var(--accent)' : 'rgb(var(--ink-rgb) / 0.55)',
                borderRadius: 0,
              }}
            >
              #{tag.name}
            </button>
          )
        })}
        {tags.length === 0 && (
          <p className="font-term text-[12px]" style={{ color: 'rgb(var(--ink-rgb) / 0.30)' }}>no tags defined</p>
        )}
      </div>

      <div className="flex gap-1.5">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          placeholder="new tag..."
          className="flex-1 font-term text-[12px] px-2.5 py-1.5 outline-none transition-colors placeholder:opacity-30"
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
          onClick={handleCreate}
          className="metal-key is-primary p-1.5"
        >
          <Plus size={13} />
        </button>
      </div>
    </div>
  )
}
