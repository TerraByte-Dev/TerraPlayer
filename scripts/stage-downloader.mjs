// Stage the (external, private) download_music.py backend into build/ so electron-builder can bundle it via a
// project-relative extraResources entry. Run before `electron-builder` (see the "build" / "release" scripts).
//
// Why this exists: the backend lives OUTSIDE the repo (a separate Media project). A hardcoded absolute path
// would leak the dev username in this public repo, and electron-builder resolves an extraResources `from`
// with path.resolve() BEFORE expanding ${env.*} macros — so an env-macro path mis-resolves and the file is
// silently skipped (shipping an installer with no downloader). Copying it to a real project-relative path
// (mirroring how tag_writer.py is bundled) is deterministic and PII-free.
import { homedir } from 'node:os'
import { join, dirname } from 'node:path'
import { existsSync, mkdirSync, copyFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dest = join(root, 'build', 'download_music.py')

// Same resolution as the runtime fallback in electron/ipc/downloader.ts: an explicit override wins, else the
// canonical location under the current user's home dir (no hardcoded username).
const source =
  process.env.TPLAY_DOWNLOADER_SCRIPT ||
  join(homedir(), 'Desktop', 'Media', 'Tools', 'MusicDownloader', 'download_music.py')

if (existsSync(source)) {
  mkdirSync(dirname(dest), { recursive: true })
  copyFileSync(source, dest)
  console.log(`[stage-downloader] bundled ${source} -> build/download_music.py`)
} else if (process.env.TPLAY_SKIP_DOWNLOADER) {
  console.warn(
    `[stage-downloader] download_music.py not found at ${source}; ` +
      `building WITHOUT the in-app downloader (TPLAY_SKIP_DOWNLOADER set).`
  )
} else {
  // Fail loudly rather than silently ship an installer whose downloader can never find its backend.
  console.error(
    `\n[stage-downloader] download_music.py not found at:\n  ${source}\n\n` +
      `The packaged build bundles this backend for the in-app downloader. Either:\n` +
      `  • set TPLAY_DOWNLOADER_SCRIPT to its absolute path, or\n` +
      `  • set TPLAY_SKIP_DOWNLOADER=1 to build without the downloader.\n`
  )
  process.exit(1)
}
