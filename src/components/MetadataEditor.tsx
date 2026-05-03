import React, { useState, useEffect } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { useLibraryStore } from '@/store/library'
import { hub } from '@/lib/ipc'
import type { StandardTags } from '@/lib/ipc'

export default function MetadataEditor() {
  const { selectedTrack, refreshTrack } = useLibraryStore()
  const track = selectedTrack()

  const [form, setForm] = useState<StandardTags>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!track) return
    setForm({ title: track.title, artist: track.artist, album: track.album })
    setSaved(false)
  }, [track?.id])

  if (!track) {
    return (
      <div className="p-5 text-muted/40 text-[12px]">
        Select a track to edit metadata
      </div>
    )
  }

  async function handleSave() {
    if (!track) return
    setSaving(true)
    try {
      await hub.writeTags(track.path, form)
      await refreshTrack(track.path)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      console.error(e)
    }
    setSaving(false)
  }

  return (
    <div className="p-4 space-y-4">
      <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-muted/40">Metadata</p>

      {track.coverDataUrl && (
        <img
          src={track.coverDataUrl}
          alt="cover"
          className="w-full aspect-square object-cover rounded-lg"
        />
      )}

      <div className="space-y-3">
        {(['title', 'artist', 'album'] as const).map((field) => (
          <div key={field}>
            <label className="block text-[10px] font-medium uppercase tracking-[0.08em] text-muted/40 mb-1">
              {field}
            </label>
            <input
              value={form[field] ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))}
              className="w-full bg-white/[0.05] text-white/80 text-[12px] rounded-md px-3 py-1.5 outline-none border border-white/[0.07] focus:border-accent/40 transition-colors"
            />
          </div>
        ))}

        <div>
          <label className="block text-[10px] font-medium uppercase tracking-[0.08em] text-muted/40 mb-1">
            Year
          </label>
          <input
            type="number"
            value={form.year ?? ''}
            onChange={(e) =>
              setForm((f) => ({ ...f, year: e.target.value ? Number(e.target.value) : undefined }))
            }
            className="w-full bg-white/[0.05] text-white/80 text-[12px] rounded-md px-3 py-1.5 outline-none border border-white/[0.07] focus:border-accent/40 transition-colors"
          />
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className={`w-full flex items-center justify-center gap-2 py-2 rounded-lg text-[12px] font-medium transition-colors ${
          saved
            ? 'bg-emerald-500/20 text-emerald-400'
            : 'bg-accent/15 hover:bg-accent/25 text-accent disabled:opacity-40'
        }`}
      >
        {saving && <Loader2 size={12} className="animate-spin" />}
        {saved && <Check size={12} />}
        {saving ? 'Saving…' : saved ? 'Saved' : 'Save Tags'}
      </button>
    </div>
  )
}
