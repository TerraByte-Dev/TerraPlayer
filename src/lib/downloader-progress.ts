// Pure, dependency-free progress math for the downloader's docked monitor.
// Unit-tested in src/lib/__tests__/downloader-progress.test.mjs. No store/React.

export type DlStage = 'queued' | 'downloading' | 'embedding' | 'done' | 'failed' | 'skipped'

export interface RunRow {
  i: number
  dlStage?: DlStage
}

export interface RunProgress {
  total: number // rows selected for this download run
  done: number // completed OK
  skipped: number // already-had-it
  failed: number
  active: number // downloading | embedding
  pending: number // queued or not-yet-started
  finished: number // done + skipped + failed (terminal states)
  complete: boolean // every selected row reached a terminal state
}

/**
 * Summarize a download run from its rows + the order of selected row indices.
 * Only rows whose `i` is in `downloadOrder` count (others were unselected in the
 * preview). `total` is the run size (downloadOrder.length), so a row that is in
 * the order but missing from `rows` simply leaves the run short of complete.
 * Drives the docked monitor's "N / M" footer and the run-settled check.
 */
export function summarizeRun(
  rows: readonly RunRow[],
  downloadOrder: readonly number[]
): RunProgress {
  const inRun = new Set(downloadOrder)
  let done = 0
  let skipped = 0
  let failed = 0
  let active = 0
  let pending = 0
  for (const r of rows) {
    if (!inRun.has(r.i)) continue
    switch (r.dlStage) {
      case 'done':
        done++
        break
      case 'skipped':
        skipped++
        break
      case 'failed':
        failed++
        break
      case 'downloading':
      case 'embedding':
        active++
        break
      default: // 'queued' or undefined
        pending++
        break
    }
  }
  const total = downloadOrder.length
  const finished = done + skipped + failed
  return {
    total,
    done,
    skipped,
    failed,
    active,
    pending,
    finished,
    complete: total > 0 && finished === total,
  }
}
