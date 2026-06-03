/**
 * downloader — IPC glue that wraps the Media project's download_music.py CLI.
 *
 * The backend (download_music.py) speaks NDJSON over stdout in --json mode; this
 * module spawns it (mirroring metadata.ts's tag_writer.py spawn pattern), frames
 * the NDJSON stream, and exposes:
 *   preflight()            — environment check for the launch banner
 *   resolve()              — batch preview (no download); returns one row/song
 *   candidates(query)      — version list for the "swap version" picker
 *   download(sender,rows)  — streams progress events to the renderer; returns summary
 *   cancelDownload()       — kills an in-flight download (process tree)
 *
 * Script + output-dir resolution (and their precedence) live in downloader-core.ts
 * so they're unit-testable without electron.
 */
import { spawn, execFileSync, type ChildProcessWithoutNullStreams } from 'child_process'
import { app } from 'electron'
import type { WebContents } from 'electron'
import { join } from 'path'
import { existsSync, mkdtempSync, writeFileSync, rmSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import {
  LineBuffer,
  parseNdjson,
  buildTaskLines,
  orderedScriptCandidates,
  orderedOutputCandidates,
  pickFirstExisting,
  installCommand,
  mergePath,
  type DownloadRow,
} from './downloader-core'
import { resolveCookieArgs } from './ytauth'

export interface CookieOpts {
  cookiesFromBrowser?: string
  cookiesFile?: string
}

export interface PreflightCheck {
  id: string
  ok: boolean
  severity: 'ok' | 'warn' | 'error'
  label: string
  detail: string
  fix?: { kind: string; tool?: string; command?: string }
}

// Canonical home of the backend + library (single source of truth in the Media
// project). Used as the final fallback so the integration works out-of-the-box
// on the dev machine; override per-machine via env vars or downloader.local.json.
const CANONICAL_SCRIPT = 'C:\\Users\\tatew\\Desktop\\Media\\Tools\\MusicDownloader\\download_music.py'
const CANONICAL_OUT = 'C:\\Users\\tatew\\Desktop\\Media\\Music'

interface LocalConfig {
  script?: string
  out?: string
  python?: string
  cookiesFromBrowser?: string
}

function readLocalConfig(): LocalConfig {
  try {
    const p = join(app.getAppPath(), 'downloader.local.json')
    if (existsSync(p)) return JSON.parse(readFileSync(p, 'utf-8')) as LocalConfig
  } catch {
    /* malformed local config — ignore and fall through to defaults */
  }
  return {}
}

function pythonCmd(): string {
  return readLocalConfig().python || process.env.TPLAY_PYTHON || 'python'
}

export function resolveScriptPath(): string | null {
  const local = readLocalConfig()
  const candidates = orderedScriptCandidates({
    env: process.env.TPLAY_DOWNLOADER_SCRIPT,
    localScript: local.script,
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    appPath: app.getAppPath(),
    canonical: CANONICAL_SCRIPT,
    join,
  })
  return pickFirstExisting(candidates, existsSync)
}

export function resolveOutputDir(preferred?: string): string {
  const local = readLocalConfig()
  const candidates = orderedOutputCandidates({
    env: process.env.TPLAY_MUSIC_OUT,
    preferred,
    localOut: local.out,
    canonical: CANONICAL_OUT,
  })
  // Prefer an output dir that already exists; otherwise take the highest-priority
  // candidate (it'll be created on first download).
  return pickFirstExisting(candidates, existsSync) ?? candidates[0] ?? CANONICAL_OUT
}

// Cookie source resolution lives in ytauth.ts (persisted auth state); callers
// pass an optional per-call override that ytauth honours first.
function cookieArgs(opts?: CookieOpts): string[] {
  return resolveCookieArgs(opts)
}

// --- temp task files --------------------------------------------------------

function writeTempTasks(lines: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), 'tplay-dl-'))
  const file = join(dir, 'tasks.txt')
  writeFileSync(file, lines.join('\n') + '\n', 'utf-8')
  return file
}

function cleanupTemp(file: string): void {
  try {
    rmSync(join(file, '..'), { recursive: true, force: true })
  } catch {
    /* best-effort */
  }
}

// --- process helpers --------------------------------------------------------

function killTree(child: ChildProcessWithoutNullStreams): void {
  if (process.platform === 'win32' && child.pid) {
    try {
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true })
    } catch {
      /* ignore */
    }
  } else {
    try {
      child.kill('SIGTERM')
    } catch {
      /* ignore */
    }
  }
}

interface CollectResult {
  events: Record<string, unknown>[]
  stderr: string
  code: number | null
}

/** Run the backend once and collect every NDJSON event (no streaming). */
function runCollect(scriptArgs: string[], timeoutMs: number): Promise<CollectResult> {
  return new Promise((resolve) => {
    const script = resolveScriptPath()
    if (!script) {
      resolve({ events: [], stderr: 'download_music.py not found', code: -1 })
      return
    }
    const child = spawn(pythonCmd(), [script, ...scriptArgs], { windowsHide: true })
    const lb = new LineBuffer()
    const events: Record<string, unknown>[] = []
    let stderr = ''
    const timer = setTimeout(() => killTree(child), timeoutMs)

    child.stdout.setEncoding('utf-8')
    child.stdout.on('data', (d: string) => {
      for (const line of lb.push(d)) {
        const e = parseNdjson(line)
        if (e) events.push(e)
      }
    })
    child.stderr.setEncoding('utf-8')
    child.stderr.on('data', (d: string) => {
      stderr += d
    })
    child.on('error', (err) => {
      clearTimeout(timer)
      resolve({ events, stderr: stderr + String(err), code: -1 })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      for (const line of lb.flush()) {
        const e = parseNdjson(line)
        if (e) events.push(e)
      }
      resolve({ events, stderr, code })
    })
  })
}

// --- public API -------------------------------------------------------------

export interface PreflightResult {
  ok: boolean
  problems: string[]
  checks: PreflightCheck[]
}

export async function preflight(
  opts?: CookieOpts & { noAuthProbe?: boolean }
): Promise<PreflightResult> {
  const script = resolveScriptPath()
  if (!script) {
    return {
      ok: false,
      problems: [
        'download_music.py not found. Set TPLAY_DOWNLOADER_SCRIPT, add hub/downloader.local.json {"script":"…"}, or place the script next to the app.',
      ],
      checks: [{
        id: 'script', ok: false, severity: 'error', label: 'downloader',
        detail: 'download_music.py not found on this machine.',
      }],
    }
  }
  const args = ['--json', '--preflight-only', ...cookieArgs(opts)]
  if (opts?.noAuthProbe) args.push('--no-auth-probe')
  // The auth probe is a network call (up to ~45s); give it room.
  const { events, stderr, code } = await runCollect(args, 70000)
  const pf = events.find((e) => e.event === 'preflight') as
    | { ok: boolean; problems: string[]; checks?: PreflightCheck[] }
    | undefined
  if (!pf) {
    const missingPython = /not recognized|enoent|no such file/i.test(stderr)
    return {
      ok: false,
      problems: [
        stderr.trim() ||
          `Could not run the downloader (python exit ${code}). Is Python on PATH? Try "${pythonCmd()}".`,
      ],
      checks: [{
        id: 'python', ok: false, severity: 'error', label: 'Python',
        detail: missingPython
          ? `Python ("${pythonCmd()}") not found on PATH. Install Python 3 and tick "Add to PATH".`
          : `The downloader failed to run (exit ${code}).`,
        fix: { kind: 'manual', tool: 'python' },
      }],
    }
  }
  return { ok: pf.ok, problems: pf.problems || [], checks: pf.checks || [] }
}

// --- one-click install (Windows) -------------------------------------------

/** Run a command, streaming each output line; resolve with its exit code. */
function runStreamed(
  cmd: string,
  args: string[],
  onLine: (line: string) => void,
  timeoutMs = 600000
): Promise<number> {
  return new Promise((resolve) => {
    let child: ChildProcessWithoutNullStreams
    try {
      child = spawn(cmd, args, { windowsHide: true })
    } catch (e) {
      onLine(String(e))
      resolve(-1)
      return
    }
    const lb = new LineBuffer()
    const timer = setTimeout(() => killTree(child), timeoutMs)
    const pump = (d: string): void => {
      for (const l of lb.push(d)) onLine(l)
    }
    child.stdout.setEncoding('utf-8')
    child.stdout.on('data', pump)
    child.stderr.setEncoding('utf-8')
    child.stderr.on('data', pump)
    child.on('error', (err) => {
      clearTimeout(timer)
      onLine(String(err))
      resolve(-1)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      for (const l of lb.flush()) onLine(l)
      resolve(code ?? -1)
    })
  })
}

/**
 * After a winget install, the running process still has the OLD PATH. Re-read
 * the user+machine PATH from the environment and fold in the winget Links dir so
 * the immediately-following re-check (and later spawns) can see new tools — no
 * app restart needed.
 */
function refreshPath(): void {
  if (process.platform !== 'win32') return
  try {
    const fresh = execFileSync(
      'powershell',
      ['-NoProfile', '-Command',
       "[Environment]::GetEnvironmentVariable('Path','User') + ';' + [Environment]::GetEnvironmentVariable('Path','Machine')"],
      { encoding: 'utf-8', timeout: 15000, windowsHide: true }
    )
    const wingetLinks = process.env.LOCALAPPDATA
      ? join(process.env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Links')
      : undefined
    process.env.PATH = mergePath([wingetLinks, fresh, process.env.PATH])
  } catch {
    /* keep the existing PATH if the refresh fails */
  }
}

export async function installTools(
  sender: WebContents,
  tools: string[],
  cookieOpts?: CookieOpts
): Promise<PreflightResult> {
  const py = pythonCmd()
  const sendI = (p: Record<string, unknown>): void => {
    if (!sender.isDestroyed()) sender.send('dl:install-event', p)
  }
  for (const tool of tools) {
    const spec = installCommand(tool, py)
    if (!spec) continue
    sendI({ tool, status: 'start', command: `${spec.cmd} ${spec.args.join(' ')}` })
    const code = await runStreamed(spec.cmd, spec.args, (line) => sendI({ tool, line }))
    // winget returns non-zero for "already installed"; the re-check below is the
    // real verdict, so report neutrally rather than alarming the user.
    sendI({ tool, status: 'finished', code })
  }
  refreshPath()
  const pf = await preflight(cookieOpts)
  sendI({ status: 'complete' })
  return pf
}

export interface ResolvedRow {
  i: number
  query: string
  id: string | null
  title: string | null
  channel: string | null
  album: string | null
  duration: number | null
  confidence: string
  source: string
  explicit: boolean | null
  stem: string | null
  status: string
  reason?: string
}

export interface ResolvePayload {
  lines?: string[]
  csvPath?: string
}

export async function resolve(
  payload: ResolvePayload
): Promise<{ rows: ResolvedRow[]; problems: string[]; error?: string }> {
  const args = ['--json', '--dry-run']
  let tmp: string | null = null
  if (payload.csvPath) {
    args.push('--csv', payload.csvPath)
  } else {
    tmp = writeTempTasks(payload.lines || [])
    args.push('--from-file', tmp)
  }
  try {
    const { events, stderr } = await runCollect(args, 600000)
    const pf = events.find((e) => e.event === 'preflight') as
      | { problems?: string[] }
      | undefined
    const resolved = events.filter((e) => e.event === 'resolved') as unknown as ResolvedRow[]
    const doneByI = new Map<number, Record<string, unknown>>()
    for (const e of events) if (e.event === 'done') doneByI.set(e.i as number, e)

    const rows: ResolvedRow[] = resolved.map((r) => ({
      ...r,
      status: (doneByI.get(r.i)?.status as string) ?? 'preview',
    }))
    // Songs that never resolved (no candidates) appear only as a failed 'done'.
    for (const e of events) {
      if (e.event === 'done' && e.status === 'failed' && !rows.find((r) => r.i === e.i)) {
        rows.push({
          i: e.i as number,
          query: (e.query as string) ?? '',
          id: null,
          title: null,
          channel: null,
          album: null,
          duration: null,
          confidence: 'LOW',
          source: 'none',
          explicit: null,
          stem: (e.stem as string) ?? null,
          status: 'failed',
          reason: e.reason as string,
        })
      }
    }
    rows.sort((a, b) => a.i - b.i)
    return {
      rows,
      problems: pf?.problems ?? [],
      error: rows.length ? undefined : stderr.trim() || undefined,
    }
  } finally {
    if (tmp) cleanupTemp(tmp)
  }
}

export interface Candidate {
  source: string
  id: string
  artist: string
  title: string
  album: string | null
  duration: number | null
  explicit: boolean | null
  confidence: string
}

export async function candidates(query: string): Promise<Candidate[]> {
  const { events } = await runCollect(['--json', '--candidates-json', query], 120000)
  const ev = events.find((e) => e.event === 'candidates') as
    | { candidates: Candidate[] }
    | undefined
  return ev?.candidates ?? []
}

let activeDownload: ChildProcessWithoutNullStreams | null = null

export function download(
  sender: WebContents,
  rows: DownloadRow[],
  outDir: string,
  cookieOpts?: CookieOpts
): Promise<{ summary: Record<string, unknown> | null; error?: string }> {
  return new Promise((resolveDone) => {
    const script = resolveScriptPath()
    if (!script) {
      send(sender, { event: 'fatal', message: 'download_music.py not found' })
      resolveDone({ summary: null, error: 'script not found' })
      return
    }
    const lines = buildTaskLines(rows)
    if (!lines.length) {
      resolveDone({ summary: null, error: 'no rows' })
      return
    }
    const tmp = writeTempTasks(lines)
    const args = [script, '--json', '--from-file', tmp, '--out', outDir, ...cookieArgs(cookieOpts)]
    const child = spawn(pythonCmd(), args, { windowsHide: true })
    activeDownload = child
    const lb = new LineBuffer()
    let summary: Record<string, unknown> | null = null
    let stderr = ''

    // Stall guard: a batch can legitimately run a long time (politeness sleeps),
    // so cap on *silence* rather than total duration — kill if the backend emits
    // nothing at all for IDLE_MS. Every stdout/stderr chunk rearms the timer.
    const IDLE_MS = 6 * 60 * 1000
    let watchdog: ReturnType<typeof setTimeout>
    const kick = (): void => {
      clearTimeout(watchdog)
      watchdog = setTimeout(() => killTree(child), IDLE_MS)
    }
    kick()

    const handle = (line: string): void => {
      const e = parseNdjson(line)
      if (!e) return
      if (e.event === 'summary') summary = e
      send(sender, e)
    }

    child.stdout.setEncoding('utf-8')
    child.stdout.on('data', (d: string) => {
      kick()
      for (const line of lb.push(d)) handle(line)
    })
    child.stderr.setEncoding('utf-8')
    child.stderr.on('data', (d: string) => {
      kick()
      stderr += d
    })
    child.on('error', (err) => {
      clearTimeout(watchdog)
      activeDownload = null // don't leave a dead handle that cancelDownload can't reach
      send(sender, { event: 'fatal', message: String(err) + (stderr ? '\n' + stderr : '') })
    })
    child.on('close', (code) => {
      clearTimeout(watchdog)
      for (const line of lb.flush()) handle(line)
      activeDownload = null
      cleanupTemp(tmp)
      send(sender, { event: 'closed', code })
      resolveDone({ summary, error: summary ? undefined : stderr.trim() || `exited ${code}` })
    })
  })
}

export function cancelDownload(): { cancelled: boolean } {
  if (activeDownload) {
    killTree(activeDownload)
    activeDownload = null
    return { cancelled: true }
  }
  return { cancelled: false }
}

export function readTextFile(path: string): string {
  try {
    return readFileSync(path, 'utf-8')
  } catch {
    return ''
  }
}

function send(sender: WebContents, payload: Record<string, unknown>): void {
  if (!sender.isDestroyed()) sender.send('dl:event', payload)
}
