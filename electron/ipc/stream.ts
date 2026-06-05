import { protocol } from 'electron'
import { createReadStream, statSync } from 'fs'
import { Readable } from 'stream'
import { contentTypeFor, parseRange, cacheControlFor } from './stream-core'

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

// contentTypeFor / parseRange / cacheControlFor live in stream-core.ts (pure +
// unit-tested). This module wires them into protocol.handle.

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
      // Immutable caching for content-addressed cover images so a virtualized
      // scroll doesn't re-statSync/re-stream every cover; null (no header) for
      // audio so range/seek behavior is unchanged.
      const cacheControl = cacheControlFor(contentType)
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

        const headers: Record<string, string> = {
          'Accept-Ranges': 'bytes',
          'Content-Type': contentType,
          'Content-Length': String(contentLength),
          'Content-Range': `bytes ${start}-${end}/${size}`,
        }
        if (cacheControl) headers['Cache-Control'] = cacheControl
        return new Response(streamToWeb(stream), { status: 206, headers })
      }

      const headers: Record<string, string> = {
        'Accept-Ranges': 'bytes',
        'Content-Type': contentType,
        'Content-Length': String(size),
      }
      if (cacheControl) headers['Cache-Control'] = cacheControl
      return new Response(streamToWeb(createReadStream(filePath)), { status: 200, headers })
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })
}
