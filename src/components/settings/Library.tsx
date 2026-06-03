import React, { useState } from 'react'
import { Folder, FolderPlus, RefreshCw, Trash2 } from 'lucide-react'
import { useLibraryStore } from '@/store/library'
import { Section, KeyButton } from './primitives'

function formatBytes(bytes: number): string {
  if (!bytes || bytes < 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col gap-1 p-3" style={{ border: '1px solid rgb(var(--accent-rgb) / 0.12)', background: 'rgb(var(--accent-rgb) / 0.03)' }}>
      <span className="font-lcd text-[22px] leading-none phosphor-glow" style={{ color: 'var(--accent)' }}>{value}</span>
      <span className="font-term text-[10px] tracking-[1px]" style={{ color: 'rgb(var(--ink-rgb) / 0.4)' }}>{label.toUpperCase()}</span>
    </div>
  )
}

export default function Library() {
  const { tracks, playlists, tags, folders, driveBytes, loading, addFolder, removeFolder, load } = useLibraryStore()
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null)

  return (
    <>
      <Section title="Library" description="Everything TerraPlayer has indexed.">
        <div className="grid grid-cols-4 gap-2">
          <Stat label="Tracks" value={tracks.length} />
          <Stat label="Playlists" value={playlists.length} />
          <Stat label="Tags" value={tags.length} />
          <Stat label="On disk" value={formatBytes(driveBytes)} />
        </div>
      </Section>

      <Section
        title="Folders"
        description="TerraPlayer scans these folders for .m4a and .mp3 files. Removing a folder drops its tracks from the library (the files are never deleted)."
      >
        <div className="flex flex-col gap-1.5">
          {folders.length === 0 && (
            <p className="font-term text-[12px]" style={{ color: 'rgb(var(--ink-rgb) / 0.4)' }}>No folders yet — add one to build your library.</p>
          )}
          {folders.map((f) => (
            <div key={f.path} className="flex items-center gap-2 px-2 py-1.5" style={{ border: '1px solid rgb(var(--accent-rgb) / 0.10)' }}>
              <Folder size={13} style={{ color: 'rgb(var(--accent-rgb) / 0.5)', flexShrink: 0 }} />
              <span className="font-term text-[12px] truncate flex-1" style={{ color: 'var(--ink)' }} title={f.path}>{f.path}</span>
              {confirmRemove === f.path ? (
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <span className="font-term text-[10px]" style={{ color: '#ff6b6b' }}>remove?</span>
                  <button className="font-term text-[10px] px-2 py-0.5" style={{ color: '#000', background: '#ff5555' }}
                    onClick={async () => { setConfirmRemove(null); await removeFolder(f.path) }}>YES</button>
                  <button className="metal-key font-term text-[10px] px-2 py-0.5" onClick={() => setConfirmRemove(null)}>NO</button>
                </div>
              ) : (
                <button className="metal-key w-6 h-6 flex-shrink-0" title="Remove folder" onClick={() => setConfirmRemove(f.path)}>
                  <Trash2 size={11} />
                </button>
              )}
            </div>
          ))}
        </div>
        <div className="flex gap-2 mt-1">
          <KeyButton onClick={() => addFolder()} primary><span className="flex items-center gap-1.5"><FolderPlus size={13} /> ADD FOLDER</span></KeyButton>
          <KeyButton onClick={() => load()} disabled={loading} title="Rescan all folders">
            <span className="flex items-center gap-1.5"><RefreshCw size={12} /> {loading ? 'SCANNING…' : 'RESCAN'}</span>
          </KeyButton>
        </div>
      </Section>
    </>
  )
}
