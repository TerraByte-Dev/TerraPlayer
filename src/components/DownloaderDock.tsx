import { X, Maximize2, Loader } from 'lucide-react'
import { useDownloaderStore } from '@/store/downloader'
import { StageLabel } from './Downloader'
import { summarizeRun } from '@/lib/downloader-progress'

// Slim right-side progress monitor — the downloader minimized out of the way.
// Mirrors QueuePanel's chrome (w-64 aside, var(--bg-1), left border). Reads the
// same store as the modal; the single app-level event listener keeps it live.
const GREEN = 'var(--accent)'
const CYAN = 'var(--accent2)'
const RED = '#FF3030'
const INK_FAINT = 'rgb(var(--ink-rgb) / 0.30)'

export default function DownloaderDock() {
  const s = useDownloaderStore()
  // Show only the rows in this run, in the order they were queued.
  const ordered = s.downloadOrder
    .map((i) => s.rows.find((r) => r.i === i))
    .filter((r): r is NonNullable<typeof r> => !!r)
  const prog = summarizeRun(s.rows, s.downloadOrder)

  return (
    <aside
      className="w-64 flex-shrink-0 flex flex-col overflow-hidden"
      style={{ borderLeft: '1px solid rgb(var(--accent-rgb) / 0.18)', background: 'var(--bg-1)' }}
    >
      {/* header */}
      <div
        className="px-4 py-3 flex items-center justify-between flex-shrink-0"
        style={{ borderBottom: '1px solid rgb(var(--accent-rgb) / 0.10)' }}
      >
        <h3
          className="font-mono text-[9px] uppercase tracking-[2px] flex items-center gap-1.5"
          style={{ color: CYAN }}
        >
          {s.busy && <Loader size={10} className="animate-spin" />}
          {s.busy ? 'Downloading' : 'Downloader'}
        </h3>
        <div className="flex items-center gap-1">
          <button className="metal-key w-6 h-6" onClick={s.popOut} title="Pop out to full window">
            <Maximize2 size={11} />
          </button>
          {!s.busy && (
            <button className="metal-key w-6 h-6" onClick={s.closePanel} title="Close">
              <X size={11} />
            </button>
          )}
        </div>
      </div>

      {/* rows */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        {ordered.length === 0 ? (
          <p className="font-term text-[12px] p-3 text-center" style={{ color: INK_FAINT }}>
            no active download.
          </p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {ordered.map((row) => {
              const name = row.channel ? `${row.channel} · ${row.title ?? ''}` : row.stem || row.query
              return (
                <div key={row.i} className="flex flex-col gap-1">
                  <span
                    className="font-term text-[13px] truncate"
                    style={{ color: row.id ? '#cfeede' : INK_FAINT }}
                    title={name}
                  >
                    {name}
                  </span>
                  <StageLabel row={row} />
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* footer */}
      <div
        className="px-4 py-3 flex items-center gap-2 flex-shrink-0"
        style={{ borderTop: '1px solid rgb(var(--accent-rgb) / 0.10)' }}
      >
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
        ) : s.summary ? (
          <>
            <span className="font-term text-[11px]" style={{ color: GREEN }}>
              {s.summary.new} new
            </span>
            {s.summary.failed > 0 && (
              <span className="font-term text-[11px]" style={{ color: RED }}>
                {s.summary.failed} failed
              </span>
            )}
            <div className="flex-1" />
            <span className="font-term text-[10px]" style={{ color: s.reindexed ? GREEN : INK_FAINT }}>
              {s.reindexed ? '✓ reindexed' : 'reindexing…'}
            </span>
          </>
        ) : (
          <span className="font-term text-[11px]" style={{ color: INK_FAINT }}>
            idle
          </span>
        )}
      </div>
    </aside>
  )
}
