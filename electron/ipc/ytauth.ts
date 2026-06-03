/**
 * ytauth — bulletproof YouTube authentication for the downloader.
 *
 * yt-dlp authenticates to YouTube with browser cookies (there is no official
 * download OAuth). We support three independent, persisted sources and let the
 * live auth probe (download_music.py cookie_probe) be the source of truth:
 *
 *   in-app : an isolated login window (its own session partition, like a
 *            dedicated browser profile) → captured to a managed cookies.txt
 *   browser: read cookies straight from an installed, logged-in browser
 *   file   : a user-supplied cookies.txt
 *
 * No password is ever stored — only the same session cookies a browser holds,
 * in the app's own userData, never transmitted anywhere except to YouTube via
 * yt-dlp. The chosen source persists across restarts.
 */
import { app, BrowserWindow, session, shell } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync, rmSync } from 'fs'
import {
  toNetscape,
  cookieArgsForAuth,
  isAllowedAuthUrl,
  type AuthState,
  type NetscapeCookie,
} from './downloader-core'

const PARTITION = 'persist:tplay-youtube'
// A realistic desktop-Chrome UA so Google doesn't reject the embedded sign-in
// ("this browser may not be secure"). Without this the default Electron UA is
// frequently blocked.
const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

// Presence of any of these on .google.com means a Google session exists.
const AUTH_COOKIE_NAMES = ['SAPISID', '__Secure-3PSID', '__Secure-1PSID', 'SID']

function managedCookiePath(): string {
  return join(app.getPath('userData'), 'yt-cookies.txt')
}
function authStatePath(): string {
  return join(app.getPath('userData'), 'yt-auth.json')
}

// Defensive validation: yt-auth.json lives in userData, but treat it as untrusted
// (corruption / tampering) so a bad value can't crash a spawn or poison state.
function validBrowser(b: unknown): string | undefined {
  return typeof b === 'string' && /^[a-z][a-z0-9-]{0,31}$/.test(b.toLowerCase())
    ? b.toLowerCase()
    : undefined
}
function validFile(f: unknown): string | undefined {
  return typeof f === 'string' && f.length > 0 && f.length <= 1024 && !f.includes('\0')
    ? f
    : undefined
}
function defaultBrowser(): string {
  return validBrowser(process.env.TPLAY_COOKIES_BROWSER) || 'firefox'
}

export function readAuthState(): AuthState {
  try {
    const s = JSON.parse(readFileSync(authStatePath(), 'utf-8')) as AuthState
    if (s?.method === 'in-app') return { method: 'in-app' }
    if (s?.method === 'file') {
      const file = validFile(s.file)
      if (file) return { method: 'file', file }
    }
    if (s?.method === 'browser') {
      return { method: 'browser', browser: validBrowser(s.browser) || defaultBrowser() }
    }
  } catch {
    /* fall through to default */
  }
  return { method: 'browser', browser: defaultBrowser() }
}

function writeAuthState(state: AuthState): void {
  try {
    writeFileSync(authStatePath(), JSON.stringify(state), 'utf-8')
  } catch {
    /* non-fatal */
  }
}

/** yt-dlp cookie args for the persisted source (or an explicit per-call override). */
export function resolveCookieArgs(override?: {
  cookiesFromBrowser?: string
  cookiesFile?: string
}): string[] {
  if (override?.cookiesFile) return ['--cookies', override.cookiesFile]
  if (override?.cookiesFromBrowser) return ['--cookies-from-browser', override.cookiesFromBrowser]
  return cookieArgsForAuth(readAuthState(), managedCookiePath(), existsSync)
}

export interface AuthStatus {
  method: 'in-app' | 'browser' | 'file'
  browser?: string
  file?: string
  /** A usable cookie file is present (in-app capture or imported file). */
  connected: boolean
}

export function status(): AuthStatus {
  const s = readAuthState()
  const connected =
    (s.method === 'in-app' && existsSync(managedCookiePath())) ||
    (s.method === 'file' && !!s.file && existsSync(s.file))
  return { method: s.method, browser: s.browser, file: s.file, connected }
}

export function setBrowser(browser: string): AuthStatus {
  writeAuthState({ method: 'browser', browser })
  return status()
}

export function importFile(file: string): AuthStatus {
  writeAuthState({ method: 'file', file })
  return status()
}

export function disconnect(): AuthStatus {
  try {
    rmSync(managedCookiePath(), { force: true })
  } catch {
    /* noop */
  }
  session.fromPartition(PARTITION).clearStorageData().catch(() => {})
  writeAuthState({ method: 'browser', browser: readAuthState().browser || 'firefox' })
  return status()
}

function isYtOrGoogle(domain: string): boolean {
  const d = domain.replace(/^\./, '')
  return d === 'youtube.com' || d.endsWith('.youtube.com') || d === 'google.com' || d.endsWith('.google.com')
}

/** If the isolated session is signed into Google, capture its cookies → managed file. */
async function captureIfSignedIn(ses: Electron.Session): Promise<boolean> {
  const google = await ses.cookies.get({ domain: '.google.com' })
  if (!google.some((c) => AUTH_COOKIE_NAMES.includes(c.name))) return false
  const all = await ses.cookies.get({})
  const netscape: NetscapeCookie[] = []
  for (const c of all) {
    if (!c.domain || !isYtOrGoogle(c.domain)) continue
    netscape.push({
      domain: c.domain,
      path: c.path,
      secure: c.secure,
      expirationDate: c.expirationDate,
      name: c.name,
      value: c.value,
    })
  }
  writeFileSync(managedCookiePath(), toNetscape(netscape), 'utf-8')
  writeAuthState({ method: 'in-app' })
  return true
}

let connecting = false

/**
 * Open the in-app sign-in window. Resolves when the user signs in (auto-detected)
 * or closes the window. Capturing the cookies is idempotent; the auth probe then
 * confirms the result, so a partial/failed sign-in never silently "succeeds".
 */
export function connect(
  parent: BrowserWindow | null
): Promise<{ ok: boolean; detail: string; status: AuthStatus }> {
  return new Promise((resolve) => {
    if (connecting) {
      resolve({ ok: false, detail: 'A sign-in window is already open.', status: status() })
      return
    }
    connecting = true

    let win: BrowserWindow | undefined
    let poll: ReturnType<typeof setInterval> | undefined
    let timer: ReturnType<typeof setTimeout> | undefined
    let done = false
    const finish = (ok: boolean, detail: string): void => {
      if (done) return
      done = true
      connecting = false
      if (poll) clearInterval(poll)
      if (timer) clearTimeout(timer)
      if (win && !win.isDestroyed()) win.close()
      resolve({ ok, detail, status: status() })
    }

    try {
      const ses = session.fromPartition(PARTITION)
      ses.setUserAgent(CHROME_UA)

      win = new BrowserWindow({
        width: 540,
        height: 720,
        parent: parent ?? undefined,
        title: 'Connect YouTube — sign in',
        autoHideMenuBar: true,
        backgroundColor: '#0b0b0b',
        webPreferences: {
          partition: PARTITION,
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
        },
      })
      win.webContents.setUserAgent(CHROME_UA)

      // Hardening: never let the sign-in window leave Google/YouTube (blocks a
      // redirect-to-phishing capturing the session); off-site links open in the
      // user's real browser instead.
      win.webContents.setWindowOpenHandler(({ url }) => {
        if (isAllowedAuthUrl(url)) return { action: 'allow' }
        shell.openExternal(url).catch(() => {})
        return { action: 'deny' }
      })
      win.webContents.on('will-navigate', (e, url) => {
        if (!isAllowedAuthUrl(url)) {
          e.preventDefault()
          shell.openExternal(url).catch(() => {})
        }
      })

      poll = setInterval(() => {
        captureIfSignedIn(ses)
          .then((signed) => {
            if (signed) finish(true, 'Signed in — YouTube connected.')
          })
          .catch(() => {})
      }, 1500)

      timer = setTimeout(() => finish(false, 'Timed out before sign-in completed.'), 5 * 60 * 1000)

      win.on('closed', () => {
        if (done) {
          connecting = false
          return
        }
        // User closed the window themselves — capture if they did sign in.
        captureIfSignedIn(ses)
          .then((signed) =>
            finish(signed, signed ? 'YouTube connected.' : 'Window closed before sign-in completed.')
          )
          .catch(() => finish(false, 'Window closed.'))
      })

      win.loadURL('https://www.youtube.com/account').catch(() => {
        win!.loadURL('https://accounts.google.com/ServiceLogin?service=youtube').catch(() => {
          finish(false, 'Could not load the YouTube sign-in page.')
        })
      })
    } catch (e) {
      // BrowserWindow/session construction failed — never leave `connecting` stuck.
      finish(false, `Couldn't open the sign-in window: ${String(e).slice(0, 120)}`)
    }
  })
}

/** Browsers whose profile dir exists on this machine (for the picker). */
export function detectBrowsers(): string[] {
  const local = process.env.LOCALAPPDATA || ''
  const roaming = process.env.APPDATA || ''
  const candidates: [string, string][] = [
    ['firefox', join(roaming, 'Mozilla', 'Firefox', 'Profiles')],
    ['chrome', join(local, 'Google', 'Chrome', 'User Data')],
    ['edge', join(local, 'Microsoft', 'Edge', 'User Data')],
    ['brave', join(local, 'BraveSoftware', 'Brave-Browser', 'User Data')],
    ['opera', join(roaming, 'Opera Software', 'Opera Stable')],
    ['vivaldi', join(local, 'Vivaldi', 'User Data')],
  ]
  const found = candidates.filter(([, p]) => p && existsSync(p)).map(([name]) => name)
  return found.length ? found : ['firefox', 'chrome', 'edge']
}
