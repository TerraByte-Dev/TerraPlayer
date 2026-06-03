import React, { useEffect, useRef, useState } from 'react'
import {
  X,
  Download,
  RefreshCw,
  Check,
  AlertTriangle,
  Pin,
  Pencil,
  Trash2,
  Repeat,
  ArrowRight,
  ArrowLeft,
  FolderOpen,
  FileText,
  Loader,
  Wrench,
  Copy,
  Cookie,
  ChevronDown,
  ChevronUp,
  Terminal,
  KeyRound,
  Globe,
  Info,
} from 'lucide-react'
import { useDownloaderStore, type PreviewRow } from '@/store/downloader'
import { hub, fmtDuration } from '@/lib/ipc'
import type { Confidence, PreflightCheck } from '@/lib/ipc'

const COOKIE_BROWSERS = ['firefox', 'chrome', 'edge', 'brave', 'chromium', 'opera', 'vivaldi']

const GREEN = '#00FF88'
const CYAN = '#00E5FF'
const AMBER = '#FFB000'
const RED = '#FF3030'
const INK_DIM = 'rgba(155,245,184,0.55)'
const INK_FAINT = 'rgba(155,245,184,0.30)'

function confColor(c: Confidence): string {
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

const INPUT_PLACEHOLDER = `Kendrick Lamar - HUMBLE.
21 Savage - a lot
Daft Punk - Get Lucky | https://youtu.be/5NV6Rdv1a3I    ← pin an exact source
https://youtu.be/dQw4w9WgXcQ                              ← or just a URL / video id`

export default function Downloader({ onClose }: { onClose: () => void }) {
  const s = useDownloaderStore()

  // Stream NDJSON download + install events into the store.
  useEffect(() => {
    const unsubDl = window.hub.onDownloaderEvent((e) => useDownloaderStore.getState().handleEvent(e))
    const unsubInstall = window.hub.onDownloaderInstallEvent((e) =>
      useDownloaderStore.getState().handleInstallEvent(e)
    )
    return () => {
      unsubDl()
      unsubInstall()
    }
  }, [])

  // Open: load preflight + output dir; start fresh after a finished run.
  useEffect(() => {
    const st = useDownloaderStore.getState()
    if (st.phase === 'done') st.reset()
    st.openPanel()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const tryClose = () => {
    if (s.busy) return
    onClose()
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') tryClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.busy])

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    const file = Array.from(e.dataTransfer.files)[0]
    if (file) s.ingestFilePath(hub.getPathForFile(file))
  }

  const acceptedCount = s.rows.filter((r) => r.accepted && r.id && r.status !== 'failed').length
  const lowAccepted = s.rows.filter(
    (r) => r.accepted && r.id && r.status !== 'failed' && r.confidence === 'LOW'
  ).length

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center no-drag"
      style={{ background: 'rgba(0,0,0,0.78)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) tryClose()
      }}
      onDragOver={(e) => {
        e.preventDefault()
        e.stopPropagation()
      }}
      onDrop={handleDrop}
    >
      <div
        className="flex flex-col"
        style={{
          width: 'min(960px, calc(100vw - 32px))',
          height: 'min(680px, calc(100vh - 40px))',
          background: '#020503',
          border: '1px solid rgba(0,255,136,0.25)',
          boxShadow: '0 0 48px rgba(0,255,136,0.10)',
        }}
      >
        {/* Header */}
        <div
          className="flex-shrink-0 h-10 flex items-center justify-between px-4"
          style={{ borderBottom: '1px solid rgba(0,255,136,0.15)', background: '#000' }}
        >
          <div className="flex items-center gap-2">
            <span
              style={{
                display: 'inline-block',
                width: 5,
                height: 5,
                background: GREEN,
                transform: 'rotate(45deg)',
                boxShadow: `0 0 6px ${GREEN}`,
              }}
            />
            <span className="font-term text-[12px] tracking-[2.5px]" style={{ color: GREEN }}>
              ♪ MEDIA DOWNLOADER
            </span>
          </div>
          <button
            className="metal-key w-7 h-7"
            onClick={tryClose}
            disabled={s.busy}
            title={s.busy ? 'Cancel the download before closing' : 'Close'}
            style={s.busy ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}
          >
            <X size={13} />
          </button>
        </div>

        <PreflightBanner />

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {s.phase === 'input' && <InputPane onDrop={handleDrop} />}
          {(s.phase === 'preview' || s.phase === 'downloading' || s.phase === 'done') && <PreviewPane />}
        </div>

        {/* Footer / actions */}
        <Footer acceptedCount={acceptedCount} lowAccepted={lowAccepted} onClose={tryClose} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

function sevColor(sev: PreflightCheck['severity']): string {
  return sev === 'ok' ? GREEN : sev === 'warn' ? AMBER : RED
}

function PreflightBanner() {
  const s = useDownloaderStore()
  const { preflight, preflightLoading, installing } = s
  const checks = preflight?.checks ?? []
  const ok = preflight?.ok
  const errors = checks.filter((c) => c.severity === 'error')
  const warns = checks.filter((c) => c.severity === 'warn')
  const fixable = checks.some(
    (c) => !c.ok && c.fix && c.fix.tool && ['yt-dlp', 'ytmusicapi', 'ffmpeg', 'deno'].includes(c.fix.tool)
  )
  const [expanded, setExpanded] = useState(false)
  // Auto-expand when something needs attention; collapse when all-clear.
  const hasIssues = checks.some((c) => !c.ok)
  const open = expanded || hasIssues || installing

  const headColor = preflightLoading ? CYAN : ok ? GREEN : RED
  const summary = preflightLoading
    ? 'checking environment (yt-dlp · ffmpeg · deno · sign-in)…'
    : !preflight
    ? 'environment unknown'
    : ok && warns.length === 0
    ? 'environment ready — all systems go'
    : ok
    ? `ready, with ${warns.length} warning${warns.length > 1 ? 's' : ''}`
    : `${errors.length} blocker${errors.length > 1 ? 's' : ''} — fix before downloading`

  return (
    <div
      className="flex-shrink-0"
      style={{ borderBottom: '1px solid rgba(0,255,136,0.10)', background: '#01130a' }}
    >
      {/* summary row */}
      <div className="px-4 py-2 flex items-center gap-2">
        <span style={{ color: headColor }}>
          {preflightLoading ? (
            <Loader size={13} className="animate-spin" />
          ) : ok ? (
            <Check size={13} />
          ) : (
            <AlertTriangle size={13} />
          )}
        </span>
        <span className="font-term text-[11px] tracking-[1px] flex-1 min-w-0 truncate" style={{ color: headColor }}>
          {summary}
        </span>
        {fixable && !installing && (
          <button
            className="metal-key is-primary px-2 h-6 font-term text-[10px] tracking-[1px] flex items-center gap-1"
            onClick={s.fixIt}
            title="Install the missing tools with winget / pip"
          >
            <Wrench size={11} /> fix it for me
          </button>
        )}
        <button
          className="metal-key px-2 h-6 font-term text-[10px] flex-shrink-0"
          onClick={() => s.loadPreflight()}
          disabled={preflightLoading || installing}
          title="Re-check environment"
        >
          <RefreshCw size={11} />
        </button>
        <button
          className="metal-key px-1.5 h-6 flex-shrink-0"
          onClick={() => setExpanded((v) => !v)}
          title={open ? 'Hide details' : 'Show details'}
        >
          {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
      </div>

      {open && (
        <div className="px-4 pb-2 flex flex-col gap-1" style={{ maxHeight: 260, overflowY: 'auto' }}>
          {checks.map((c) => (
            <CheckRow key={c.id} check={c} />
          ))}
          <AuthControls />
          {installing && <InstallLog />}
        </div>
      )}
    </div>
  )
}

function CheckRow({ check: c }: { check: PreflightCheck }) {
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

function AuthControls() {
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
    <div className="flex flex-col gap-1 pt-1 mt-0.5" style={{ borderTop: '1px dashed rgba(0,255,136,0.10)' }}>
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
              border: `1px solid ${method === 'browser' ? 'rgba(0,255,136,0.4)' : 'rgba(0,255,136,0.2)'}`,
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
          style={method === 'file' ? { color: GREEN, borderColor: 'rgba(0,255,136,0.4)' } : undefined}
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

function AuthInfo() {
  const line = (label: string, body: string) => (
    <p className="font-term text-[11px]" style={{ color: 'rgba(200,235,215,0.78)' }}>
      <span style={{ color: CYAN }}>{label}</span> {body}
    </p>
  )
  return (
    <div
      className="flex flex-col gap-1 px-3 py-2 mt-1"
      style={{ border: '1px solid rgba(0,229,255,0.25)', background: 'rgba(0,20,28,0.5)' }}
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

function InstallLog() {
  const { installLog, installingTools } = useDownloaderStore()
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight
  }, [installLog.length])
  return (
    <div className="mt-1" style={{ border: '1px solid rgba(0,229,255,0.25)', background: '#000' }}>
      <div
        className="px-2 py-1 font-term text-[10px] tracking-[1px] flex items-center gap-1"
        style={{ color: CYAN, borderBottom: '1px solid rgba(0,229,255,0.15)' }}
      >
        <Terminal size={11} /> installing: {installingTools.join(' · ')}
        <Loader size={11} className="animate-spin" style={{ marginLeft: 'auto' }} />
      </div>
      <div ref={ref} className="px-2 py-1 font-mono text-[10px]" style={{ maxHeight: 120, overflowY: 'auto', color: 'rgba(155,245,184,0.7)' }}>
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

function OutDirBar() {
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

function InputPane({ onDrop }: { onDrop: (e: React.DragEvent) => void }) {
  const { inputText, setInputText, csvName, resolving, runPreview, error } = useDownloaderStore()
  const taRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    taRef.current?.focus()
  }, [])

  const lineCount = inputText
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#')).length

  return (
    <div className="p-5 flex flex-col h-full">
      <div className="font-term text-[11px] tracking-[1.5px] mb-2" style={{ color: INK_DIM }}>
        paste songs — one <span style={{ color: GREEN }}>Artist - Track</span> per line. drop a{' '}
        <span style={{ color: CYAN }}>.txt</span> or a Spotify <span style={{ color: CYAN }}>.csv</span> too.
      </div>

      {csvName ? (
        <div
          className="flex items-center gap-2 px-3 py-4 mb-3"
          style={{ border: '1px dashed rgba(0,229,255,0.4)', background: 'rgba(0,229,255,0.05)' }}
        >
          <FileText size={16} style={{ color: CYAN }} />
          <span className="font-term text-[13px]" style={{ color: CYAN }}>
            {csvName}
          </span>
          <span className="font-term text-[11px]" style={{ color: INK_FAINT }}>
            (Spotify CSV — will read track + artists columns)
          </span>
          <button
            className="metal-key px-2 h-6 font-term text-[10px] ml-auto"
            onClick={() => setInputText('')}
          >
            clear
          </button>
        </div>
      ) : (
        <textarea
          ref={taRef}
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onDrop={onDrop}
          placeholder={INPUT_PLACEHOLDER}
          spellCheck={false}
          className="flex-1 w-full font-term text-[15px] leading-[1.5] px-3 py-2 outline-none resize-none"
          style={{
            background: '#000',
            border: '1px solid rgba(0,255,136,0.30)',
            color: GREEN,
            minHeight: 260,
            boxShadow: 'inset 0 0 24px rgba(0,0,0,0.7)',
          }}
        />
      )}

      <OutDirBar />

      {error && (
        <p className="font-term text-[12px] mt-2" style={{ color: RED }}>
          {error}
        </p>
      )}

      <div className="flex items-center gap-3 mt-4">
        <button
          className="metal-key is-primary px-5 h-9 font-term text-[12px] tracking-[1.5px] flex items-center gap-2 disabled:opacity-40"
          onClick={runPreview}
          disabled={resolving || (lineCount === 0 && !csvName)}
        >
          {resolving ? (
            <>
              <Loader size={14} className="animate-spin" /> RESOLVING…
            </>
          ) : (
            <>
              PREVIEW {lineCount > 0 ? `${lineCount} ` : ''}
              <ArrowRight size={14} />
            </>
          )}
        </button>
        <span className="font-term text-[11px]" style={{ color: INK_FAINT }}>
          no download yet — preview shows which version will be grabbed + a confidence flag
        </span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

function PreviewPane() {
  const { rows, phase, error } = useDownloaderStore()

  return (
    <div className="p-4">
      {error && (
        <p className="font-term text-[12px] mb-2 px-1" style={{ color: RED }}>
          {error}
        </p>
      )}
      {/* column header */}
      <div
        className="grid items-center gap-2 px-2 py-1.5 font-term text-[10px] tracking-[1.5px]"
        style={{ gridTemplateColumns: '24px 1fr 150px 56px 200px', color: INK_FAINT, borderBottom: '1px solid rgba(0,255,136,0.12)' }}
      >
        <span></span>
        <span>QUERY → CHOSEN VERSION</span>
        <span>SOURCE</span>
        <span className="text-right">LEN</span>
        <span className="text-right">{phase === 'input' ? '' : phase === 'preview' ? 'ACTIONS' : 'STATUS'}</span>
      </div>
      <div className="flex flex-col">
        {rows.map((r) => (
          <RowView key={r.i} row={r} downloading={phase !== 'preview'} />
        ))}
      </div>
      {rows.length === 0 && (
        <p className="font-term text-[13px] p-4 text-center" style={{ color: INK_FAINT }}>
          nothing resolved.
        </p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------

function ConfidenceBadge({ c, explicit }: { c: Confidence; explicit?: boolean | null }) {
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

function StageLabel({ row }: { row: PreviewRow }) {
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
        <div style={{ height: 3, background: 'rgba(0,255,136,0.12)' }}>
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

function RowView({ row, downloading }: { row: PreviewRow; downloading: boolean }) {
  const st = useDownloaderStore()
  const resolved = !!row.id
  const failed = row.status === 'failed'
  const skipped = row.status === 'skipped'

  return (
    <div
      className="border-b"
      style={{ borderColor: 'rgba(0,255,136,0.07)', opacity: !downloading && !row.accepted && !failed ? 0.55 : 1 }}
    >
      <div
        className="grid items-center gap-2 px-2 py-2"
        style={{ gridTemplateColumns: '24px 1fr 150px 56px 200px' }}
      >
        {/* accept checkbox */}
        <div className="flex items-center justify-center">
          {downloading ? (
            <span style={{ width: 14 }} />
          ) : (
            <button
              onClick={() => st.toggleAccept(row.i)}
              disabled={!resolved || failed}
              title={failed ? 'Could not resolve' : row.accepted ? 'Included' : 'Excluded'}
              className="flex items-center justify-center"
              style={{
                width: 15,
                height: 15,
                border: `1px solid ${row.accepted ? GREEN : 'rgba(155,245,184,0.35)'}`,
                background: row.accepted ? 'rgba(0,255,136,0.18)' : 'transparent',
                cursor: !resolved || failed ? 'not-allowed' : 'pointer',
              }}
            >
              {row.accepted && <Check size={11} style={{ color: GREEN }} />}
            </button>
          )}
        </div>

        {/* query → chosen */}
        <div className="min-w-0">
          {row.editing ? (
            <div className="flex items-center gap-1">
              <input
                autoFocus
                value={row.draftQuery ?? ''}
                onChange={(e) => st.setDraftQuery(row.i, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') st.commitEdit(row.i)
                  if (e.key === 'Escape') st.cancelEdit(row.i)
                }}
                className="flex-1 font-term text-[14px] px-2 py-0.5 outline-none"
                style={{ background: '#000', border: `1px solid ${GREEN}`, color: GREEN }}
              />
              <button className="metal-key px-2 h-6 font-term text-[10px]" onClick={() => st.commitEdit(row.i)}>
                go
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 min-w-0">
                {row.candidatesLoading ? (
                  <Loader size={12} className="animate-spin" style={{ color: CYAN }} />
                ) : (
                  <ConfidenceBadge c={row.confidence} explicit={row.explicit} />
                )}
                <span className="font-term text-[14px] truncate" style={{ color: resolved ? '#cfeede' : INK_FAINT }}>
                  {resolved ? `${row.channel ?? ''} · ${row.title ?? ''}` : failed ? `✗ ${row.reason ?? 'no match'}` : '…'}
                </span>
              </div>
              <div className="font-term text-[11px] truncate" style={{ color: INK_FAINT }} title={row.query}>
                ↳ {row.query}
              </div>
            </>
          )}
        </div>

        {/* source */}
        <div className="font-term text-[11px] truncate" style={{ color: row.source === 'ytmusic' ? GREEN : row.source === 'pinned' ? CYAN : INK_DIM }}>
          {resolved ? row.source : '—'}
        </div>

        {/* duration */}
        <div className="font-term text-[12px] text-right tabular-nums" style={{ color: INK_DIM }}>
          {row.duration ? fmtDuration(row.duration) : '—'}
        </div>

        {/* actions / status */}
        <div className="flex items-center justify-end gap-1">
          {downloading ? (
            <StageLabel row={row} />
          ) : (
            <>
              <RowButton title="Swap version" onClick={() => st.toggleSwap(row.i)} active={row.swapOpen}>
                <Repeat size={12} />
              </RowButton>
              <RowButton title="Pin a YouTube URL / id" onClick={() => st.setPinDraft(row.i, row.pinDraft === undefined ? '' : row.pinDraft)} active={row.pinDraft !== undefined}>
                <Pin size={12} />
              </RowButton>
              <RowButton title="Edit query" onClick={() => st.startEdit(row.i)}>
                <Pencil size={12} />
              </RowButton>
              <RowButton title="Remove" onClick={() => st.removeRow(row.i)} danger>
                <Trash2 size={12} />
              </RowButton>
            </>
          )}
        </div>
      </div>

      {/* pin input row */}
      {!downloading && row.pinDraft !== undefined && (
        <div className="px-2 pb-2 pl-9 flex items-center gap-2">
          <Pin size={11} style={{ color: CYAN }} />
          <input
            autoFocus
            value={row.pinDraft}
            onChange={(e) => st.setPinDraft(row.i, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') st.commitPin(row.i)
              if (e.key === 'Escape') st.setPinDraft(row.i, undefined as unknown as string)
            }}
            placeholder="https://youtu.be/VIDEOID  or  11-char id"
            className="flex-1 font-term text-[13px] px-2 py-0.5 outline-none"
            style={{ background: '#000', border: `1px solid ${CYAN}`, color: CYAN, maxWidth: 420 }}
          />
          <button className="metal-key px-2 h-6 font-term text-[10px]" onClick={() => st.commitPin(row.i)}>
            pin
          </button>
        </div>
      )}

      {/* swap candidate menu */}
      {!downloading && row.swapOpen && (
        <SwapMenu row={row} />
      )}
    </div>
  )
}

function RowButton({
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
          ? { color: CYAN, borderColor: 'rgba(0,229,255,0.5)' }
          : danger
          ? { color: 'rgba(255,120,120,0.8)' }
          : undefined
      }
    >
      {children}
    </button>
  )
}

function SwapMenu({ row }: { row: PreviewRow }) {
  const st = useDownloaderStore()
  return (
    <div
      className="mx-2 mb-2 ml-9"
      style={{ border: '1px solid rgba(0,229,255,0.25)', background: 'rgba(0,20,28,0.6)' }}
    >
      <div className="px-2 py-1 font-term text-[10px] tracking-[1.5px]" style={{ color: CYAN, borderBottom: '1px solid rgba(0,229,255,0.15)' }}>
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
            style={{ background: selected ? 'rgba(0,255,136,0.08)' : 'transparent' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(0,229,255,0.07)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = selected ? 'rgba(0,255,136,0.08)' : 'transparent')}
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

// ---------------------------------------------------------------------------

function Footer({
  acceptedCount,
  lowAccepted,
  onClose,
}: {
  acceptedCount: number
  lowAccepted: number
  onClose: () => void
}) {
  const s = useDownloaderStore()

  if (s.phase === 'input') return null

  return (
    <div
      className="flex-shrink-0 px-4 py-3 flex items-center gap-3"
      style={{ borderTop: '1px solid rgba(0,255,136,0.15)', background: '#000' }}
    >
      {s.phase === 'preview' && (
        <>
          <button className="metal-key px-3 h-9 font-term text-[11px] tracking-[1px] flex items-center gap-1" onClick={s.backToInput}>
            <ArrowLeft size={13} /> back
          </button>
          <div className="flex items-center gap-2">
            <button className="px-2 h-7 font-term text-[10px] tracking-[1px]" onClick={() => s.setAcceptAll(true)} style={ghostBtn}>
              accept all
            </button>
            <button className="px-2 h-7 font-term text-[10px] tracking-[1px]" onClick={() => s.setAcceptAll(false)} style={ghostBtn}>
              none
            </button>
          </div>
          <div className="flex-1" />
          {lowAccepted > 0 && (
            <span className="font-term text-[11px] flex items-center gap-1" style={{ color: RED }}>
              <AlertTriangle size={12} /> {lowAccepted} LOW-confidence selected — verify these
            </span>
          )}
          <button
            className="metal-key is-primary px-5 h-9 font-term text-[12px] tracking-[1.5px] flex items-center gap-2 disabled:opacity-40"
            onClick={s.startDownload}
            disabled={acceptedCount === 0 || !(s.preflight?.ok ?? true)}
            title={!(s.preflight?.ok ?? true) ? 'Fix the environment problem first' : ''}
          >
            <Download size={14} /> DOWNLOAD {acceptedCount}
          </button>
        </>
      )}

      {s.phase === 'downloading' && (
        <>
          <span className="font-term text-[12px] flex items-center gap-2" style={{ color: CYAN }}>
            <Loader size={14} className="animate-spin" /> downloading… (politeness sleeps make this deliberately unhurried)
          </span>
          <div className="flex-1" />
          <button
            className="px-4 h-9 font-term text-[11px] tracking-[1px]"
            onClick={s.cancel}
            style={{ color: RED, background: 'rgba(255,48,48,0.08)', border: '1px solid rgba(255,48,48,0.4)' }}
          >
            CANCEL
          </button>
        </>
      )}

      {s.phase === 'done' && s.summary && (
        <DoneFooter onClose={onClose} />
      )}
    </div>
  )
}

function DoneFooter({ onClose }: { onClose: () => void }) {
  const s = useDownloaderStore()
  const sum = s.summary!
  return (
    <>
      <div className="flex items-center gap-3 flex-wrap">
        <Stat label="NEW" value={sum.new} color={GREEN} />
        <Stat label="SKIPPED" value={sum.skipped} color={INK_DIM} />
        <Stat label="FAILED" value={sum.failed} color={sum.failed ? RED : INK_DIM} />
        {sum.low_confidence.length > 0 && (
          <span
            className="font-term text-[11px] flex items-center gap-1 px-2 py-1"
            style={{ color: RED, border: '1px solid rgba(255,48,48,0.35)', background: 'rgba(255,48,48,0.06)' }}
            title={sum.low_confidence.join('\n')}
          >
            <AlertTriangle size={12} /> {sum.low_confidence.length} LOW — verify version
          </span>
        )}
        <span className="font-term text-[11px]" style={{ color: s.reindexed ? GREEN : INK_FAINT }}>
          {s.reindexed ? '✓ library reindexed' : 'reindexing library…'}
        </span>
      </div>
      <div className="flex-1" />
      <button className="metal-key px-4 h-9 font-term text-[11px] tracking-[1px]" onClick={s.backToInput}>
        add more
      </button>
      <button className="metal-key is-primary px-5 h-9 font-term text-[12px] tracking-[1.5px]" onClick={onClose}>
        DONE
      </button>
    </>
  )
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
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

const ghostBtn: React.CSSProperties = {
  color: 'rgba(155,245,184,0.6)',
  background: 'transparent',
  border: '1px solid rgba(0,255,136,0.2)',
}
