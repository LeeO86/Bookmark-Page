import {
  clearSession,
  deleteCookie,
  getCookie,
  getRequestHeader,
  getRequestURL,
  getSession,
  sendRedirect,
  setCookie,
  updateSession,
} from 'nuxt/server'
import type { RequestEvent } from 'nuxt/schema'
import { getRuntimeEnv } from '../config/env'
import { badRequest } from '../http/errors'
import type { Actor } from './permissions'
import { authorizationRedirect, completeOidcLogin, newOidcTransaction } from './oidc'
import { authOptions } from './status'
import { sessionConfig, type AppSession } from './session'

const suppressionCookie = 'bp-oidc-auto'
const transactionFields = {
  oidcState: undefined,
  oidcVerifier: undefined,
  oidcReturnPath: undefined,
  oidcSilent: undefined,
  oidcStartedAt: undefined,
}
const messages: Record<string, string> = {
  access_denied: 'access denied',
  login_required: 'sign-in is required',
  interaction_required: 'interaction is required',
  consent_required: 'consent is required',
  account_selection_required: 'account selection is required',
  sign_in_failed: 'please try again or use a local account',
  provider_unavailable: 'the provider is unavailable; please try again later',
  invalid_transaction: 'the sign-in attempt expired or could not be verified; please try again',
}

/** Relative paths are checked before storage and again before every redirect. */
export function oidcReturnPath(value: string | undefined): string {
  const path = value ?? '/'
  if (Buffer.byteLength(path, 'utf8') > 2048)
    throw badRequest('OIDC return path exceeds 2048 bytes')
  let decoded = path
  for (let i = 0; i < 8; i++) {
    if (
      !decoded.startsWith('/') ||
      decoded.startsWith('//') ||
      decoded.includes('\\') ||
      /[\p{Cc}\p{Zl}\p{Zp}]/u.test(decoded)
    )
      throw badRequest('OIDC return path must be a same-origin relative path')
    const next = decoded.replace(/(?:%[a-f0-9]{2})+/gi, (encoded) => {
      try {
        return decodeURIComponent(encoded)
      } catch {
        throw badRequest('Invalid OIDC return path encoding')
      }
    })
    if (next === decoded) break
    if (i === 7) throw badRequest('Invalid OIDC return path encoding')
    decoded = next
  }
  if (
    new URL(path, 'https://return.example').origin !== 'https://return.example' ||
    /^\/api\/v1\/auth\/oidc(?:\/|$)/i.test(decoded)
  )
    throw badRequest('Invalid OIDC return path')
  return path
}

function cookieOptions() {
  return {
    path: '/',
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: sessionConfig().cookie?.secure === true,
  }
}

export function clearOidcSuppression(event: RequestEvent) {
  deleteCookie(event, suppressionCookie, cookieOptions())
}

export function suppressOidc(event: RequestEvent, untilBrowserCloses = false) {
  setCookie(event, suppressionCookie, '1', {
    ...cookieOptions(),
    ...(untilBrowserCloses ? {} : { maxAge: getRuntimeEnv().oidcAutoLoginRetrySeconds }),
  })
}

export function isPortalDocumentPath(path: string): boolean {
  return (
    !/^\/(?:api(?:\/|$)|_|metrics(?:\/|$)|branding(?:\/|$)|fonts(?:\/|$))/.test(path) &&
    !path.includes('.')
  )
}

export function automaticOidcRedirect(event: RequestEvent, actor: Actor) {
  if (
    !getRuntimeEnv().oidcAutoLogin ||
    !authOptions().oidcEnabled ||
    actor.kind !== 'anonymous' ||
    event.req.method !== 'GET' ||
    getRequestHeader(event, 'sec-fetch-mode') !== 'navigate' ||
    getRequestHeader(event, 'sec-fetch-dest') !== 'document' ||
    getRequestHeader(event, 'authorization') ||
    getCookie(event, suppressionCookie) !== undefined
  )
    return null
  const url = getRequestURL(event)
  if (!isPortalDocumentPath(url.pathname)) return null
  let target: string
  try {
    target = oidcReturnPath(url.pathname + url.search)
  } catch {
    // Keep the transaction inside the browser's 4 KiB sealed-cookie budget.
    target = '/'
    console.info(
      'OIDC automatic sign-in uses the portal root for an invalid or oversized return path',
    )
  }
  return sendRedirect(
    event,
    '/api/v1/auth/oidc/start?silent=1&returnTo=' + encodeURIComponent(target),
    302,
  )
}

export async function startOidcSignIn(event: RequestEvent) {
  const query = getRequestURL(event).searchParams
  if (query.getAll('returnTo').length > 1 || query.getAll('silent').length > 1)
    throw badRequest('Duplicate OIDC parameter')
  const returnTo = oidcReturnPath(query.get('returnTo') ?? undefined)
  const silent = query.get('silent') === '1'
  if (!silent) clearOidcSuppression(event)
  const transaction = newOidcTransaction()
  await updateSession<AppSession>(event, sessionConfig(), {
    oidcState: transaction.state,
    oidcVerifier: transaction.verifier,
    oidcReturnPath: returnTo,
    oidcSilent: silent,
    oidcStartedAt: Date.now(),
    oidcError: undefined,
  })
  try {
    const target = await authorizationRedirect(
      getRuntimeEnv(),
      transaction.verifier,
      transaction.state,
      silent,
    )
    return sendRedirect(event, target, 302)
  } catch (error) {
    return failedSignIn(event, silent, returnTo, 'provider_unavailable', error)
  }
}

export async function completeOidcSignIn(event: RequestEvent) {
  const session = await getSession<AppSession>(event, sessionConfig())
  const transaction = { ...session.data }
  const returnTo = safeStoredPath(transaction.oidcReturnPath)
  const silent = transaction.oidcSilent === true
  const url = getRequestURL(event)
  try {
    if (
      !transaction.oidcState ||
      !transaction.oidcVerifier ||
      (transaction.oidcStartedAt !== undefined &&
        Date.now() - transaction.oidcStartedAt > 600_000) ||
      url.searchParams.getAll('state').length !== 1 ||
      url.searchParams.get('state') !== transaction.oidcState
    )
      return failedSignIn(event, silent, returnTo, 'invalid_transaction')
    const error = url.searchParams.get('error')
    if (error !== null)
      return failedSignIn(
        event,
        silent,
        returnTo,
        Object.hasOwn(messages, error) ? error : 'sign_in_failed',
      )
    const userId = await completeOidcLogin(
      getRuntimeEnv(),
      url,
      transaction.oidcVerifier,
      transaction.oidcState,
    )
    await clearSession(event, sessionConfig())
    await updateSession<AppSession>(event, sessionConfig(), { userId, signInMethod: 'oidc' })
    clearOidcSuppression(event)
    return sendRedirect(event, returnTo, 302)
  } catch (error) {
    return failedSignIn(event, silent, returnTo, 'sign_in_failed', error)
  }
}

function safeStoredPath(path?: string): string {
  try {
    return oidcReturnPath(path)
  } catch {
    return '/'
  }
}

async function failedSignIn(
  event: RequestEvent,
  silent: boolean,
  returnTo: string,
  reason: string,
  error?: unknown,
) {
  // Do not log codes, tokens, callback URLs, provider descriptions or response bodies.
  const errorCode =
    error &&
    typeof error === 'object' &&
    'code' in error &&
    typeof error.code === 'string' &&
    /^(?:ERR|OAUTH)_[A-Z0-9_]+$/.test(error.code)
      ? error.code
      : undefined
  console.info('OIDC sign-in failed', {
    mode: silent ? 'silent' : 'interactive',
    reason,
    ...(errorCode ? { errorCode } : {}),
  })
  await updateSession<AppSession>(event, sessionConfig(), {
    ...transactionFields,
    oidcError: silent ? undefined : reason,
  })
  // Interactive failures also need suppression, otherwise their error page starts another silent flow.
  suppressOidc(event)
  return sendRedirect(event, returnTo, 302)
}

export async function consumeOidcError(event: RequestEvent): Promise<string | null> {
  const session = await getSession<AppSession>(event, sessionConfig())
  const code = session.data.oidcError
  if (!code) return null
  await updateSession<AppSession>(event, sessionConfig(), { oidcError: undefined })
  return `Sign-in with ${getRuntimeEnv().oidcProviderName} failed: ${messages[code] ?? messages.sign_in_failed}`
}
