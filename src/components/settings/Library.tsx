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
        description="TerraPlayer scans these folders for .m4a and .mp3 files, and names a playlist after each one. Removing a folder stops the scan — you choose whether its songs stay in your library or go with it (the files on disk are never touched either way). Songs dragged in one at a time are indexed on their own and aren't listed here."
      >
        <div className="flex flex-col gap-1.5">
          {folders.length === 0 && (
            <p className="font-term text-[12px]" style={{ color: 'rgb(var(--ink-rgb) / 0.4)' }}>No folders yet — add one, or just drag songs onto the window.</p>
          )}
          {folders.map((f) => (
            <div key={f.path} className="flex items-center gap-2 px-2 py-1.5" style={{ border: '1px solid rgb(var(--accent-rgb) / 0.10)' }}>
              <Folder size={13} style={{ color: 'rgb(var(--accent-rgb) / 0.5)', flexShrink: 0 }} />
              <span className="font-term text-[12px] truncate flex-1" style={{ color: 'var(--ink)' }} title={f.path}>{f.path}</span>
              {confirmRemove === f.path ? (
                // Two outcomes, both spelled out. Keeping the songs is the calm
                // option and leaves them as ordinary folder-less tracks — ids,
                // tags and playlist memberships intact, so re-adding the folder
                // later costs nothing. Dropping them is still one click, just no
                // longer the unstated meaning of a trash icon.
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <span className="font-term text-[10px]" style={{ color: 'var(--accent2)' }}>stop scanning?</span>
                  <button className="metal-key font-term text-[10px] px-2 py-0.5" title="Unregister the folder; its songs stay in your library"
                    onClick={async () => { setConfirmRemove(null); await removeFolder(f.path, true) }}>KEEP SONGS</button>
                  <button className="font-term text-[10px] px-2 py-0.5" style={{ color: '#000', background: '#ff5555' }}
                    title="Unregister the folder and remove its songs from the library"
                    onClick={async () => { setConfirmRemove(null); await removeFolder(f.path, false) }}>DROP SONGS</button>
                  <button className="metal-key font-term text-[10px] px-2 py-0.5" onClick={() => setConfirmRemove(null)}>NO</button>
                </div>
              ) : (
                <button className="metal-key w-6 h-6 flex-shrink-0" title="Stop scanning this folder" onClick={() => setConfirmRemove(f.path)}>
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
