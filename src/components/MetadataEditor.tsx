import React, { useState, useEffect } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { useLibraryStore } from '@/store/library'
import { hub } from '@/lib/ipc'
import type { StandardTags } from '@/lib/ipc'
import VectorGridCover from './VectorGridCover'

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
      <div className="p-5 font-term text-[13px]" style={{ color: 'rgba(155,245,184,0.30)' }}>
        select a track to edit metadata
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
      <p className="font-mono text-[9px] uppercase tracking-[2px]" style={{ color: '#00E5FF' }}>METADATA</p>

      <div className="w-full aspect-square overflow-hidden">
        <VectorGridCover
          src={track.coverDataUrl}
          label={`A:${String(track.id).padStart(3, '0')}`}
          size={undefined as unknown as number}
        />
      </div>

      <div className="space-y-3">
        {(['title', 'artist', 'album'] as const).map((field) => (
          <div key={field}>
            <label
              className="block font-mono text-[9px] uppercase tracking-[1.5px] mb-1"
              style={{ color: 'rgba(155,245,184,0.40)' }}
            >
              {field}
            </label>
            <input
              value={form[field] ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))}
              className="w-full font-term text-[13px] px-3 py-1.5 outline-none transition-colors"
              style={{
                background: '#000',
                border: '1px solid rgba(0,255,136,0.25)',
                color: '#9bf5b8',
                borderRadius: 0,
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = 'rgba(0,255,136,0.55)')}
              onBlur={(e) => (e.currentTarget.style.borderColor = 'rgba(0,255,136,0.25)')}
            />
          </div>
        ))}

        <div>
          <label
            className="block font-mono text-[9px] uppercase tracking-[1.5px] mb-1"
            style={{ color: 'rgba(155,245,184,0.40)' }}
          >
            YEAR
          </label>
          <input
            type="number"
            value={form.year ?? ''}
            onChange={(e) =>
              setForm((f) => ({ ...f, year: e.target.value ? Number(e.target.value) : undefined }))
            }
            className="w-full font-term text-[13px] px-3 py-1.5 outline-none transition-colors"
            style={{
              background: '#000',
              border: '1px solid rgba(0,255,136,0.25)',
              color: '#9bf5b8',
              borderRadius: 0,
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = 'rgba(0,255,136,0.55)')}
            onBlur={(e) => (e.currentTarget.style.borderColor = 'rgba(0,255,136,0.25)')}
          />
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className={`metal-key w-full py-2 font-term text-[13px] tracking-[1px] justify-center transition-colors disabled:opacity-40 ${
          saved ? '' : 'is-primary'
        }`}
        style={saved ? { color: '#00E5FF', borderColor: 'rgba(0,229,255,0.55)', background: 'rgba(0,229,255,0.10)' } : undefined}
      >
        {saving && <Loader2 size={12} className="animate-spin mr-1" />}
        {saved && <Check size={12} className="mr-1" />}
        {saving ? 'saving...' : saved ? 'saved' : '> save tags'}
      </button>
    </div>
  )
}
