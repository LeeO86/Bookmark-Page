import {
  clearSession,
  defineEventHandler,
  getQuery,
  getRequestURL,
  getSession,
  readBody,
  sendRedirect,
  setResponseStatus,
  updateSession,
} from 'nuxt/server'
import {
  entryPatchSchema,
  entryWriteSchema,
  fieldDefinitionSchema,
  filterWriteSchema,
  iconWriteSchema,
  loginSchema,
  namespaceWriteSchema,
  scopeWriteSchema,
  settingsPatchSchema,
  syncBodySchema,
  syncEntrySchema,
  tagWriteSchema,
  tokenWriteSchema,
  userWriteSchema,
} from '../../../shared/contracts'
import { authenticateLocal } from '../../auth/login'
import { completeOidcLogin, authorizationRedirect, newOidcTransaction } from '../../auth/oidc'
import { peerIp } from '../../auth/resolve'
import { sessionConfig, type AppSession } from '../../auth/session'
import { requireAdmin, requireRead, requireRole, requireWrite } from '../../auth/permissions'
import { getRuntimeEnv } from '../../config/env'
import { getDatabase } from '../../db/client'
import { users } from '../../db/schema'
import { eq } from 'drizzle-orm'
import { run } from '../../http/api'
import { badRequest, notFound } from '../../http/errors'
import { openApiDocument, openApiHtml } from '../../openapi'
import {
  createFieldDefinition,
  createFilter,
  createIcon,
  createNamespace,
  createScope,
  ensureScope,
  createTag,
  createToken,
  createUser,
  deleteFieldDefinition,
  deleteFilter,
  deleteIcon,
  deleteNamespace,
  deleteTag,
  deleteToken,
  deleteUser,
  listFieldDefinitions,
  listFilters,
  listIcons,
  listNamespaces,
  listScopes,
  listTags,
  listTokens,
  listUsers,
  patchSettings,
  readAudit,
  readSettings,
  updateNamespace,
  updateScope,
} from '../../services/catalog'
import {
  createEntry,
  deleteEntry,
  getEntry,
  listEntries,
  revealField,
  updateEntry,
  upsertManagedEntry,
} from '../../services/entries'
import { syncScope } from '../../services/sync'

export default defineEventHandler((event) =>
  run(event, async (actor) => {
    const url = getRequestURL(event)
    const path = url.pathname.replace(/\/$/, '') || '/'
    const method = event.req.method.toUpperCase()

    if (method === 'GET' && path === '/api/v1/openapi.json') {
      return openApiDocument()
    }
    if (method === 'GET' && path === '/api/v1/docs') {
      event.res.headers.set('content-type', 'text/html; charset=utf-8')
      return openApiHtml()
    }
    if (method === 'POST' && path === '/api/v1/auth/login') {
      const body = loginSchema.parse(await readBody(event))
      const user = await authenticateLocal(body.username, body.password, peerIp(event))
      await clearSession(event, sessionConfig())
      await updateSession<AppSession>(event, sessionConfig(), { userId: user.id })
      return { user }
    }
    if (method === 'POST' && path === '/api/v1/auth/logout') {
      await clearSession(event, sessionConfig())
      return { ok: true }
    }
    if (method === 'GET' && path === '/api/v1/auth/session') {
      return { actor: publicActor(actor) }
    }
    if (method === 'GET' && path === '/api/v1/auth/oidc/start') {
      const env = getRuntimeEnv()
      const transaction = newOidcTransaction()
      await updateSession<AppSession>(event, sessionConfig(), {
        oidcState: transaction.state,
        oidcVerifier: transaction.verifier,
      })
      return sendRedirect(
        event,
        await authorizationRedirect(env, transaction.verifier, transaction.state),
        302,
      )
    }
    if (method === 'GET' && path === '/api/v1/auth/oidc/callback') {
      const session = await getSession<AppSession>(event, sessionConfig())
      if (!session.data.oidcState || !session.data.oidcVerifier) {
        throw badRequest('OIDC transaction is missing')
      }
      const userId = await completeOidcLogin(
        getRuntimeEnv(),
        url,
        session.data.oidcVerifier,
        session.data.oidcState,
      )
      await clearSession(event, sessionConfig())
      await updateSession<AppSession>(event, sessionConfig(), { userId })
      const user = getDatabase().select().from(users).where(eq(users.id, userId)).get()
      if (!user) {
        throw notFound('User not found')
      }
      return sendRedirect(event, '/', 302)
    }

    if (method === 'GET' && path === '/api/v1/entries') {
      const query = getQuery(event).q
      return listEntries(actor, typeof query === 'string' ? query : '')
    }
    if (method === 'POST' && path === '/api/v1/entries') {
      requireWrite(actor)
      setResponseStatus(event, 201)
      return createEntry(actor, entryWriteSchema.parse(await readBody(event)))
    }
    const entryId = match(path, /^\/api\/v1\/entries\/([^/]+)$/)
    if (entryId && method === 'GET') {
      return getEntry(actor, decodeURIComponent(entryId))
    }
    if (entryId && method === 'PATCH') {
      requireWrite(actor)
      return updateEntry(
        actor,
        decodeURIComponent(entryId),
        entryPatchSchema.parse(await readBody(event)),
      )
    }
    if (entryId && method === 'DELETE') {
      requireWrite(actor)
      deleteEntry(actor, decodeURIComponent(entryId))
      return { ok: true }
    }
    const reveal = matchAll(path, /^\/api\/v1\/entries\/([^/]+)\/fields\/([^/]+)\/reveal$/)
    if (reveal && method === 'POST') {
      requireRead(actor)
      return revealField(
        actor,
        decodeURIComponent(reveal[0] ?? ''),
        decodeURIComponent(reveal[1] ?? ''),
      )
    }

    if (method === 'GET' && path === '/api/v1/namespaces') {
      requireRead(actor)
      return { namespaces: listNamespaces() }
    }
    if (method === 'POST' && path === '/api/v1/namespaces') {
      requireAdmin(actor)
      setResponseStatus(event, 201)
      return createNamespace(actor, namespaceWriteSchema.parse(await readBody(event)))
    }
    const namespaceId = match(path, /^\/api\/v1\/namespaces\/([^/]+)$/)
    if (namespaceId && method === 'PATCH') {
      requireAdmin(actor)
      return updateNamespace(
        actor,
        decodeURIComponent(namespaceId),
        namespaceWriteSchema.partial().parse(await readBody(event)),
      )
    }
    if (namespaceId && method === 'DELETE') {
      requireAdmin(actor)
      deleteNamespace(actor, decodeURIComponent(namespaceId))
      return { ok: true }
    }

    if (method === 'GET' && path === '/api/v1/tags') {
      return { tags: listTags(actor) }
    }
    if (method === 'POST' && path === '/api/v1/tags') {
      requireWrite(actor)
      setResponseStatus(event, 201)
      return createTag(actor, tagWriteSchema.parse(await readBody(event)))
    }
    const tagId = match(path, /^\/api\/v1\/tags\/([^/]+)$/)
    if (tagId && method === 'DELETE') {
      requireAdmin(actor)
      deleteTag(actor, decodeURIComponent(tagId))
      return { ok: true }
    }

    if (method === 'GET' && path === '/api/v1/filters') {
      return { filters: listFilters(actor) }
    }
    if (method === 'POST' && path === '/api/v1/filters') {
      requireRole(actor, 'viewer')
      setResponseStatus(event, 201)
      return createFilter(actor, filterWriteSchema.parse(await readBody(event)))
    }
    const filterId = match(path, /^\/api\/v1\/filters\/([^/]+)$/)
    if (filterId && method === 'DELETE') {
      requireRole(actor, 'viewer')
      deleteFilter(actor, decodeURIComponent(filterId))
      return { ok: true }
    }

    if (method === 'GET' && path === '/api/v1/fields') {
      return { fields: listFieldDefinitions(actor.role) }
    }
    if (method === 'POST' && path === '/api/v1/fields') {
      requireAdmin(actor)
      setResponseStatus(event, 201)
      return createFieldDefinition(actor, fieldDefinitionSchema.parse(await readBody(event)))
    }
    const fieldId = match(path, /^\/api\/v1\/fields\/([^/]+)$/)
    if (fieldId && method === 'DELETE') {
      requireAdmin(actor)
      deleteFieldDefinition(actor, decodeURIComponent(fieldId))
      return { ok: true }
    }

    if (method === 'GET' && path === '/api/v1/icons') {
      requireRead(actor)
      return { icons: listIcons() }
    }
    if (method === 'POST' && path === '/api/v1/icons') {
      requireAdmin(actor)
      setResponseStatus(event, 201)
      return createIcon(actor, iconWriteSchema.parse(await readBody(event)))
    }
    const iconId = match(path, /^\/api\/v1\/icons\/([^/]+)$/)
    if (iconId && method === 'DELETE') {
      requireAdmin(actor)
      deleteIcon(actor, decodeURIComponent(iconId))
      return { ok: true }
    }

    if (method === 'GET' && path === '/api/v1/users') {
      requireAdmin(actor)
      return { users: listUsers() }
    }
    if (method === 'POST' && path === '/api/v1/users') {
      requireAdmin(actor)
      setResponseStatus(event, 201)
      return createUser(actor, userWriteSchema.parse(await readBody(event)))
    }
    const userId = match(path, /^\/api\/v1\/users\/([^/]+)$/)
    if (userId && method === 'DELETE') {
      requireAdmin(actor)
      deleteUser(actor, decodeURIComponent(userId))
      return { ok: true }
    }

    if (method === 'GET' && path === '/api/v1/tokens') {
      requireRead(actor)
      return { tokens: listTokens(actor) }
    }
    if (method === 'POST' && path === '/api/v1/tokens') {
      requireWrite(actor)
      setResponseStatus(event, 201)
      return createToken(actor, tokenWriteSchema.parse(await readBody(event)))
    }
    const tokenId = match(path, /^\/api\/v1\/tokens\/([^/]+)$/)
    if (tokenId && method === 'DELETE') {
      requireWrite(actor)
      deleteToken(actor, decodeURIComponent(tokenId))
      return { ok: true }
    }

    if (method === 'GET' && path === '/api/v1/scopes') {
      requireRead(actor)
      return { scopes: listScopes() }
    }
    if (method === 'POST' && path === '/api/v1/scopes') {
      requireAdmin(actor)
      setResponseStatus(event, 201)
      return createScope(actor, scopeWriteSchema.parse(await readBody(event)))
    }
    const scopeId = match(path, /^\/api\/v1\/scopes\/([^/]+)$/)
    if (scopeId && method === 'PATCH') {
      requireAdmin(actor)
      const body = scopeWriteSchema.partial().parse(await readBody(event))
      if (!body.editMode) {
        throw badRequest('editMode is required')
      }
      return updateScope(actor, decodeURIComponent(scopeId), body.editMode)
    }
    const upsert = matchAll(path, /^\/api\/v1\/scopes\/([^/]+)\/entries\/([^/]+)$/)
    if (upsert && method === 'PUT') {
      requireWrite(actor)
      const scope = decodeURIComponent(upsert[0] ?? '')
      const externalKey = decodeURIComponent(upsert[1] ?? '')
      ensureScope(scope, actor)
      const body = syncEntrySchema.parse({ ...((await readBody(event)) as object), externalKey })
      const status = upsertManagedEntry(scope, body, actor)
      return { status, externalKey }
    }
    const sync = match(path, /^\/api\/v1\/scopes\/([^/]+)\/sync$/)
    if (sync && method === 'POST') {
      requireWrite(actor)
      return syncScope(actor, decodeURIComponent(sync), syncBodySchema.parse(await readBody(event)))
    }

    if (method === 'GET' && path === '/api/v1/settings') {
      return readSettings(actor)
    }
    if (method === 'PATCH' && path === '/api/v1/settings') {
      requireAdmin(actor)
      return patchSettings(actor, settingsPatchSchema.parse(await readBody(event)))
    }
    if (method === 'GET' && path === '/api/v1/audit') {
      requireAdmin(actor)
      return readAudit(actor.role)
    }

    setResponseStatus(event, 404)
    return { error: { code: 'not_found', message: 'Not found' } }
  }),
)

function match(path: string, pattern: RegExp): string | null {
  return pattern.exec(path)?.[1] ?? null
}

function matchAll(path: string, pattern: RegExp): string[] | null {
  const result = pattern.exec(path)
  if (!result) {
    return null
  }
  return result.slice(1)
}

function publicActor(actor: { role: string; label: string; kind: string; userId: string | null }) {
  return {
    role: actor.role,
    label: actor.label,
    kind: actor.kind,
    userId: actor.userId,
  }
}
