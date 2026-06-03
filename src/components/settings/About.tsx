import React, { useEffect, useRef, useState } from 'react'
import { GitBranch, Bug, Download, Upload } from 'lucide-react'
import { hub } from '@/lib/ipc'
import { gatherSettings, downloadSettingsFile, importSettingsFromFile } from '@/lib/settings-io'
import { Section, SettingRow, KeyButton } from './primitives'

const REPO = 'https://github.com/TerraByte-Dev/TerraPlayer'

// Pull "Electron/x" and "Chrome/x" out of the renderer's user-agent (no IPC needed).
function uaVersion(label: string): string {
  const m = new RegExp(`${label}/([\\d.]+)`).exec(navigator.userAgent)
  return m ? m[1] : '—'
}

export default function About() {
  const [version, setVersion] = useState('')
  const [backupMsg, setBackupMsg] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { window.hub.getAppVersion().then(setVersion) }, [])

  function handleExport() {
    downloadSettingsFile(gatherSettings())
    setBackupMsg('Exported settings to your downloads.')
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file
    if (!file) return
    try {
      await importSettingsFromFile(file)
      setBackupMsg('Settings imported and applied.')
    } catch (err) {
      setBackupMsg(err instanceof Error ? err.message : 'Could not import that file.')
    }
  }

  const rows: [string, string][] = [
    ['Version', version ? `v${version}` : '—'],
    ['Electron', uaVersion('Electron')],
    ['Chromium', uaVersion('Chrome')],
  ]

  return (
    <>
      <Section title="About" description="An offline desktop music player with a y2k / phosphor-terminal aesthetic.">
        <div className="font-lcd text-[26px] tracking-[2px] phosphor-glow" style={{ color: 'var(--accent)' }}>TerraPlayer</div>
        <div className="flex flex-col gap-1.5 mt-1">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between font-term text-[12px]">
              <span style={{ color: 'rgb(var(--ink-rgb) / 0.45)' }}>{k}</span>
              <span className="font-mono tabular-nums" style={{ color: 'var(--ink)' }}>{v}</span>
            </div>
          ))}
        </div>
        <div className="flex gap-2 mt-2">
          <KeyButton onClick={() => hub.openExternal(REPO)}><span className="flex items-center gap-1.5"><GitBranch size={13} /> GITHUB</span></KeyButton>
          <KeyButton onClick={() => hub.openExternal(`${REPO}/issues/new`)}><span className="flex items-center gap-1.5"><Bug size={12} /> REPORT ISSUE</span></KeyButton>
        </div>
      </Section>

      <Section
        title="Backup"
        description="Carry your theme, EQ, and preferences between machines as a portable JSON file."
      >
        <SettingRow label="Settings file" help="Export a snapshot, or import one to apply it">
          <div className="flex gap-2">
            <KeyButton onClick={handleExport}><span className="flex items-center gap-1.5"><Download size={12} /> EXPORT</span></KeyButton>
            <KeyButton onClick={() => fileRef.current?.click()}><span className="flex items-center gap-1.5"><Upload size={12} /> IMPORT</span></KeyButton>
          </div>
        </SettingRow>
        <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={handleImportFile} />
        {backupMsg && <p className="font-term text-[11px]" style={{ color: 'var(--accent2)' }}>{backupMsg}</p>}
      </Section>

      <Section title="Credits" description="">
        <p className="font-term text-[12px] leading-[1.6]" style={{ color: 'rgb(var(--ink-rgb) / 0.55)' }}>
          Built by <span style={{ color: 'var(--accent)' }}>TerraByte Solutions</span>. Powered by Electron, React,
          better-sqlite3, music-metadata, and the Web Audio API. Released under the MIT license.
        </p>
      </Section>
    </>
  )
}
