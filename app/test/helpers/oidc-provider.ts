/** Test-only OpenID provider. Uses real TLS/JWT/PKCE, binds only loopback, never contacts a tenant. */
import { execFileSync } from 'node:child_process'
import { createHash, createPrivateKey, createPublicKey, randomUUID, sign } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:https'
import { createServer as netServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from '@playwright/test'

export type MockRole = 'viewer' | 'editor' | 'admin'
export interface OidcScenario {
  role?: MockRole
  subject?: string
  name?: string | null
  error?: string
  fault?:
    | 'discovery-reset'
    | 'discovery-error'
    | 'exchange-error'
    | 'exchange-reset'
    | 'bad-signature'
    | 'bad-issuer'
    | 'bad-audience'
    | 'expired-token'
    | 'state-mismatch'
}

export async function freeTestPort(): Promise<number> {
  const server = netServer()
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Missing test port')
  await new Promise<void>((resolve) => server.close(() => resolve()))
  return address.port
}

export async function createOidcProvider() {
  const directory = mkdtempSync(join(tmpdir(), 'bp-oidc-provider-'))
  const run = (cmd: string, args: string[]) =>
    execFileSync(cmd, args, { cwd: directory, stdio: 'ignore' })
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
    '/CN=Bookmark-OIDC-Tests-Only',
  ])
  run('openssl', [
    'req',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-keyout',
    'provider.key',
    '-out',
    'provider.csr',
    '-subj',
    '/CN=localhost',
  ])
  writeFileSync(
    join(directory, 'extensions'),
    'subjectAltName=DNS:localhost,IP:127.0.0.1\nbasicConstraints=CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n',
  )
  run('openssl', [
    'x509',
    '-req',
    '-in',
    'provider.csr',
    '-CA',
    'ca.pem',
    '-CAkey',
    'ca.key',
    '-CAcreateserial',
    '-out',
    'provider.pem',
    '-days',
    '2',
    '-extfile',
    'extensions',
  ])
  const key = createPrivateKey(readFileSync(join(directory, 'provider.key')))
  const publicKey = {
    ...createPublicKey(key).export({ format: 'jwk' }),
    kid: 'fixture-rsa',
    alg: 'RS256',
    use: 'sig',
  }
  const caFile = join(directory, 'ca.pem')
  let scenario: OidcScenario = {}
  let origin = ''
  const requests: Array<{ path: string; prompt: string | null }> = []
  const codes = new Map<
    string,
    { verifierHash: string; redirect: string; scenario: OidcScenario }
  >()
  const server = createServer(
    {
      key: readFileSync(join(directory, 'provider.key')),
      cert: readFileSync(join(directory, 'provider.pem')),
    },
    async (req, res) => {
      const url = new URL(req.url ?? '/', origin)
      requests.push({ path: url.pathname, prompt: url.searchParams.get('prompt') })
      const json = (value: unknown, status = 200) => {
        res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' })
        res.end(JSON.stringify(value))
      }
      if (url.pathname === '/.well-known/openid-configuration') {
        if (scenario.fault === 'discovery-reset') {
          req.socket.destroy()
          return
        }
        if (scenario.fault === 'discovery-error') {
          json({ error: 'temporarily_unavailable' }, 503)
          return
        }
        json({
          issuer: origin,
          authorization_endpoint: origin + '/authorize',
          token_endpoint: origin + '/token',
          jwks_uri: origin + '/jwks',
          response_types_supported: ['code'],
          subject_types_supported: ['public'],
          id_token_signing_alg_values_supported: ['RS256'],
          token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic'],
          code_challenge_methods_supported: ['S256'],
        })
        return
      }
      if (url.pathname === '/jwks') {
        json({ keys: [publicKey] })
        return
      }
      if (url.pathname === '/authorize') {
        const redirect = new URL(url.searchParams.get('redirect_uri') ?? 'https://invalid.example')
        if (
          redirect.hostname !== '127.0.0.1' ||
          redirect.pathname !== '/api/v1/auth/oidc/callback' ||
          url.searchParams.get('client_id') !== 'bookmark-test' ||
          url.searchParams.get('code_challenge_method') !== 'S256'
        ) {
          json({ error: 'invalid_request' }, 400)
          return
        }
        const silent = url.searchParams.get('prompt') === 'none'
        const error =
          scenario.error ??
          (silent && !req.headers.cookie?.includes('mock-sso=1') ? 'login_required' : null)
        redirect.searchParams.set(
          'state',
          scenario.fault === 'state-mismatch'
            ? 'wrong-state'
            : (url.searchParams.get('state') ?? ''),
        )
        if (error !== null) {
          redirect.searchParams.set('error', error)
          redirect.searchParams.set(
            'error_description',
            'Private provider diagnostic: fixture-only',
          )
        } else {
          const code = randomUUID()
          codes.set(code, {
            verifierHash: url.searchParams.get('code_challenge') ?? '',
            redirect: url.searchParams.get('redirect_uri')!,
            scenario: { ...scenario },
          })
          redirect.searchParams.set('code', code)
        }
        res.writeHead(302, { location: redirect.href, 'cache-control': 'no-store' })
        res.end()
        return
      }
      if (url.pathname === '/token' && req.method === 'POST') {
        let body = ''
        for await (const chunk of req) {
          body += String(chunk)
          if (body.length > 8192) {
            req.destroy()
            return
          }
        }
        const form = new URLSearchParams(body)
        const code = form.get('code') ?? ''
        const transaction = codes.get(code)
        codes.delete(code)
        const hash = createHash('sha256')
          .update(form.get('code_verifier') ?? '')
          .digest('base64url')
        const basic = req.headers.authorization?.startsWith('Basic ')
          ? Buffer.from(req.headers.authorization.slice(6), 'base64').toString()
          : ''
        const clientValid =
          basic === 'bookmark-test:fixture-client-secret' ||
          (form.get('client_id') === 'bookmark-test' &&
            form.get('client_secret') === 'fixture-client-secret')
        if (
          !transaction ||
          hash !== transaction.verifierHash ||
          form.get('redirect_uri') !== transaction.redirect ||
          !clientValid
        ) {
          json({ error: 'invalid_grant' }, 400)
          return
        }
        const fault = transaction.scenario.fault
        if (fault === 'exchange-reset') {
          req.socket.destroy()
          return
        }
        if (fault === 'exchange-error') {
          json({ error: 'invalid_grant', error_description: 'Private token exchange detail' }, 400)
          return
        }
        const timestamp = Math.floor(Date.now() / 1000)
        const role = transaction.scenario.role ?? 'viewer'
        const claims = {
          iss: fault === 'bad-issuer' ? 'https://wrong.example' : origin,
          sub: transaction.scenario.subject ?? 'fixture-user',
          aud: fault === 'bad-audience' ? 'another-client' : 'bookmark-test',
          iat: timestamp,
          exp: timestamp + (fault === 'expired-token' ? -120 : 600),
          preferred_username: 'fixture.user@example.test',
          email: 'fixture.user@example.test',
          ...(transaction.scenario.name === null
            ? {}
            : { name: transaction.scenario.name ?? `Fixture ${role}` }),
          roles: ['fixture-' + role],
        }
        const input =
          Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'fixture-rsa' })).toString('base64url') +
          '.' +
          Buffer.from(JSON.stringify(claims)).toString('base64url')
        const signature = sign('RSA-SHA256', Buffer.from(input), key)
        if (fault === 'bad-signature') signature[0] = signature[0]! ^ 255
        json({
          token_type: 'Bearer',
          expires_in: 600,
          access_token: 'fixture-access-token',
          id_token: input + '.' + signature.toString('base64url'),
        })
        return
      }
      json({ error: 'not_found' }, 404)
    },
  )
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Missing OIDC fixture port')
  origin = 'https://127.0.0.1:' + address.port
  return {
    origin,
    caFile,
    ca: readFileSync(caFile),
    requests,
    configure(value: OidcScenario) {
      scenario = { ...value }
    },
    async browserContext() {
      const profile = mkdtempSync(join(directory, 'browser-'))
      const xdg = join(profile, 'xdg'),
        database = join(xdg, 'pki/nssdb')
      mkdirSync(database, { recursive: true })
      run('certutil', ['-N', '-d', 'sql:' + database, '--empty-password'])
      run('certutil', [
        '-A',
        '-d',
        'sql:' + database,
        '-n',
        'oidc-fixture-root',
        '-t',
        'C,,',
        '-i',
        caFile,
      ])
      return chromium.launchPersistentContext(join(profile, 'profile'), {
        env: { ...process.env, XDG_DATA_HOME: xdg },
        viewport: { width: 1440, height: 900 },
      })
    },
    async close() {
      server.closeAllConnections()
      await new Promise<void>((resolve) => server.close(() => resolve()))
      rmSync(directory, { force: true, recursive: true })
    },
  }
}
