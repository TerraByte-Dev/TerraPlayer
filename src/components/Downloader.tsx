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
  FileText,
  Loader,
  Wrench,
  ChevronDown,
  ChevronUp,
  PanelRight,
} from 'lucide-react'
import { useDownloaderStore, type PreviewRow } from '@/store/downloader'
import { hub, fmtDuration } from '@/lib/ipc'
import {
  GREEN,
  CYAN,
  RED,
  INK_DIM,
  INK_FAINT,
  ConfidenceBadge,
  StageLabel,
  CheckRow,
  AuthControls,
  InstallLog,
  SwapMenu,
  RowButton,
  Stat,
  OutDirBar,
  preflightSummary,
} from './downloader/shared'

const INPUT_PLACEHOLDER = `Kendrick Lamar - HUMBLE.
21 Savage - a lot
Daft Punk - Get Lucky | https://youtu.be/5NV6Rdv1a3I    ← pin an exact source
https://youtu.be/dQw4w9WgXcQ                              ← or just a URL / video id`

export default function Downloader() {
  const s = useDownloaderStore()

  // NOTE: the NDJSON event subscription lives at the app level (App.tsx), not
  // here — that keeps a single persistent listener so a download docked to the
  // side keeps streaming progress, and avoids double-handling across modal↔dock.
  // closePanel() no-ops while busy (dock-or-cancel), so Escape can stay simple.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') useDownloaderStore.getState().closePanel()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  // The header's "dock to side" button moves this run into the right-side panel
  // (keep using the app); the panel can do everything the modal can, so it's
  // always available — not gated on an in-flight download anymore.
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
        if (e.target === e.currentTarget) s.closePanel()
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
          background: 'var(--bg-1)',
          border: '1px solid rgb(var(--accent-rgb) / 0.25)',
          boxShadow: '0 0 48px rgb(var(--accent-rgb) / 0.10)',
        }}
      >
        {/* Header */}
        <div
          className="flex-shrink-0 h-10 flex items-center justify-between px-4"
          style={{ borderBottom: '1px solid rgb(var(--accent-rgb) / 0.15)', background: '#000' }}
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
          <div className="flex items-center gap-1">
            <button
              className="metal-key w-7 h-7"
              onClick={s.dock}
              title="Dock to side — keep using the app in the compact panel"
            >
              <PanelRight size={13} />
            </button>
            <button
              className="metal-key w-7 h-7"
              onClick={s.closePanel}
              disabled={s.busy}
              title={s.busy ? 'Dock it or cancel the download — it can’t close mid-run' : 'Close'}
              style={s.busy ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}
            >
              <X size={13} />
            </button>
          </div>
        </div>

        <PreflightBanner />

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {s.phase === 'input' && <InputPane onDrop={handleDrop} />}
          {(s.phase === 'preview' || s.phase === 'downloading' || s.phase === 'done') && <PreviewPane />}
        </div>

        {/* Footer / actions */}
        <Footer acceptedCount={acceptedCount} lowAccepted={lowAccepted} onClose={s.closePanel} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

function PreflightBanner() {
  const s = useDownloaderStore()
  const { preflight, preflightLoading, installing } = s
  const checks = preflight?.checks ?? []
  const ok = preflight?.ok
  const fixable = checks.some(
    (c) => !c.ok && c.fix && c.fix.tool && ['yt-dlp', 'ytmusicapi', 'ffmpeg', 'deno'].includes(c.fix.tool)
  )
  const [expanded, setExpanded] = useState(false)
  // Auto-expand when something needs attention; collapse when all-clear.
  const hasIssues = checks.some((c) => !c.ok)
  const open = expanded || hasIssues || installing

  const { text: summary, color: headColor } = preflightSummary(preflight, preflightLoading)

  return (
    <div
      className="flex-shrink-0"
      style={{ borderBottom: '1px solid rgb(var(--accent-rgb) / 0.10)', background: '#01130a' }}
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
          style={{ border: '1px dashed rgb(var(--accent2-rgb) / 0.4)', background: 'rgb(var(--accent2-rgb) / 0.05)' }}
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
            border: '1px solid rgb(var(--accent-rgb) / 0.30)',
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
        style={{ gridTemplateColumns: '24px 1fr 150px 56px 200px', color: INK_FAINT, borderBottom: '1px solid rgb(var(--accent-rgb) / 0.12)' }}
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

function RowView({ row, downloading }: { row: PreviewRow; downloading: boolean }) {
  const st = useDownloaderStore()
  const resolved = !!row.id
  const failed = row.status === 'failed'

  return (
    <div
      className="border-b"
      style={{ borderColor: 'rgb(var(--accent-rgb) / 0.07)', opacity: !downloading && !row.accepted && !failed ? 0.55 : 1 }}
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
                border: `1px solid ${row.accepted ? GREEN : 'rgb(var(--ink-rgb) / 0.35)'}`,
                background: row.accepted ? 'rgb(var(--accent-rgb) / 0.18)' : 'transparent',
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
      {!downloading && row.swapOpen && <SwapMenu row={row} />}
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
      style={{ borderTop: '1px solid rgb(var(--accent-rgb) / 0.15)', background: '#000' }}
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

      {s.phase === 'done' && s.summary && <DoneFooter onClose={onClose} />}
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

const ghostBtn: React.CSSProperties = {
  color: 'rgb(var(--ink-rgb) / 0.6)',
  background: 'transparent',
  border: '1px solid rgb(var(--accent-rgb) / 0.2)',
}
