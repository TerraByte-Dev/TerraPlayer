// Pure helpers for the hub:// streaming protocol — no electron/fs imports, so
// they're unit-testable under node (mirrors downloader-core.ts). stream.ts wires
// these into protocol.handle.
import { extname } from 'path'

export function contentTypeFor(filePath: string): string {
  const ext = extname(filePath).toLowerCase()
  if (ext === '.m4a' || ext === '.mp4') return 'audio/mp4'
  if (ext === '.mp3') return 'audio/mpeg'
  if (ext === '.wav') return 'audio/wav'
  if (ext === '.flac') return 'audio/flac'
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.png') return 'image/png'
  if (ext === '.gif') return 'image/gif'
  if (ext === '.webp') return 'image/webp'
  return 'application/octet-stream'
}

export function parseRange(range: string | null, size: number): { start: number; end: number } | null {
  if (!range) return null

  const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim())
  if (!match) return null

  const [, rawStart, rawEnd] = match
  if (!rawStart && !rawEnd) return null

  if (!rawStart) {
    const suffixLength = Number(rawEnd)
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return null
    const start = Math.max(size - suffixLength, 0)
    return { start, end: size - 1 }
  }

  const start = Number(rawStart)
  const end = rawEnd ? Number(rawEnd) : size - 1

  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) return null
  if (start >= size) return null

  return { start, end: Math.min(end, size - 1) }
}

/**
 * Cache-Control for a hub:// response, or null to send none. Cover art is
 * content-addressed — saveCoverFile (db.ts) names every cover by the sha1 of its
 * image bytes — so a given image URL serves identical bytes forever and is safe
 * to cache immutably. This stops Chromium re-requesting (and the protocol
 * re-statSync/re-streaming) each cover as the virtualized track list unmounts and
 * remounts its <img> rows while scrolling. Audio gets no cache header, so range
 * requests / seeking behave exactly as before.
 */
export function cacheControlFor(contentType: string): string | null {
  return contentType.startsWith('image/') ? 'public, max-age=31536000, immutable' : null
}
