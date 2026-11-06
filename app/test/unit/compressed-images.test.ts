import { createServer, type Server } from 'node:http'
import { gzipSync, deflateSync } from 'node:zlib'
import { afterEach, expect, it, vi } from 'vitest'
import { fetchFaviconBytes } from '../../server/icons/favicon'
import { limitedRequest } from '../../server/http/limited'
import { imageAccept } from '../../shared/image-accept'
const svg = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="16" height="16"/></svg>'
const servers: Server[] = []
afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
  vi.unstubAllEnvs()
})
async function serve(encoding: string, body: Buffer, type = 'image/svg+xml') {
  const server = createServer((req, res) => {
    if (!req.headers.accept?.includes(type === 'text/html' ? '*/*' : imageAccept)) {
      res.writeHead(415).end()
      return
    }
    res.writeHead(200, { 'content-type': type, 'content-encoding': encoding })
    res.end(body)
  })
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('fixture')
  return `http://127.0.0.1:${address.port}/icon.svg`
}
it.each(['gzip', 'deflate'])(
  'accepts unsolicited %s image responses with the compatible image Accept header',
  async (encoding) => {
    const target = await serve(encoding, encoding === 'gzip' ? gzipSync(svg) : deflateSync(svg))
    const image = await fetchFaviconBytes(target, true, true)
    expect(image.bytes.toString()).toContain('<rect')
    expect(imageAccept).toContain('image/*,*/*;q=0.8')
  },
)
it.each(['gzip', 'deflate'])(
  'bounds decoded %s expansion and rejects truncated streams',
  async (encoding) => {
    const compress = encoding === 'gzip' ? gzipSync : deflateSync
    const target = await serve(encoding, compress('x'.repeat(100000)))
    const options = {
      headers: { accept: imageAccept },
      timeoutMs: 1000,
      maxBytes: 1024,
      maxRedirects: 3,
      tlsVerify: true,
    }
    await expect(limitedRequest(target, options)).rejects.toThrow(/too large/)
    const truncated = await serve(encoding, compress(svg).subarray(0, 8))
    await expect(limitedRequest(truncated, options)).rejects.toThrow()
  },
)
it('scans only the decoded head prefix of a large compressed discovery page', async () => {
  const html = `<head><link rel="icon" href="data:image/svg+xml,${encodeURIComponent(svg)}"></head><script>${'x'.repeat(700000)}</script>`
  const target = await serve('gzip', gzipSync(html), 'text/html')
  expect((await fetchFaviconBytes(target, true)).bytes.toString()).toContain('<rect')
})
