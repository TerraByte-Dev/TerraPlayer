import { protocol } from 'electron'
import { createReadStream, statSync } from 'fs'
import { extname } from 'path'
import { Readable } from 'stream'

export function registerHubProtocol(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'hub',
      privileges: {
        secure: true,
        supportFetchAPI: true,
        stream: true,
        bypassCSP: true,
        corsEnabled: false,
      },
    },
  ])
}

function contentTypeFor(filePath: string): string {
  const ext = extname(filePath).toLowerCase()
  if (ext === '.m4a' || ext === '.mp4') return 'audio/mp4'
  if (ext === '.mp3') return 'audio/mpeg'
  if (ext === '.wav') return 'audio/wav'
  if (ext === '.flac') return 'audio/flac'
  return 'application/octet-stream'
}

function parseRange(range: string | null, size: number): { start: number; end: number } | null {
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

function streamToWeb(stream: Readable): ReadableStream<Uint8Array> {
  return Readable.toWeb(stream) as ReadableStream<Uint8Array>
}

// Call after app is ready
export function handleHubProtocol(): void {
  protocol.handle('hub', (request) => {
    // hub://localhost/<encoded-absolute-windows-path>
    const encoded = request.url.slice('hub://localhost/'.length)
    const filePath = decodeURIComponent(encoded)

    try {
      const stat = statSync(filePath)
      if (!stat.isFile()) {
        return new Response('Not found', { status: 404 })
      }

      const size = stat.size
      const contentType = contentTypeFor(filePath)
      const range = parseRange(request.headers.get('range'), size)

      if (request.headers.has('range') && !range) {
        return new Response(null, {
          status: 416,
          headers: {
            'Accept-Ranges': 'bytes',
            'Content-Range': `bytes */${size}`,
          },
        })
      }

      if (range) {
        const { start, end } = range
        const contentLength = end - start + 1
        const stream = createReadStream(filePath, { start, end })

        return new Response(streamToWeb(stream), {
          status: 206,
          headers: {
            'Accept-Ranges': 'bytes',
            'Content-Type': contentType,
            'Content-Length': String(contentLength),
            'Content-Range': `bytes ${start}-${end}/${size}`,
          },
        })
      }

      return new Response(streamToWeb(createReadStream(filePath)), {
        status: 200,
        headers: {
          'Accept-Ranges': 'bytes',
          'Content-Type': contentType,
          'Content-Length': String(size),
        },
      })
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })
}
