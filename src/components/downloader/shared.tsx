import React, { useEffect, useRef, useState } from 'react'
import {
  X,
  Check,
  AlertTriangle,
  Loader,
  Copy,
  Cookie,
  Terminal,
  KeyRound,
  Globe,
  Info,
  FolderOpen,
} from 'lucide-react'
import { useDownloaderStore, type PreviewRow } from '@/store/downloader'
import { fmtDuration } from '@/lib/ipc'
import type { Confidence, PreflightCheck, DownloaderPreflight } from '@/lib/ipc'

// Shared leaf components + constants for the downloader UI. Both the full-screen
// modal (Downloader.tsx) and the side panel (DownloaderPanel.tsx) — plus the
// Settings "ADD MUSIC" pane (AuthControls) — import from here so there is a
// single set of primitives and no circular deps.

export const COOKIE_BROWSERS = ['firefox', 'chrome', 'edge', 'brave', 'chromium', 'opera', 'vivaldi']

export const GREEN = 'var(--accent)'
export const CYAN = 'var(--accent2)'
export const AMBER = '#FFB000'
export const RED = '#FF3030'
export const INK_DIM = 'rgb(var(--ink-rgb) / 0.55)'
export const INK_FAINT = 'rgb(var(--ink-rgb) / 0.30)'

export function confColor(c: Confidence): string {
  switch (c) {
    case 'HIGH':
      return GREEN
    case 'MEDIUM':
      return AMBER
    case 'LOW':
      return RED
    case 'PINNED':
      return CYAN
    default:
      return INK_DIM
  }
}

export function sevColor(sev: PreflightCheck['severity']): string {
  return sev === 'ok' ? GREEN : sev === 'warn' ? AMBER : RED
}

// One-line preflight summary, shared by the modal banner and the panel's chip.
export function preflightSummary(
  preflight: DownloaderPreflight | null,
  preflightLoading: boolean
): { text: string; color: string } {
  const checks = preflight?.checks ?? []
  const ok = preflight?.ok
  const errors = checks.filter((c) => c.severity === 'error')
  const warns = checks.filter((c) => c.severity === 'warn')
  const color = preflightLoading ? CYAN : ok ? GREEN : RED
  const text = preflightLoading
    ? 'checking environment…'
    : !preflight
    ? 'environment unknown'
    : ok && warns.length === 0
    ? 'environment ready — all systems go'
    : ok
    ? `ready, with ${warns.length} warning${warns.length > 1 ? 's' : ''}`
    : `${errors.length} blocker${errors.length > 1 ? 's' : ''} — fix before downloading`
  return { text, color }
}

// ---------------------------------------------------------------------------

export function CheckRow({ check: c }: { check: PreflightCheck }) {
  const color = sevColor(c.severity)
  const [copied, setCopied] = useState(false)
  const cmd = c.fix?.command
  return (
    <div className="flex items-start gap-2">
      <span style={{ color, marginTop: 2 }}>
        {c.ok ? <Check size={12} /> : c.severity === 'warn' ? <AlertTriangle size={12} /> : <X size={12} />}
      </span>
      <span className="font-term text-[12px] flex-shrink-0" style={{ color, width: 78 }}>
        {c.label}
      </span>
      <span className="font-term text-[11px] flex-1 min-w-0" style={{ color: 'rgba(200,235,215,0.8)' }}>
        {c.detail}
      </span>
      {cmd && (
        <button
          className="metal-key px-1.5 h-5 font-mono text-[9px] flex items-center gap-1 flex-shrink-0"
          title={`Copy: ${cmd}`}
          onClick={() => {
            navigator.clipboard?.writeText(cmd)
            setCopied(true)
            window.setTimeout(() => setCopied(false), 1200)
          }}
        >
          {copied ? <Check size={10} /> : <Copy size={10} />} {copied ? 'copied' : 'copy fix'}
        </button>
      )}
    </div>
  )
}

export function AuthControls() {
  const s = useDownloaderStore()
  const [showInfo, setShowInfo] = useState(false)
  const auth = s.auth
  const method = auth?.method ?? 'browser'
  const browsers = s.browsers.length ? s.browsers : COOKIE_BROWSERS

  const methodLabel =
    method === 'in-app'
      ? auth?.connected
        ? 'signed in (in-app)'
        : 'in-app (not signed in)'
      : method === 'file'
      ? `cookies.txt: ${(auth?.file ?? '').split(/[/\\]/).pop() || 'file'}`
      : `browser: ${auth?.browser ?? 'firefox'}`

  return (
    <div className="flex flex-col gap-1 pt-1 mt-0.5" style={{ borderTop: '1px dashed rgb(var(--accent-rgb) / 0.10)' }}>
      <div className="flex items-center gap-2 flex-wrap">
        <Cookie size={12} style={{ color: CYAN }} />
        <span className="font-term text-[10px] tracking-[1px]" style={{ color: INK_FAINT }}>
          YOUTUBE SIGN-IN
        </span>
        <span className="font-term text-[11px]" style={{ color: auth?.connected ? GREEN : CYAN }}>
          {methodLabel}
        </span>
        <button
          className="metal-key flex items-center justify-center flex-shrink-0"
          style={{ width: 18, height: 18 }}
          title="How sign-in works"
          onClick={() => setShowInfo((v) => !v)}
        >
          <Info size={11} />
        </button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <button
          className="metal-key is-primary px-2 h-6 font-term text-[10px] tracking-[1px] flex items-center gap-1"
          onClick={s.connectYouTube}
          disabled={s.connecting}
          title="Sign in to YouTube in a private window inside the app"
        >
          {s.connecting ? <Loader size={11} className="animate-spin" /> : <KeyRound size={11} />}
          {method === 'in-app' && auth?.connected ? 'reconnect' : 'connect YouTube'}
        </button>

        <span className="font-term text-[10px]" style={{ color: INK_FAINT }}>
          or
        </span>

        <span className="inline-flex items-center gap-1" title="Read cookies from a browser you're signed into">
          <Globe size={11} style={{ color: method === 'browser' ? GREEN : INK_FAINT }} />
          <select
            value={auth?.browser ?? 'firefox'}
            onChange={(e) => s.setAuthBrowser(e.target.value)}
            disabled={s.connecting || s.preflightLoading}
            className="font-term text-[11px] px-1 py-0.5 outline-none disabled:opacity-50"
            style={{
              background: '#000',
              color: method === 'browser' ? GREEN : INK_DIM,
              border: `1px solid ${method === 'browser' ? 'rgb(var(--accent-rgb) / 0.4)' : 'rgb(var(--accent-rgb) / 0.2)'}`,
            }}
          >
            {browsers.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </span>

        <button
          className="metal-key px-2 h-6 font-term text-[10px]"
          onClick={s.importCookies}
          title="Load a cookies.txt you exported"
          style={method === 'file' ? { color: GREEN, borderColor: 'rgb(var(--accent-rgb) / 0.4)' } : undefined}
        >
          cookies.txt…
        </button>

        {auth?.connected && (
          <button
            className="px-2 h-6 font-term text-[10px]"
            onClick={s.disconnectYouTube}
            style={{ color: 'rgba(255,120,120,0.85)', background: 'rgba(255,48,48,0.06)', border: '1px solid rgba(255,48,48,0.3)' }}
            title="Forget the in-app sign-in / imported cookies"
          >
            disconnect
          </button>
        )}
      </div>

      {showInfo && <AuthInfo />}
    </div>
  )
}

export function AuthInfo() {
  const line = (label: string, body: string) => (
    <p className="font-term text-[11px]" style={{ color: 'rgba(200,235,215,0.78)' }}>
      <span style={{ color: CYAN }}>{label}</span> {body}
    </p>
  )
  return (
    <div
      className="flex flex-col gap-1 px-3 py-2 mt-1"
      style={{ border: '1px solid rgb(var(--accent2-rgb) / 0.25)', background: 'rgba(0,20,28,0.5)' }}
    >
      <p className="font-term text-[11px]" style={{ color: INK_DIM }}>
        YouTube has no “download login,” so the app authenticates with your YouTube cookies. Pick any
        one — the <span style={{ color: GREEN }}>YouTube sign-in</span> check above confirms it actually works.
      </p>
      {line('Connect YouTube —', 'opens a private sign-in window inside T-Play. Log in once; the app stores only the session cookie (never your password), on this PC. Hit “reconnect” if it ever expires.')}
      {line('browser —', 'reads cookies from a browser you’re already signed into. Firefox works best; Chrome/Edge lock their cookie files (the check will say so).')}
      {line('cookies.txt —', 'load a cookies file you exported (e.g. a “Get cookies.txt” browser extension).')}
      <p className="font-term text-[10px]" style={{ color: INK_FAINT }}>
        Tip: for heavy downloading, a separate Google account keeps your main one safe. Nothing you enter
        here leaves your machine.
      </p>
    </div>
  )
}

export function InstallLog() {
  const { installLog, installingTools } = useDownloaderStore()
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight
  }, [installLog.length])
  return (
    <div className="mt-1" style={{ border: '1px solid rgb(var(--accent2-rgb) / 0.25)', background: '#000' }}>
      <div
        className="px-2 py-1 font-term text-[10px] tracking-[1px] flex items-center gap-1"
        style={{ color: CYAN, borderBottom: '1px solid rgb(var(--accent2-rgb) / 0.15)' }}
      >
        <Terminal size={11} /> installing: {installingTools.join(' · ')}
        <Loader size={11} className="animate-spin" style={{ marginLeft: 'auto' }} />
      </div>
      <div ref={ref} className="px-2 py-1 font-mono text-[10px]" style={{ maxHeight: 120, overflowY: 'auto', color: 'rgb(var(--ink-rgb) / 0.7)' }}>
        {installLog.length === 0 ? (
          <span style={{ color: INK_FAINT }}>starting…</span>
        ) : (
          installLog.map((l, i) => (
            <div key={i} className="whitespace-pre-wrap break-all" style={{ color: l.startsWith('$') ? CYAN : undefined }}>
              {l}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

export function OutDirBar() {
  const { outDir, outDirIsLibrary, pickOutDir, addOutDirToLibrary } = useDownloaderStore()
  return (
    <div className="flex items-center gap-2 flex-wrap mt-3">
      <span className="font-term text-[10px] tracking-[2px]" style={{ color: INK_FAINT }}>
        SAVE TO
      </span>
      <span className="font-mono text-[11px] truncate" style={{ color: CYAN, maxWidth: 460 }} title={outDir}>
        {outDir || '(default library)'}
      </span>
      <button
        className="metal-key px-2 h-6 font-term text-[10px] tracking-[1px] flex items-center gap-1"
        onClick={pickOutDir}
        title="Choose output folder"
      >
        <FolderOpen size={11} /> change
      </button>
      {outDir && !outDirIsLibrary && (
        <button
          className="px-2 h-6 font-term text-[10px] tracking-[1px]"
          onClick={addOutDirToLibrary}
          title="This folder isn't in your library — add it so downloads appear"
          style={{ color: AMBER, background: 'rgba(255,176,0,0.08)', border: '1px solid rgba(255,176,0,0.35)' }}
        >
          + add to library
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------

export function ConfidenceBadge({ c, explicit }: { c: Confidence; explicit?: boolean | null }) {
  const color = confColor(c)
  return (
    <span className="inline-flex items-center gap-1">
      <span
        className="font-term text-[10px] tracking-[1px] px-1.5"
        style={{ color, border: `1px solid ${color}`, background: `${color}14`, lineHeight: '15px' }}
      >
        {c}
      </span>
      {explicit ? (
        <span
          className="font-term text-[9px] px-1"
          style={{ color: '#000', background: INK_DIM, lineHeight: '14px' }}
          title="Explicit master"
        >
          E
        </span>
      ) : null}
    </span>
  )
}

export function StageLabel({ row }: { row: PreviewRow }) {
  const stage = row.dlStage
  if (stage === 'done')
    return (
      <span className="font-term text-[12px] flex items-center gap-1 justify-end" style={{ color: GREEN }}>
        <Check size={12} /> done
      </span>
    )
  if (stage === 'skipped')
    return (
      <span className="font-term text-[12px] justify-end" style={{ color: INK_FAINT }}>
        already have it
      </span>
    )
  if (stage === 'failed')
    return (
      <span className="font-term text-[12px] justify-end" style={{ color: RED }}>
        failed
      </span>
    )
  if (stage === 'embedding')
    return (
      <span className="font-term text-[12px] justify-end" style={{ color: CYAN }}>
        embedding art…
      </span>
    )
  if (stage === 'downloading')
    return (
      <div className="flex flex-col gap-1 w-full">
        <span className="font-term text-[11px] text-right" style={{ color: CYAN }}>
          {Math.round(row.pct ?? 0)}%
        </span>
        <div style={{ height: 3, background: 'rgb(var(--accent-rgb) / 0.12)' }}>
          <div
            style={{
              height: 3,
              width: `${row.pct ?? 0}%`,
              background: GREEN,
              boxShadow: `0 0 6px ${GREEN}`,
              transition: 'width 0.25s ease',
            }}
          />
        </div>
      </div>
    )
  return (
    <span className="font-term text-[12px] justify-end" style={{ color: INK_FAINT }}>
      queued…
    </span>
  )
}

export function RowButton({
  children,
  onClick,
  title,
  danger,
  active,
}: {
  children: React.ReactNode
  onClick: () => void
  title: string
  danger?: boolean
  active?: boolean
}) {
  return (
    <button
      className="metal-key w-7 h-7"
      title={title}
      onClick={onClick}
      style={
        active
          ? { color: CYAN, borderColor: 'rgb(var(--accent2-rgb) / 0.5)' }
          : danger
          ? { color: 'rgba(255,120,120,0.8)' }
          : undefined
      }
    >
      {children}
    </button>
  )
}

export function SwapMenu({ row, indent = true }: { row: PreviewRow; indent?: boolean }) {
  const st = useDownloaderStore()
  return (
    <div
      className={indent ? 'mx-2 mb-2 ml-9' : 'mb-2'}
      style={{ border: '1px solid rgb(var(--accent2-rgb) / 0.25)', background: 'rgba(0,20,28,0.6)' }}
    >
      <div className="px-2 py-1 font-term text-[10px] tracking-[1.5px]" style={{ color: CYAN, borderBottom: '1px solid rgb(var(--accent2-rgb) / 0.15)' }}>
        ALTERNATE VERSIONS — click to use
      </div>
      {row.candidatesLoading && (
        <div className="px-3 py-2 flex items-center gap-2 font-term text-[12px]" style={{ color: CYAN }}>
          <Loader size={12} className="animate-spin" /> searching catalog…
        </div>
      )}
      {row.candidates && row.candidates.length === 0 && (
        <div className="px-3 py-2 font-term text-[12px]" style={{ color: INK_FAINT }}>
          no alternates found.
        </div>
      )}
      {row.candidates?.map((c) => {
        const selected = c.id === row.id
        return (
          <button
            key={`${c.source}-${c.id}`}
            onClick={() => st.swapTo(row.i, c)}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors"
            style={{ background: selected ? 'rgb(var(--accent-rgb) / 0.08)' : 'transparent' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgb(var(--accent2-rgb) / 0.07)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = selected ? 'rgb(var(--accent-rgb) / 0.08)' : 'transparent')}
          >
            <ConfidenceBadge c={c.confidence} explicit={c.explicit} />
            <span className="flex-1 font-term text-[13px] truncate" style={{ color: '#cfeede' }}>
              {c.artist} · {c.title}
            </span>
            <span className="font-term text-[11px]" style={{ color: c.source === 'ytmusic' ? GREEN : INK_DIM }}>
              {c.source}
            </span>
            <span className="font-term text-[12px] tabular-nums" style={{ color: INK_DIM, width: 44, textAlign: 'right' }}>
              {c.duration ? fmtDuration(c.duration) : '—'}
            </span>
            {selected && <Check size={12} style={{ color: GREEN }} />}
          </button>
        )
      })}
    </div>
  )
}

export function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="font-lcd text-[20px] tabular-nums phosphor-glow" style={{ color }}>
        {value}
      </span>
      <span className="font-term text-[10px] tracking-[1.5px]" style={{ color: INK_FAINT }}>
        {label}
      </span>
    </div>
  )
}
