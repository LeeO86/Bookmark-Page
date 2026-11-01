import { createServer, type Server, type ServerResponse } from 'node:http'
import { afterEach, expect, it } from 'vitest'
import { HtmlHeadScanner } from '../../server/http/html-head'
import { limitedRequest } from '../../server/http/limited'

const servers: Server[] = []
afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})

async function serve(handler: (response: ServerResponse) => void) {
  const server = createServer((_, response) => handler(response))
  servers.push(server)
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Missing fixture address')
  return `http://127.0.0.1:${address.port}`
}
const limits = { timeoutMs: 1000, maxBytes: 512 * 1024, maxRedirects: 3, tlsVerify: true }

it('recognises a split, case-insensitive closing head and counts UTF-8 bytes', () => {
  const bytes = Buffer.from('<html><head><title>Grüsse</title></HeAd \r\n>')
  const scanner = new HtmlHeadScanner()
  for (let index = 0; index < bytes.length; index++) {
    expect(scanner.push(bytes.subarray(index, index + 1))).toBe(
      index === bytes.length - 1 ? 1 : null,
    )
  }
})

it('ignores closing-head text in comments, attributes, scripts, styles and titles across chunks', () => {
  const html =
    '<head><!-- </head> --><meta content="</head>"><script>"</head>"; 1 < 2;</script><style>x{content:"</head>"}</style><title>&lt; </head></title></head>'
  for (const width of [1, 2, 7, 1000]) {
    const scanner = new HtmlHeadScanner()
    const bytes = Buffer.from(html)
    for (let index = 0; index < bytes.length; index += width) {
      const chunk = bytes.subarray(index, index + width)
      const end = scanner.push(chunk)
      expect(end).toBe(index + chunk.length === bytes.length ? chunk.length : null)
    }
  }
})

it('returns and closes the response at the end of the head without waiting for its body', async () => {
  let closed = false
  const prefix = '<html><head><title>Grüsse</title></head>'
  const origin = await serve((response) => {
    response.writeHead(200, { 'content-type': 'text/html', 'content-length': 700 * 1024 })
    response.on('close', () => {
      closed = true
    })
    // Deliberately never finish the body: success must come from early termination.
    response.write(prefix + '<body>')
  })
  const result = await limitedRequest(origin, { ...limits, htmlHeadMaxBytes: 256 * 1024 })
  expect(result.body.toString()).toBe(prefix)
  await expect.poll(() => closed).toBe(true)
})

it('retains exactly the 256 KiB prefix at the cap, including a split UTF-8 character', async () => {
  const body = Buffer.from('<head>' + ' '.repeat(256 * 1024 - 7) + 'ü' + 'x'.repeat(400 * 1024))
  const origin = await serve((response) => {
    response.writeHead(200, { 'content-type': 'text/html' })
    response.end(body)
  })
  const result = await limitedRequest(origin, { ...limits, htmlHeadMaxBytes: 256 * 1024 })
  expect(result.body).toEqual(body.subarray(0, 256 * 1024))
})

it('keeps strict size rejection for ordinary requests and image responses', async () => {
  for (const type of ['text/html', 'image/png']) {
    const origin = await serve((response) => {
      response.writeHead(200, { 'content-type': type })
      response.end('x'.repeat(1024))
    })
    await expect(limitedRequest(origin, { ...limits, maxBytes: 100 })).rejects.toThrow('too large')
    if (type === 'image/png') {
      await expect(
        limitedRequest(origin, { ...limits, maxBytes: 100, htmlHeadMaxBytes: 256 }),
      ).rejects.toThrow('too large')
    }
  }
})

it('rejects an aborted response instead of waiting forever for end', async () => {
  const origin = await serve((response) => {
    response.writeHead(200, { 'content-type': 'text/html', 'content-length': 5000 })
    response.write('<head>')
    setImmediate(() => response.destroy())
  })
  await expect(limitedRequest(origin, { ...limits, htmlHeadMaxBytes: 256 * 1024 })).rejects.toThrow(
    /aborted|reset/i,
  )
})
