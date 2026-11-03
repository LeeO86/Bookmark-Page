import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir, networkInterfaces } from 'node:os'
import { join } from 'node:path'
import { createServer as http, request, type ServerResponse } from 'node:http'
import { createServer as https } from 'node:https'
import { chromium, firefox, type BrowserContext } from '@playwright/test'

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=',
  'base64',
)

/** Real TLS and real image requests: localhost targets would hide mixed-content rules. */
export async function imageBrowser(baseURL: string, token: string, browserName: string) {
  const directory = mkdtempSync(join(tmpdir(), 'bp-image-browser-'))
  const run = (binary: string, args: string[]) =>
    execFileSync(binary, args, { cwd: directory, stdio: 'ignore' })
  run('openssl', [
    'req',
    '-x509',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-keyout',
    'ca.key',
    '-out',
    'ca.pem',
    '-days',
    '2',
    '-subj',
    '/CN=Bookmark-Tests-Only',
  ])
  run('openssl', [
    'req',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-keyout',
    'portal.key',
    '-out',
    'portal.csr',
    '-subj',
    '/CN=portal.example.test',
  ])
  writeFileSync(
    join(directory, 'extensions'),
    'subjectAltName=DNS:portal.example.test\nbasicConstraints=CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n',
  )
  run('openssl', [
    'x509',
    '-req',
    '-in',
    'portal.csr',
    '-CA',
    'ca.pem',
    '-CAkey',
    'ca.key',
    '-CAcreateserial',
    '-out',
    'portal.pem',
    '-days',
    '2',
    '-extfile',
    'extensions',
  ])
  run('openssl', [
    'req',
    '-x509',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-keyout',
    'device.key',
    '-out',
    'device.pem',
    '-days',
    '2',
    '-subj',
    '/CN=device.example.test',
    '-addext',
    'subjectAltName=DNS:device.example.test',
  ])
  const profile = join(directory, 'profile')
  const xdg = join(directory, 'xdg')
  const database = browserName === 'firefox' ? profile : join(xdg, 'pki/nssdb')
  mkdirSync(database, { recursive: true })
  run('certutil', ['-N', '-d', 'sql:' + database, '--empty-password'])
  run('certutil', [
    '-A',
    '-d',
    'sql:' + database,
    '-n',
    'fixture-root',
    '-t',
    'C,,',
    '-i',
    join(directory, 'ca.pem'),
  ])
  const ip = Object.values(networkInterfaces())
    .flat()
    .find((value) => value && !value.internal && value.family === 'IPv4')?.address
  if (!ip) throw new Error('The image compatibility test requires a non-loopback IPv4 interface')
  const seen: string[] = []
  const image = http((req, res) => {
    seen.push(req.headers.host ?? '')
    res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'no-store' })
    res.end(png)
  })
  image.on('clientError', (_, socket) => socket.destroy())
  let untrustedRequests = 0
  const untrusted = https(
    {
      key: readFileSync(join(directory, 'device.key')),
      cert: readFileSync(join(directory, 'device.pem')),
    },
    (_, res) => {
      untrustedRequests++
      res.writeHead(200, { 'content-type': 'image/png' })
      res.end(png)
    },
  )
  const proxy = https(
    {
      key: readFileSync(join(directory, 'portal.key')),
      cert: readFileSync(join(directory, 'portal.pem')),
    },
    (req, res: ServerResponse) => {
      if (req.url?.startsWith('/probe-image')) {
        res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'no-store' })
        res.end(png)
        return
      }
      if (req.url?.startsWith('/probe-not-image')) {
        res.writeHead(200, { 'content-type': 'text/html' })
        res.end('<title>Not an image</title>')
        return
      }
      if (req.url?.startsWith('/probe-hang')) {
        res.writeHead(200, { 'content-type': 'image/png' })
        res.flushHeaders()
        return
      }
      const upstream = request(
        new URL(req.url ?? '/', baseURL),
        {
          method: req.method,
          headers: {
            ...req.headers,
            authorization: 'Bearer ' + token,
            'x-forwarded-proto': 'https',
          },
        },
        (response) => {
          res.writeHead(response.statusCode ?? 502, response.headers)
          response.on('error', () => res.destroy())
          response.pipe(res)
        },
      )
      upstream.on('error', () => res.destroy())
      res.on('close', () => upstream.destroy())
      req.pipe(upstream)
    },
  )
  for (const server of [image, untrusted, proxy])
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '0.0.0.0', resolve)
    })
  const port = (server: typeof image | typeof proxy) => {
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Missing fixture port')
    return address.port
  }
  const origin = 'https://portal.example.test:' + port(proxy)
  const targets = {
    ip: 'http://' + ip + ':' + port(image) + '/icon.png',
    hostname: 'http://device.example.test:' + port(image) + '/icon.png',
    untrusted: 'https://device.example.test:' + port(untrusted) + '/icon.png',
  }
  let context: BrowserContext | undefined
  try {
    context = await (browserName === 'firefox' ? firefox : chromium).launchPersistentContext(
      profile,
      browserName === 'firefox'
        ? {
            firefoxUserPrefs: {
              'network.dns.localDomains': 'portal.example.test,device.example.test',
            },
          }
        : {
            args: [
              '--host-resolver-rules=MAP portal.example.test 127.0.0.1,MAP device.example.test 127.0.0.1',
            ],
            env: { ...process.env, XDG_DATA_HOME: xdg },
          },
    )
    return {
      context,
      origin,
      targets,
      seen,
      version: context.browser()!.version(),
      untrustedRequests: () => untrustedRequests,
      close: async () => {
        await context!.close()
        for (const server of [image, untrusted, proxy]) {
          server.closeAllConnections()
          await new Promise<void>((resolve) => server.close(() => resolve()))
        }
        rmSync(directory, { recursive: true, force: true })
      },
    }
  } catch (error) {
    for (const server of [image, untrusted, proxy]) {
      server.closeAllConnections()
      server.close()
    }
    rmSync(directory, { recursive: true, force: true })
    throw error
  }
}
