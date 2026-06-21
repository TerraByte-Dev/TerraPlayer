import React, { useEffect, useRef, useState } from 'react'
import {
  X,
  Maximize2,
  Download,
  Loader,
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronUp,
  Repeat,
  Pin,
  Pencil,
  Trash2,
  RefreshCw,
  Wrench,
  FileText,
  Settings as SettingsIcon,
} from 'lucide-react'
import { useDownloaderStore, type PreviewRow } from '@/store/downloader'
import { useLibraryStore } from '@/store/library'
import { hub, fmtDuration } from '@/lib/ipc'
import { summarizeRun } from '@/lib/downloader-progress'
import {
  GREEN,
  CYAN,
  RED,
  INK_DIM,
  INK_FAINT,
  ConfidenceBadge,
  StageLabel,
  CheckRow,
  InstallLog,
  SwapMenu,
  RowButton,
  OutDirBar,
  preflightSummary,
} from './downloader/shared'

// The organic right-side downloader. Same chrome as QueuePanel/TagPanel; input
// and the resolved-song list COEXIST so you keep typing while earlier lines
// resolve and download underneath. Heavy YouTube sign-in lives in Settings; this
// panel shows only a one-line auth status. Reuses the shared leaf components.

function sectionLabel(text: string) {
  return (
    <p className="font-mono text-[9px] uppercase tracking-[2px]" style={{ color: CYAN }}>
      {text}
    </p>
  )
}

export default function DownloaderPanel({ onOpenSettings }: { onOpenSettings: () => void }) {
  const s = useDownloaderStore()
  const closeDownloaderPanel = useLibraryStore((st) => st.closeDownloaderPanel)

  const eligible = s.rows.filter((r) => r.accepted && r.id && r.status !== 'failed' && !r.dlStage)
  const ranBefore = s.rows.some((r) => r.dlStage)
  const hasFinished = s.rows.some(
    (r) => r.dlStage === 'done' || r.dlStage === 'skipped' || r.dlStage === 'failed' || r.status === 'failed'
  )
  const lowEligible = eligible.filter((r) => r.confidence === 'LOW').length
  const prog = summarizeRun(s.rows, s.downloadOrder)
  const preflightOk = s.preflight?.ok ?? true

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    const file = Array.from(e.dataTransfer.files)[0]
    if (file) s.ingestFilePath(hub.getPathForFile(file))
  }

  return (
    <aside
      className="w-64 flex-shrink-0 flex flex-col overflow-hidden no-drag"
      style={{ borderLeft: '1px solid rgb(var(--accent-rgb) / 0.18)', background: 'var(--bg-1)' }}
      onDragOver={(e) => {
        e.preventDefault()
        e.stopPropagation()
      }}
      onDrop={handleDrop}
    >
      {/* Header */}
      <div
        className="px-4 py-3 flex items-center justify-between flex-shrink-0"
        style={{ borderBottom: '1px solid rgb(var(--accent-rgb) / 0.10)' }}
      >
        <h3 className="font-mono text-[9px] uppercase tracking-[2px] flex items-center gap-1.5" style={{ color: CYAN }}>
          {s.busy && <Loader size={10} className="animate-spin" />}
          GET MUSIC
        </h3>
        <div className="flex items-center gap-1">
          <button className="metal-key w-6 h-6" onClick={s.popOut} title="Pop out to full window (big-batch triage)">
            <Maximize2 size={11} />
          </button>
          <button
            className="metal-key w-6 h-6"
            onClick={closeDownloaderPanel}
            disabled={s.busy}
            title={s.busy ? 'Cancel the download first' : 'Close'}
            style={s.busy ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}
          >
            <X size={11} />
          </button>
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto">
        <EnvironmentSection onOpenSettings={onOpenSettings} />

        {/* ADD SONGS */}
        <div className="px-4 py-3 space-y-2" style={{ borderBottom: '1px solid rgb(var(--accent-rgb) / 0.08)' }}>
          {sectionLabel('ADD SONGS')}
          <AddBox />
          <OutDirBar />
          {s.error && (
            <p className="font-term text-[11px]" style={{ color: RED }}>
              {s.error}
            </p>
          )}
        </div>

        {/* SONGS list */}
        <div className="px-4 py-3 space-y-2">
          <div className="flex items-center gap-2">
            {sectionLabel('SONGS')}
            <span className="font-term text-[10px]" style={{ color: INK_FAINT }}>
              {s.rows.length || ''}
            </span>
            <div className="flex-1" />
            {s.rows.length > 0 && (
              <>
                <button className="font-term text-[10px] tracking-[1px]" style={{ color: INK_DIM }} onClick={() => s.setAcceptAll(true)}>
                  all
                </button>
                <button className="font-term text-[10px] tracking-[1px]" style={{ color: INK_DIM }} onClick={() => s.setAcceptAll(false)}>
                  none
                </button>
                {hasFinished && !s.busy && (
                  <button className="font-term text-[10px] tracking-[1px]" style={{ color: INK_FAINT }} onClick={s.clearFinished} title="Remove finished cards">
                    clear
                  </button>
                )}
              </>
            )}
          </div>

          {s.rows.length === 0 ? (
            <p className="font-term text-[12px] py-3 text-center" style={{ color: INK_FAINT }}>
              type a song above — it resolves and shows up here.
            </p>
          ) : (
            <div className="flex flex-col">
              {s.rows.map((row) => (
                <RowCard key={row.i} row={row} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Footer / actions */}
      <div
        className="px-4 py-3 flex flex-col gap-2 flex-shrink-0"
        style={{ borderTop: '1px solid rgb(var(--accent-rgb) / 0.10)' }}
      >
        {s.summary && !s.busy && (
          <div className="flex items-center gap-3 flex-wrap font-term text-[11px]">
            <span style={{ color: GREEN }}>{s.summary.new} new</span>
            <span style={{ color: INK_DIM }}>{s.summary.skipped} skipped</span>
            {s.summary.failed > 0 && <span style={{ color: RED }}>{s.summary.failed} failed</span>}
            <div className="flex-1" />
            <span style={{ color: s.reindexed ? GREEN : INK_FAINT }}>{s.reindexed ? '✓ reindexed' : 'reindexing…'}</span>
          </div>
        )}

        {lowEligible > 0 && !s.busy && (
          <span className="font-term text-[10px] flex items-center gap-1" style={{ color: RED }}>
            <AlertTriangle size={11} /> {lowEligible} LOW selected — verify
          </span>
        )}

        <div className="flex items-center gap-2">
          {s.busy ? (
            <>
              <span className="font-term text-[12px] tabular-nums" style={{ color: CYAN }}>
                {prog.finished} / {prog.total}
              </span>
              <div className="flex-1" />
              <button
                className="px-3 h-7 font-term text-[10px] tracking-[1px]"
                onClick={s.cancel}
                style={{ color: RED, background: 'rgba(255,48,48,0.08)', border: '1px solid rgba(255,48,48,0.4)' }}
              >
                CANCEL
              </button>
            </>
          ) : (
            <>
              <button
                className="metal-key is-primary px-3 h-8 font-term text-[11px] tracking-[1px] flex items-center gap-1.5 disabled:opacity-40"
                onClick={s.startDownload}
                disabled={eligible.length === 0 || !preflightOk}
                title={!preflightOk ? 'Fix the environment problem first' : ''}
              >
                <Download size={13} /> {ranBefore ? `download ${eligible.length} more` : `DOWNLOAD ${eligible.length}`}
              </button>
              <div className="flex-1" />
            </>
          )}
          <KeepGoingToggle />
        </div>
      </div>
    </aside>
  )
}

function KeepGoingToggle() {
  const { keepGoing, setKeepGoing } = useDownloaderStore()
  return (
    <button
      onClick={() => setKeepGoing(!keepGoing)}
      title="Auto-start the next batch when the current one finishes"
      className="flex items-center gap-1 px-1.5 h-7 font-term text-[10px] tracking-[1px]"
      style={{
        color: keepGoing ? GREEN : INK_FAINT,
        border: `1px solid ${keepGoing ? 'rgb(var(--accent-rgb) / 0.5)' : 'rgb(var(--accent-rgb) / 0.18)'}`,
        background: keepGoing ? 'rgb(var(--accent-rgb) / 0.10)' : 'transparent',
      }}
    >
      {keepGoing ? <Check size={10} /> : <span style={{ width: 10 }} />} keep going
    </button>
  )
}

// ---------------------------------------------------------------------------

function AddBox() {
  const { inputText, setInputText, addLines, csvName, resolving } = useDownloaderStore()
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    ref.current?.focus()
  }, [])

  function submit() {
    void addLines()
    ref.current?.focus() // keep focus so the user keeps typing
  }

  if (csvName) {
    return (
      <div className="flex flex-col gap-2">
        <div
          className="flex items-center gap-2 px-2 py-2"
          style={{ border: '1px dashed rgb(var(--accent2-rgb) / 0.4)', background: 'rgb(var(--accent2-rgb) / 0.05)' }}
        >
          <FileText size={14} style={{ color: CYAN }} />
          <span className="font-term text-[12px] truncate flex-1" style={{ color: CYAN }} title={csvName}>
            {csvName}
          </span>
          <button className="metal-key px-2 h-6 font-term text-[10px]" onClick={() => setInputText('')}>
            clear
          </button>
        </div>
        <button
          className="metal-key is-primary px-3 h-7 font-term text-[10px] tracking-[1px] flex items-center justify-center gap-1.5 disabled:opacity-40"
          onClick={submit}
          disabled={resolving}
        >
          {resolving ? <Loader size={12} className="animate-spin" /> : <Download size={12} />} resolve CSV
        </button>
      </div>
    )
  }

  return (
    <div className="flex gap-1.5 items-stretch">
      <textarea
        ref={ref}
        value={inputText}
        onChange={(e) => setInputText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            submit()
          }
        }}
        rows={2}
        placeholder="Artist - Track  ↵   (or a YouTube URL / id)"
        spellCheck={false}
        className="flex-1 font-term text-[13px] leading-[1.4] px-2 py-1.5 outline-none resize-none placeholder:opacity-30"
        style={{
          background: '#000',
          border: '1px solid rgb(var(--accent-rgb) / 0.25)',
          color: GREEN,
          borderRadius: 0,
        }}
        onFocus={(e) => (e.currentTarget.style.borderColor = 'rgb(var(--accent-rgb) / 0.55)')}
        onBlur={(e) => (e.currentTarget.style.borderColor = 'rgb(var(--accent-rgb) / 0.25)')}
      />
      <button
        className="metal-key is-primary px-2 flex items-center justify-center disabled:opacity-40"
        onClick={submit}
        title="Add (Enter) — Shift+Enter for a new line"
      >
        <Download size={13} />
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------

function EnvironmentSection({ onOpenSettings }: { onOpenSettings: () => void }) {
  const s = useDownloaderStore()
  const { preflight, preflightLoading, installing, auth } = s
  const checks = preflight?.checks ?? []
  const fixable = checks.some(
    (c) => !c.ok && c.fix && c.fix.tool && ['yt-dlp', 'ytmusicapi', 'ffmpeg', 'deno'].includes(c.fix.tool)
  )
  const hasIssues = checks.some((c) => !c.ok)
  const [expanded, setExpanded] = useState(false)
  const open = expanded || hasIssues || installing
  const { text: summary, color: headColor } = preflightSummary(preflight, preflightLoading)

  const method = auth?.method ?? 'browser'
  const signedIn = !!auth?.connected
  const authLabel =
    method === 'in-app'
      ? signedIn
        ? 'signed in (in-app)'
        : 'not signed in'
      : method === 'file'
      ? 'cookies.txt'
      : `browser: ${auth?.browser ?? 'firefox'}`

  return (
    <div className="px-4 py-2.5 space-y-1.5" style={{ borderBottom: '1px solid rgb(var(--accent-rgb) / 0.08)', background: '#01130a' }}>
      <div className="flex items-center gap-2">
        <span
          style={{
            display: 'inline-block',
            width: 6,
            height: 6,
            borderRadius: 999,
            background: headColor,
            boxShadow: `0 0 6px ${headColor}`,
            flexShrink: 0,
          }}
        />
        <span className="font-term text-[11px] tracking-[0.5px] flex-1 min-w-0 truncate" style={{ color: headColor }}>
          {summary}
        </span>
        {fixable && !installing && (
          <button
            className="metal-key is-primary px-1.5 h-5 font-term text-[9px] tracking-[0.5px] flex items-center gap-1"
            onClick={s.fixIt}
            title="Install the missing tools"
          >
            <Wrench size={10} /> fix
          </button>
        )}
        <button className="metal-key px-1 h-5" onClick={() => s.loadPreflight()} disabled={preflightLoading || installing} title="Re-check">
          <RefreshCw size={10} />
        </button>
        <button className="metal-key px-1 h-5" onClick={() => setExpanded((v) => !v)} title={open ? 'Hide' : 'Details'}>
          {open ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
        </button>
      </div>

      {/* one-line auth status — full sign-in setup lives in Settings */}
      <div className="flex items-center gap-1.5">
        <span className="font-term text-[10px]" style={{ color: INK_FAINT }}>
          YT:
        </span>
        <span className="font-term text-[10px] truncate" style={{ color: signedIn ? GREEN : CYAN }}>
          {authLabel}
        </span>
        <button
          className="flex items-center gap-1 font-term text-[9px] tracking-[0.5px] px-1"
          style={{ color: INK_DIM }}
          onClick={onOpenSettings}
          title="Set up YouTube sign-in in Settings → Add Music"
        >
          <SettingsIcon size={9} /> set up
        </button>
      </div>

      {open && (
        <div className="flex flex-col gap-1 pt-1" style={{ maxHeight: 220, overflowY: 'auto' }}>
          {checks.map((c) => (
            <CheckRow key={c.id} check={c} />
          ))}
          {installing && <InstallLog />}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------

function RowCard({ row }: { row: PreviewRow }) {
  const st = useDownloaderStore()
  const [expanded, setExpanded] = useState(false)
  const resolved = !!row.id
  const failed = row.status === 'failed'
  const active = row.dlStage === 'queued' || row.dlStage === 'downloading' || row.dlStage === 'embedding'
  const hasStage = !!row.dlStage
  const drawerOpen = expanded || row.swapOpen || row.pinDraft !== undefined || row.editing

  return (
    <div className="border-b py-1.5" style={{ borderColor: 'rgb(var(--accent-rgb) / 0.07)', opacity: !hasStage && !row.accepted && !failed ? 0.55 : 1 }}>
      <div className="flex items-start gap-1.5">
        {/* accept checkbox (only before a row is queued/downloaded) */}
        {!hasStage && (
          <button
            onClick={() => st.toggleAccept(row.i)}
            disabled={!resolved || failed}
            title={failed ? 'Could not resolve' : row.accepted ? 'Included' : 'Excluded'}
            className="flex items-center justify-center flex-shrink-0 mt-0.5"
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

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 min-w-0">
            {row.candidatesLoading ? (
              <Loader size={11} className="animate-spin flex-shrink-0" style={{ color: CYAN }} />
            ) : (
              <ConfidenceBadge c={row.confidence} explicit={row.explicit} />
            )}
            <span className="font-term text-[12px] truncate" style={{ color: resolved ? '#cfeede' : failed ? RED : INK_FAINT }}>
              {resolved ? `${row.channel ?? ''} · ${row.title ?? ''}` : failed ? `✗ ${row.reason ?? 'no match'}` : '…'}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="font-term text-[10px] truncate flex-1" style={{ color: INK_FAINT }} title={row.query}>
              ↳ {row.query}
            </span>
            {resolved && row.duration ? (
              <span className="font-term text-[10px] tabular-nums flex-shrink-0" style={{ color: INK_FAINT }}>
                {fmtDuration(row.duration)}
              </span>
            ) : null}
          </div>
          {hasStage && (
            <div className="mt-1">
              <StageLabel row={row} />
            </div>
          )}
        </div>

        {/* inline controls — hidden while a row is actively downloading */}
        {!active && (
          <div className="flex items-center gap-0.5 flex-shrink-0">
            {!hasStage && (
              <button
                className="metal-key w-6 h-6"
                title="More — swap / pin / edit"
                onClick={() => setExpanded((v) => !v)}
                style={drawerOpen ? { color: CYAN, borderColor: 'rgb(var(--accent2-rgb) / 0.5)' } : undefined}
              >
                {drawerOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </button>
            )}
            <button className="metal-key w-6 h-6" title="Remove" onClick={() => st.removeRow(row.i)} style={{ color: 'rgba(255,120,120,0.8)' }}>
              <Trash2 size={12} />
            </button>
          </div>
        )}
      </div>

      {/* expander drawer: swap / pin / edit (collapsed by default) */}
      {drawerOpen && !hasStage && (
        <div className="mt-1.5 pl-[22px] flex flex-col gap-1.5">
          <div className="flex items-center gap-1">
            <RowButton title="Swap version" onClick={() => st.toggleSwap(row.i)} active={row.swapOpen}>
              <Repeat size={12} />
            </RowButton>
            <RowButton
              title="Pin a YouTube URL / id"
              onClick={() => st.setPinDraft(row.i, row.pinDraft === undefined ? '' : row.pinDraft)}
              active={row.pinDraft !== undefined}
            >
              <Pin size={12} />
            </RowButton>
            <RowButton title="Edit query" onClick={() => st.startEdit(row.i)} active={row.editing}>
              <Pencil size={12} />
            </RowButton>
          </div>

          {row.editing && (
            <div className="flex items-center gap-1">
              <input
                autoFocus
                value={row.draftQuery ?? ''}
                onChange={(e) => st.setDraftQuery(row.i, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') st.commitEdit(row.i)
                  if (e.key === 'Escape') st.cancelEdit(row.i)
                }}
                className="flex-1 min-w-0 font-term text-[12px] px-2 py-0.5 outline-none"
                style={{ background: '#000', border: `1px solid ${GREEN}`, color: GREEN }}
              />
              <button className="metal-key px-2 h-6 font-term text-[10px]" onClick={() => st.commitEdit(row.i)}>
                go
              </button>
            </div>
          )}

          {row.pinDraft !== undefined && (
            <div className="flex items-center gap-1">
              <input
                autoFocus
                value={row.pinDraft}
                onChange={(e) => st.setPinDraft(row.i, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') st.commitPin(row.i)
                  if (e.key === 'Escape') st.setPinDraft(row.i, undefined as unknown as string)
                }}
                placeholder="youtu.be/ID or 11-char id"
                className="flex-1 min-w-0 font-term text-[12px] px-2 py-0.5 outline-none placeholder:opacity-40"
                style={{ background: '#000', border: `1px solid ${CYAN}`, color: CYAN }}
              />
              <button className="metal-key px-2 h-6 font-term text-[10px]" onClick={() => st.commitPin(row.i)}>
                pin
              </button>
            </div>
          )}

          {row.swapOpen && <SwapMenu row={row} indent={false} />}
        </div>
      )}
    </div>
  )
}
