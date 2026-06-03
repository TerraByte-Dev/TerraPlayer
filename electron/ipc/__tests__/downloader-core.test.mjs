// Unit tests for downloader-core.ts — run with:
//   node --no-warnings --experimental-strip-types --test electron/ipc/__tests__/*.test.mjs
// (npm test). Pure logic only — no electron/node-fs dependencies.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  watchUrl,
  LineBuffer,
  parseNdjson,
  buildTaskLines,
  orderedScriptCandidates,
  orderedOutputCandidates,
  pickFirstExisting,
  installCommand,
  isInstallable,
  mergePath,
  toNetscape,
  cookieArgsForAuth,
  isAllowedAuthUrl,
} from '../downloader-core.ts'

// A POSIX-ish join so path precedence is testable independent of the OS.
const join = (...p) => p.join('/').replace(/\/+/g, '/')

test('watchUrl builds a canonical watch URL', () => {
  assert.equal(watchUrl('abc123'), 'https://www.youtube.com/watch?v=abc123')
})

test('LineBuffer reassembles lines split across chunks', () => {
  const lb = new LineBuffer()
  assert.deepEqual(lb.push('{"a":1}\n{"b'), ['{"a":1}'])
  assert.deepEqual(lb.push('":2}\n'), ['{"b":2}'])
  assert.deepEqual(lb.push(''), [])
})

test('LineBuffer handles multiple lines in one chunk and CRLF', () => {
  const lb = new LineBuffer()
  assert.deepEqual(lb.push('one\r\ntwo\r\nthr'), ['one', 'two'])
  assert.deepEqual(lb.flush(), ['thr'])
})

test('LineBuffer drops blank lines but flush of empty is empty', () => {
  const lb = new LineBuffer()
  assert.deepEqual(lb.push('\n\n'), [])
  assert.deepEqual(lb.flush(), [])
})

test('parseNdjson returns null on garbage, object on JSON', () => {
  assert.equal(parseNdjson('not json'), null)
  assert.deepEqual(parseNdjson('{"event":"x"}'), { event: 'x' })
})

test('buildTaskLines pins each row to its exact video id', () => {
  const lines = buildTaskLines([
    { stem: 'Kendrick Lamar - HUMBLE.', id: 'H4RELGc9su8' },
    { stem: '21 Savage - a lot', id: 'abcDEF12345' },
  ])
  assert.deepEqual(lines, [
    'Kendrick Lamar - HUMBLE. | https://www.youtube.com/watch?v=H4RELGc9su8',
    '21 Savage - a lot | https://www.youtube.com/watch?v=abcDEF12345',
  ])
})

test('buildTaskLines skips rows missing id or stem', () => {
  assert.deepEqual(
    buildTaskLines([{ stem: '', id: 'x' }, { stem: 'y', id: '' }, { stem: 'ok', id: 'vid' }]),
    ['ok | https://www.youtube.com/watch?v=vid']
  )
})

test('orderedScriptCandidates respects precedence: env > local > packaged > colocated > canonical', () => {
  const c = orderedScriptCandidates({
    env: '/env/dl.py',
    localScript: '/local/dl.py',
    isPackaged: true,
    resourcesPath: '/res',
    appPath: '/app/hub',
    canonical: '/canon/dl.py',
    join,
  })
  assert.deepEqual(c, [
    '/env/dl.py',
    '/local/dl.py',
    '/res/download_music.py',
    '/app/hub/../download_music.py',
    '/canon/dl.py',
  ])
})

test('orderedScriptCandidates omits packaged path in dev and drops empties', () => {
  const c = orderedScriptCandidates({
    isPackaged: false,
    appPath: '/app/hub',
    canonical: '/canon/dl.py',
    join,
  })
  assert.deepEqual(c, ['/app/hub/../download_music.py', '/canon/dl.py'])
})

test('orderedOutputCandidates precedence: env > preferred > local > canonical', () => {
  assert.deepEqual(
    orderedOutputCandidates({ env: '/e', preferred: '/p', localOut: '/l', canonical: '/c' }),
    ['/e', '/p', '/l', '/c']
  )
  assert.deepEqual(
    orderedOutputCandidates({ preferred: '/p', canonical: '/c' }),
    ['/p', '/c']
  )
})

test('pickFirstExisting returns first hit, else null', () => {
  const exists = (p) => p === '/b' || p === '/c'
  assert.equal(pickFirstExisting(['/a', '/b', '/c'], exists), '/b')
  assert.equal(pickFirstExisting(['/a'], exists), null)
})

test('installCommand maps pip tools through the resolved python', () => {
  assert.deepEqual(installCommand('yt-dlp', 'py'), { cmd: 'py', args: ['-m', 'pip', 'install', '-U', 'yt-dlp'] })
  assert.deepEqual(installCommand('ytmusicapi', 'C:/py.exe').args.at(-1), 'ytmusicapi')
})

test('installCommand maps winget tools non-interactively', () => {
  const ff = installCommand('ffmpeg', 'py')
  assert.equal(ff.cmd, 'winget')
  assert.ok(ff.args.includes('Gyan.FFmpeg'))
  assert.ok(ff.args.includes('--disable-interactivity'))
  assert.ok(installCommand('deno', 'py').args.includes('DenoLand.Deno'))
})

test('installCommand returns null for non-installable tools', () => {
  assert.equal(installCommand('python', 'py'), null)
  assert.equal(installCommand('cookies', 'py'), null)
})

test('isInstallable only for the four auto-installable tools', () => {
  for (const t of ['yt-dlp', 'ytmusicapi', 'ffmpeg', 'deno']) assert.ok(isInstallable(t))
  for (const t of ['python', 'cookies', undefined, 'script']) assert.ok(!isInstallable(t))
})

test('mergePath dedupes case-insensitively, preserves order, drops blanks', () => {
  assert.equal(
    mergePath(['C:\\links', 'C:\\a;C:\\b', 'c:\\A;C:\\c', undefined, ';;']),
    'C:\\links;C:\\a;C:\\b;C:\\c'
  )
})

test('toNetscape writes a valid header and tab-separated rows', () => {
  const out = toNetscape([
    { domain: '.youtube.com', path: '/', secure: true, expirationDate: 1700000000.5, name: 'SID', value: 'abc' },
    { domain: 'accounts.google.com', name: 'SESS', value: 'xyz' }, // session cookie, no expiry
  ])
  const lines = out.trimEnd().split('\n')
  assert.equal(lines[0], '# Netscape HTTP Cookie File')
  assert.deepEqual(lines[2].split('\t'), ['.youtube.com', 'TRUE', '/', 'TRUE', '1700000000', 'SID', 'abc'])
  // host-only cookie ⇒ includeSubdomains FALSE, default path, secure FALSE, expiry 0
  assert.deepEqual(lines[3].split('\t'), ['accounts.google.com', 'FALSE', '/', 'FALSE', '0', 'SESS', 'xyz'])
})

test('toNetscape skips nameless cookies', () => {
  const out = toNetscape([{ domain: '.x.com', name: '', value: 'v' }])
  assert.equal(out.trimEnd().split('\n').length, 2) // header only
})

test('isAllowedAuthUrl allows only Google/YouTube + assets, blocks everything else', () => {
  for (const u of [
    'https://www.youtube.com/account',
    'https://accounts.google.com/ServiceLogin',
    'https://myaccount.google.com/x',
    'https://lh3.googleusercontent.com/a',
    'https://ssl.gstatic.com/x.png',
    'https://i.ytimg.com/v.jpg',
    'https://www.google.co.uk/login',
    'about:blank',
    'data:text/html,hi',
  ]) assert.ok(isAllowedAuthUrl(u), `should allow ${u}`)

  for (const u of [
    'https://evil.com/phish',
    'https://google.com.evil.com/x',
    'https://notgoogle.com/x',
    'https://youtube.com.attacker.net/x',
    'http://192.168.1.1/x',
    'not a url',
  ]) assert.ok(!isAllowedAuthUrl(u), `should block ${u}`)
})

test('cookieArgsForAuth: in-app/file require the file to exist, else fall back to browser', () => {
  const yes = () => true
  const no = () => false
  assert.deepEqual(cookieArgsForAuth({ method: 'in-app' }, '/m.txt', yes), ['--cookies', '/m.txt'])
  assert.deepEqual(cookieArgsForAuth({ method: 'in-app', browser: 'firefox' }, '/m.txt', no), ['--cookies-from-browser', 'firefox'])
  assert.deepEqual(cookieArgsForAuth({ method: 'file', file: '/c.txt' }, '/m.txt', yes), ['--cookies', '/c.txt'])
  assert.deepEqual(cookieArgsForAuth({ method: 'file', file: '/c.txt' }, '/m.txt', no), ['--cookies-from-browser', 'firefox'])
  assert.deepEqual(cookieArgsForAuth({ method: 'browser', browser: 'chrome' }, '/m.txt', no), ['--cookies-from-browser', 'chrome'])
  assert.deepEqual(cookieArgsForAuth({ method: 'browser' }, '/m.txt', no), ['--cookies-from-browser', 'firefox'])
})
