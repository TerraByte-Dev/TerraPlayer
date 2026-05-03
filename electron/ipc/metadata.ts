import { spawn } from 'child_process'
import { join } from 'path'
import { app, nativeImage } from 'electron'

export interface RawMeta {
  title: string
  artist: string
  album: string
  year: number | null
  duration: number
  coverDataUrl: string | null
}

const SUPPORTED_COVER_FORMATS = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])

function coverDataUrlFromPicture(format: string | undefined, data: Uint8Array): string | null {
  if (!format || !SUPPORTED_COVER_FORMATS.has(format.toLowerCase())) return null

  const image = nativeImage.createFromBuffer(Buffer.from(data))
  if (image.isEmpty()) return null

  return image.toDataURL()
}

export async function readMeta(filePath: string): Promise<RawMeta> {
  // Dynamic import: music-metadata v10+ is ESM-only
  const { parseFile } = await import('music-metadata')
  const meta = await parseFile(filePath, { duration: true, skipCovers: false })
  const { common, format } = meta

  let coverDataUrl: string | null = null
  if (common.picture && common.picture.length > 0) {
    const pic = common.picture[0]
    coverDataUrl = coverDataUrlFromPicture(pic.format, pic.data)
  }

  const artists = common.artists?.length
    ? common.artists.join(', ')
    : (common.artist ?? '')

  return {
    title: common.title ?? '',
    artist: artists,
    album: common.album ?? '',
    year: common.year ?? null,
    duration: format.duration ?? 0,
    coverDataUrl,
  }
}

export function writeTags(filePath: string, tags: Record<string, string | number>): Promise<void> {
  return new Promise((resolve, reject) => {
    const scriptPath = app.isPackaged
      ? join(process.resourcesPath, 'tag_writer.py')
      : join(app.getAppPath(), '..', 'tag_writer.py')

    const child = spawn('python', [scriptPath, filePath, JSON.stringify(tags)])
    let stderr = ''
    child.stderr.on('data', (d) => (stderr += d.toString()))
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`tag_writer.py failed (exit ${code}): ${stderr}`))
    })
  })
}
