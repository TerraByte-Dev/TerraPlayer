/**
 * downloader-core — pure, dependency-free helpers for the music-downloader IPC.
 *
 * Deliberately imports nothing from electron/node so it can be unit-tested in a
 * bare Node process (see __tests__/downloader-core.test.mjs). The electron-bound
 * glue lives in downloader.ts, which composes these with node's path/fs/child_process.
 */

export const YT_WATCH = 'https://www.youtube.com/watch?v='

export function watchUrl(id: string): string {
  return YT_WATCH + id
}

/**
 * Streaming NDJSON line framer. The Python backend emits one JSON object per
 * line, but a child process's stdout arrives in arbitrary chunks (a line can be
 * split across two 'data' events, or several lines can land in one). Feed every
 * chunk through push(); it returns only the COMPLETE lines and retains any
 * trailing partial until the next chunk. Call flush() after 'close'.
 */
export class LineBuffer {
  private buf = ''

  push(chunk: string): string[] {
    this.buf += chunk
    const parts = this.buf.split('\n')
    this.buf = parts.pop() ?? ''
    return parts.map((s) => s.replace(/\r$/, '')).filter((s) => s.length > 0)
  }

  flush(): string[] {
    const rest = this.buf.replace(/\r$/, '')
    this.buf = ''
    return rest.length ? [rest] : []
  }
}

/** Parse one NDJSON line; returns null (not throws) on non-JSON noise. */
export function parseNdjson(line: string): Record<string, unknown> | null {
  try {
    return JSON.parse(line) as Record<string, unknown>
  } catch {
    return null
  }
}

export interface DownloadRow {
  stem: string
  id: string
}

/**
 * Build "<stem> | <watchUrl>" task-file lines. Pinning every accepted row to its
 * exact chosen video id is what guarantees the download grabs the SAME version
 * the user previewed/approved (and skips re-resolving). stems are pre-sanitised
 * by the backend and can never contain '|', so the delimiter is unambiguous.
 */
export function buildTaskLines(rows: DownloadRow[]): string[] {
  return rows
    .filter((r) => r && r.id && r.stem)
    .map((r) => `${r.stem} | ${watchUrl(r.id)}`)
}

export interface ScriptResolveOpts {
  env?: string
  localScript?: string
  isPackaged: boolean
  resourcesPath?: string
  appPath: string
  canonical?: string
  join: (...parts: string[]) => string
}

/**
 * Candidate script locations in precedence order (highest first):
 *   1. TPLAY_DOWNLOADER_SCRIPT env override
 *   2. hub/downloader.local.json -> "script" (gitignored, per-machine)
 *   3. packaged: <resources>/download_music.py (bundled via extraResources)
 *   4. <appPath>/../download_music.py (colocated copy, mirrors tag_writer.py)
 *   5. canonical Media-project path (works out-of-the-box on the dev machine)
 */
export function orderedScriptCandidates(o: ScriptResolveOpts): string[] {
  const candidates: (string | undefined)[] = [
    o.env,
    o.localScript,
    o.isPackaged && o.resourcesPath ? o.join(o.resourcesPath, 'download_music.py') : undefined,
    o.join(o.appPath, '..', 'download_music.py'),
    o.canonical,
  ]
  return candidates.filter((x): x is string => !!x)
}

export interface OutResolveOpts {
  env?: string
  preferred?: string
  localOut?: string
  canonical: string
}

/**
 * Output-directory candidates in precedence order:
 *   1. TPLAY_MUSIC_OUT env override
 *   2. preferred (the library folder the user is currently viewing)
 *   3. hub/downloader.local.json -> "out"
 *   4. canonical Media/Music
 */
export function orderedOutputCandidates(o: OutResolveOpts): string[] {
  return [o.env, o.preferred, o.localOut, o.canonical].filter((x): x is string => !!x)
}

/** First path that exists, else null. */
export function pickFirstExisting(paths: string[], exists: (p: string) => boolean): string | null {
  for (const p of paths) if (exists(p)) return p
  return null
}

export interface InstallSpec {
  cmd: string
  args: string[]
}

/**
 * How to install a given missing tool. pip tools go through the resolved python;
 * winget tools install per-user non-interactively. Returns null for tools we
 * can't auto-install (e.g. python itself, or YouTube login).
 */
export function installCommand(tool: string, python: string): InstallSpec | null {
  switch (tool) {
    case 'yt-dlp':
      return { cmd: python, args: ['-m', 'pip', 'install', '-U', 'yt-dlp'] }
    case 'ytmusicapi':
      return { cmd: python, args: ['-m', 'pip', 'install', '-U', 'ytmusicapi'] }
    case 'ffmpeg':
      return {
        cmd: 'winget',
        args: ['install', '-e', '--id', 'Gyan.FFmpeg', '--accept-source-agreements',
               '--accept-package-agreements', '--disable-interactivity'],
      }
    case 'deno':
      return {
        cmd: 'winget',
        args: ['install', '-e', '--id', 'DenoLand.Deno', '--accept-source-agreements',
               '--accept-package-agreements', '--disable-interactivity'],
      }
    default:
      return null
  }
}

/** Which tools "Fix it for me" can actually install (the rest need manual steps). */
export function isInstallable(tool: string | undefined): boolean {
  return tool === 'yt-dlp' || tool === 'ytmusicapi' || tool === 'ffmpeg' || tool === 'deno'
}

/**
 * Merge several PATH strings (e.g. a freshly-read user+machine PATH and the
 * winget Links dir) into one, de-duplicated case-insensitively, order-preserving.
 * Used after an install so newly-installed tools are visible without restarting.
 */
export function mergePath(parts: (string | undefined)[]): string {
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of parts) {
    if (!part) continue
    for (const seg of part.split(';')) {
      const s = seg.trim()
      if (!s) continue
      const key = s.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push(s)
    }
  }
  return out.join(';')
}

// --- YouTube auth ----------------------------------------------------------

/** How the app currently authenticates to YouTube. */
export interface AuthState {
  method: 'in-app' | 'browser' | 'file'
  browser?: string
  file?: string
}

/** Minimal cookie shape we need from Electron's session.cookies.get(). */
export interface NetscapeCookie {
  domain: string
  path?: string
  secure?: boolean
  expirationDate?: number
  name: string
  value: string
}

/**
 * Serialise cookies to the Netscape `cookies.txt` format yt-dlp reads.
 * Tab-separated: domain, includeSubdomains, path, secure, expiry, name, value.
 * Session cookies (no expiry) get 0, which yt-dlp treats as session-scoped.
 */
export function toNetscape(cookies: NetscapeCookie[]): string {
  const lines = ['# Netscape HTTP Cookie File', '# Auto-generated by T-Play — do not edit']
  for (const c of cookies) {
    if (!c.name) continue
    const includeSub = c.domain.startsWith('.') ? 'TRUE' : 'FALSE'
    const expiry = c.expirationDate ? Math.floor(c.expirationDate) : 0
    lines.push(
      [c.domain, includeSub, c.path || '/', c.secure ? 'TRUE' : 'FALSE',
       String(expiry), c.name, c.value].join('\t')
    )
  }
  return lines.join('\n') + '\n'
}

/**
 * Allowlist for the in-app sign-in window: only Google/YouTube (and their asset
 * hosts + regional Google domains) may load; anything else is opened externally.
 * Non-http(s) schemes (about:/data:/blob:) are allowed — they aren't an external
 * site and blocking them can break the login page. Security-critical: a redirect
 * to an off-site host must never capture the session.
 */
export function isAllowedAuthUrl(url: string): boolean {
  try {
    const u = new URL(url)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return true
    const h = u.hostname.toLowerCase()
    return (
      h === 'google.com' ||
      h.endsWith('.google.com') ||
      h === 'youtube.com' ||
      h.endsWith('.youtube.com') ||
      h.endsWith('.googleusercontent.com') ||
      h.endsWith('.gstatic.com') ||
      h.endsWith('.ytimg.com') ||
      h.endsWith('.googleapis.com') ||
      /\.google\.[a-z.]{2,}$/.test(h)
    )
  } catch {
    return false
  }
}

/**
 * Resolve the yt-dlp cookie args for a persisted auth state. The in-app and file
 * methods only win if the cookie file actually exists on disk (so a stale state
 * can't silently disable auth); otherwise we fall back to a browser read.
 */
export function cookieArgsForAuth(
  state: AuthState,
  managedPath: string,
  exists: (p: string) => boolean
): string[] {
  if (state.method === 'in-app' && exists(managedPath)) return ['--cookies', managedPath]
  if (state.method === 'file' && state.file && exists(state.file)) return ['--cookies', state.file]
  if (state.method === 'browser' && state.browser) return ['--cookies-from-browser', state.browser]
  return ['--cookies-from-browser', state.browser || 'firefox']
}
