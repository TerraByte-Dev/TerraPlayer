// Export / import of all TerraPlayer preferences as a portable JSON document, so a user can carry a
// consistent setup between machines. Reads/writes the live stores + theme module only; parsing and
// validation come from settings-schema.ts (pure). Export is a Blob download (works in the Electron
// renderer); import reads a File via FileReader. No new IPC required.

import {
  EXPORT_KIND, EXPORT_VERSION, parseSettingsExport, normalizeSettings,
  type SettingsExport,
} from './settings-schema'
import {
  getThemeId, getCrtOff, getReduceMotion, applyTheme, setCrtOff, setReduceMotion,
} from './theme'
import { usePlayerStore } from '@/store/player'
import { useSettingsStore } from '@/store/settings'

export type { SettingsExport } from './settings-schema'
export { parseSettingsExport } from './settings-schema'

/** Snapshot every persisted preference from the live stores + display module into an export payload. */
export function gatherSettings(): SettingsExport {
  const p = usePlayerStore.getState()
  const s = useSettingsStore.getState()
  return {
    kind: EXPORT_KIND,
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    theme: getThemeId(),
    display: { scanlines: !getCrtOff(), reduceMotion: getReduceMotion() },
    audio: { volume: p.volume, preampDb: s.preampDb, mono: s.mono, eq: p.eq },
    playback: { shuffle: p.shuffle, repeat: p.repeat, fadeSec: s.fadeSec, speed: s.speed },
  }
}

export function serializeSettings(payload: SettingsExport): string {
  return JSON.stringify(payload, null, 2)
}

/** Trigger a browser/Electron download of the export, named with the export date. */
export function downloadSettingsFile(payload: SettingsExport): void {
  const stamp = (payload.exportedAt || new Date().toISOString()).slice(0, 10)
  const blob = new Blob([serializeSettings(payload)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `terraplayer-settings-${stamp}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * Apply an imported (or any untrusted) settings object back into the live stores + display module. Values
 * are normalized/clamped first, then pushed through the real setters so the audio graph, shuffle queue,
 * and <html> theme all reconcile exactly as if the user had set them by hand.
 */
export function applyImportedSettings(raw: unknown): SettingsExport {
  const n = normalizeSettings(raw)

  // Display — through theme.ts so any open surface stays in sync. (scanlines on ⇒ crt-off false.)
  applyTheme(n.theme)
  setCrtOff(!n.display.scanlines)
  setReduceMotion(n.display.reduceMotion)

  // Audio graph + playback prefs.
  useSettingsStore.getState().setPreampDb(n.audio.preampDb)
  useSettingsStore.getState().setMono(n.audio.mono)
  useSettingsStore.getState().setFadeSec(n.playback.fadeSec)
  useSettingsStore.getState().setSpeed(n.playback.speed)

  // Player: volume + EQ via setState (a PlayerBar effect re-applies them to the audio element/graph).
  usePlayerStore.setState({ volume: n.audio.volume, eq: n.audio.eq })

  // Shuffle / repeat through the real actions so store invariants (shuffled-queue rebuild) hold.
  const ps = usePlayerStore.getState()
  if (ps.shuffle !== n.playback.shuffle) ps.toggleShuffle()
  let guard = 0
  while (usePlayerStore.getState().repeat !== n.playback.repeat && guard++ < 3) {
    usePlayerStore.getState().cycleRepeat()
  }

  return { kind: EXPORT_KIND, version: EXPORT_VERSION, exportedAt: new Date().toISOString(), ...n }
}

/** Read a File (from an <input type=file>) and apply it. Resolves with the applied export. */
export function importSettingsFromFile(file: File): Promise<SettingsExport> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read that file.'))
    reader.onload = () => {
      try {
        const parsed = parseSettingsExport(String(reader.result ?? ''))
        resolve(applyImportedSettings(parsed))
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)))
      }
    }
    reader.readAsText(file)
  })
}
