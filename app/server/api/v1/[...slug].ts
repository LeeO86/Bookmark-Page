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
  actionExecuteSchema,
  actionTemplateSchema,
  checkReportSchema,
  entryPatchSchema,
  entryWriteSchema,
  fieldDefinitionSchema,
  filterPatchSchema,
  filterWriteSchema,
  iconWriteSchema,
  loginSchema,
  faviconWriteSchema,
  logoWriteSchema,
  namespaceWriteSchema,
  scopeWriteSchema,
  preferencesPatchSchema,
  settingsPatchSchema,
  syncBodySchema,
  syncEntrySchema,
  tagPatchSchema,
  tagWriteSchema,
  tokenWriteSchema,
  userPatchSchema,
  userWriteSchema,
} from '../../../shared/contracts'
import {
  backupRequestSchema,
  csvImportSchema,
  csvPreviewSchema,
  restoreRequestSchema,
} from '../../../shared/backup'
import { importCsv, previewCsv } from '../../backup/csv'
import { createBackup } from '../../backup/export'
import { restoreBackup } from '../../backup/restore'
import { authenticateLocal } from '../../auth/login'
import { completeOidcLogin, authorizationRedirect, newOidcTransaction } from '../../auth/oidc'
import { authOptions, authStatus } from '../../auth/status'
import { peerIp, resolveActor } from '../../auth/resolve'
import { sessionConfig, type AppSession } from '../../auth/session'
import { requireAdmin, requireRead, requireRole, requireWrite } from '../../auth/permissions'
import { getRuntimeEnv } from '../../config/env'
import { getDatabase } from '../../db/client'
import { users } from '../../db/schema'
import { eq } from 'drizzle-orm'
import { run } from '../../http/api'
import { badRequest, HttpError, notFound } from '../../http/errors'
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
  updateFieldDefinition,
  deleteFilter,
  deleteIcon,
  deleteNamespace,
  deleteTag,
  deleteToken,
  deleteUser,
  updateFilter,
  updateUser,
  listFieldDefinitions,
  listFilters,
  updateTagLabel,
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
  deleteManagedEntry,
  countEntries,
  getEntry,
  listEntries,
  refreshEntryFavicons,
  listEntryHistory,
  restoreEntry,
  revealField,
  updateEntry,
  upsertManagedEntry,
} from '../../services/entries'
import { leaseChecks, reportCheck } from '../../checks/lease'
import { prepareUpload, searchIcons } from '../../icons/files'
import {
  createActionTemplate,
  deleteActionTemplate,
  executeNamedAction,
  listActionTemplates,
  listRunnableActions,
} from '../../services/actions'
import { publishLive, subscribeLive } from '../../services/live'
import { readPreferences, writePreferences } from '../../services/preferences'
import {
  clearLogo,
  clearTabFavicon,
  publicSettings,
  readLogo,
  readTabFavicon,
  saveLogo,
  saveTabFavicon,
} from '../../services/settings'
import { bookmarkGlyph } from '../../../shared/theme'
import { writeAudit } from '../../services/audit'
import { syncScope } from '../../services/sync'

export default defineEventHandler(async (event) => {
  const url = getRequestURL(event)
  const path = url.pathname.replace(/\/$/, '') || '/'
  const method = event.req.method.toUpperCase()
  if (method === 'GET' && path === '/api/v1/events') {
    return liveResponse(event)
  }
  if (method === 'GET' && path === '/api/v1/logo') {
    return logoResponse(event)
  }
  if (method === 'GET' && path === '/api/v1/favicon') {
    return faviconResponse()
  }
  return run(event, async (actor) => {
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
    if (method === 'GET' && path === '/api/v1/auth/options') {
      return authOptions()
    }
    if (method === 'GET' && path === '/api/v1/auth/status') {
      requireAdmin(actor)
      return authStatus()
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
    const historyId = match(path, /^\/api\/v1\/entries\/([^/]+)\/history$/)
    if (historyId && method === 'GET') {
      return { history: listEntryHistory(actor, decodeURIComponent(historyId)) }
    }
    const restore = matchAll(path, /^\/api\/v1\/entries\/([^/]+)\/history\/([^/]+)\/restore$/)
    if (restore && method === 'POST') {
      requireWrite(actor)
      return restoreEntry(
        actor,
        decodeURIComponent(restore[0] ?? ''),
        decodeURIComponent(restore[1] ?? ''),
      )
    }
    const entryActions = match(path, /^\/api\/v1\/entries\/([^/]+)\/actions$/)
    if (entryActions && method === 'GET') {
      return { actions: listRunnableActions(actor, decodeURIComponent(entryActions)) }
    }
    const execute = matchAll(path, /^\/api\/v1\/entries\/([^/]+)\/actions\/([^/]+)\/execute$/)
    if (execute && method === 'POST') {
      const body = actionExecuteSchema.parse(await readBody(event))
      return executeNamedAction(
        actor,
        decodeURIComponent(execute[0] ?? ''),
        decodeURIComponent(execute[1] ?? ''),
        {
          confirmed: body.confirmed,
          inputs: body.inputs,
        },
      )
    }
    const faviconRefresh = match(path, /^\/api\/v1\/entries\/([^/]+)\/favicon$/)
    if (faviconRefresh && method === 'POST') {
      requireWrite(actor)
      return refreshEntryFavicons(actor, decodeURIComponent(faviconRefresh))
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
    if (tagId && method === 'PATCH') {
      requireWrite(actor)
      const body = tagPatchSchema.parse(await readBody(event))
      return updateTagLabel(actor, decodeURIComponent(tagId), body.displayLabel)
    }
    if (tagId && method === 'DELETE') {
      requireAdmin(actor)
      deleteTag(actor, decodeURIComponent(tagId))
      return { ok: true }
    }

    if (method === 'GET' && path === '/api/v1/filters') {
      return { filters: listFilters(actor), allCount: countEntries(actor, '') }
    }
    if (method === 'POST' && path === '/api/v1/filters') {
      requireRole(actor, 'viewer')
      setResponseStatus(event, 201)
      return createFilter(actor, filterWriteSchema.parse(await readBody(event)))
    }
    const filterId = match(path, /^\/api\/v1\/filters\/([^/]+)$/)
    if (filterId && method === 'PATCH') {
      requireRole(actor, 'viewer')
      return updateFilter(
        actor,
        decodeURIComponent(filterId),
        filterPatchSchema.parse(await readBody(event)),
      )
    }
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
    if (fieldId && method === 'PATCH') {
      requireAdmin(actor)
      return updateFieldDefinition(
        actor,
        decodeURIComponent(fieldId),
        fieldDefinitionSchema.partial().parse(await readBody(event)),
      )
    }
    if (fieldId && method === 'DELETE') {
      requireAdmin(actor)
      deleteFieldDefinition(actor, decodeURIComponent(fieldId))
      return { ok: true }
    }

    if (method === 'GET' && path === '/api/v1/icons') {
      requireRead(actor)
      const query = getQuery(event).q
      return { icons: searchIcons(typeof query === 'string' ? query : '') }
    }
    if (method === 'POST' && path === '/api/v1/icons') {
      requireAdmin(actor)
      const body = iconWriteSchema.parse(await readBody(event))
      setResponseStatus(event, 201)
      return createIcon(actor, {
        name: body.name,
        mediaType: body.contentType,
        data: prepareUpload(body.contentType, body.data),
      })
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
    if (userId && method === 'PATCH') {
      requireAdmin(actor)
      return updateUser(
        actor,
        decodeURIComponent(userId),
        userPatchSchema.parse(await readBody(event)),
      )
    }
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
      if (status !== 'unchanged') {
        publishLive({ type: 'entries' })
      }
      return { status, externalKey }
    }
    if (upsert && method === 'DELETE') {
      requireWrite(actor)
      deleteManagedEntry(
        decodeURIComponent(upsert[0] ?? ''),
        decodeURIComponent(upsert[1] ?? ''),
        actor,
      )
      return { ok: true }
    }
    const sync = match(path, /^\/api\/v1\/scopes\/([^/]+)\/sync$/)
    if (sync && method === 'POST') {
      requireWrite(actor)
      return syncScope(actor, decodeURIComponent(sync), syncBodySchema.parse(await readBody(event)))
    }

    if (method === 'POST' && path === '/api/v1/checks/lease') {
      const body = await readBody(event)
      const limit =
        body && typeof body === 'object' && 'limit' in body && typeof body.limit === 'number'
          ? body.limit
          : 5
      return { checks: leaseChecks(actor, limit) }
    }
    const report = match(path, /^\/api\/v1\/checks\/([^/]+)\/report$/)
    if (report && method === 'POST') {
      const body = checkReportSchema.parse(await readBody(event))
      reportCheck(actor, decodeURIComponent(report), {
        leaseId: body.leaseId,
        state: body.state,
        latencyMs: body.latencyMs ?? null,
        message: body.message,
      })
      return { ok: true }
    }

    if (method === 'GET' && path === '/api/v1/action-templates') {
      requireAdmin(actor)
      return { templates: listActionTemplates() }
    }
    if (method === 'POST' && path === '/api/v1/action-templates') {
      requireAdmin(actor)
      setResponseStatus(event, 201)
      return createActionTemplate(actor, actionTemplateSchema.parse(await readBody(event)))
    }
    const templateId = match(path, /^\/api\/v1\/action-templates\/([^/]+)$/)
    if (templateId && method === 'DELETE') {
      requireAdmin(actor)
      deleteActionTemplate(actor, decodeURIComponent(templateId))
      return { ok: true }
    }

    if (method === 'POST' && path === '/api/v1/backup') {
      requireAdmin(actor)
      const body = backupRequestSchema.parse(await readBody(event))
      const archive = createBackup(actor, body.includeSecrets, body.passphrase)
      return {
        filename: 'bookmark-backup.zip',
        archive: Buffer.from(archive).toString('base64'),
      }
    }
    if (method === 'POST' && path === '/api/v1/restore') {
      requireAdmin(actor)
      const body = restoreRequestSchema.parse(await readBody(event))
      return restoreBackup(
        actor,
        Buffer.from(body.archive, 'base64'),
        body.mode,
        body.dryRun,
        body.passphrase,
      )
    }
    if (method === 'POST' && path === '/api/v1/import/csv/preview') {
      requireAdmin(actor)
      return previewCsv(csvPreviewSchema.parse(await readBody(event)).csv)
    }
    if (method === 'POST' && path === '/api/v1/import/csv') {
      requireAdmin(actor)
      const body = csvImportSchema.parse(await readBody(event))
      return importCsv(actor, body.csv, body.mapping, body.dryRun, body.confirmDuplicates)
    }

    if (method === 'GET' && path === '/api/v1/preferences') {
      return actor.userId ? readPreferences(actor.userId) : { colourMode: null, viewModes: {} }
    }
    if (method === 'PATCH' && path === '/api/v1/preferences') {
      requireRole(actor, 'viewer')
      if (!actor.userId) {
        setResponseStatus(event, 403)
        return { error: { code: 'forbidden', message: 'Sign in to save preferences' } }
      }
      return writePreferences(actor.userId, preferencesPatchSchema.parse(await readBody(event)))
    }
    if (method === 'GET' && path === '/api/v1/settings') {
      return readSettings(actor)
    }
    if (method === 'PATCH' && path === '/api/v1/settings') {
      requireAdmin(actor)
      return patchSettings(actor, settingsPatchSchema.parse(await readBody(event)))
    }
    if (method === 'POST' && path === '/api/v1/settings/logo') {
      requireAdmin(actor)
      const body = logoWriteSchema.parse(await readBody(event))
      saveLogo(body.contentType, body.data, actor.userId)
      writeAudit(actor, 'settings.update', 'settings', null, { logo: body.contentType })
      return readSettings(actor)
    }
    if (method === 'DELETE' && path === '/api/v1/settings/logo') {
      requireAdmin(actor)
      clearLogo()
      writeAudit(actor, 'settings.update', 'settings', null, { logo: null })
      return readSettings(actor)
    }
    if (method === 'POST' && path === '/api/v1/settings/favicon') {
      requireAdmin(actor)
      const body = faviconWriteSchema.parse(await readBody(event))
      saveTabFavicon(body.contentType, body.data, actor.userId)
      writeAudit(actor, 'settings.update', 'settings', null, { tabFavicon: body.contentType })
      return readSettings(actor)
    }
    if (method === 'DELETE' && path === '/api/v1/settings/favicon') {
      requireAdmin(actor)
      clearTabFavicon()
      writeAudit(actor, 'settings.update', 'settings', null, { tabFavicon: null })
      return readSettings(actor)
    }
    if (method === 'GET' && path === '/api/v1/audit') {
      requireAdmin(actor)
      return readAudit(actor.role)
    }

    setResponseStatus(event, 404)
    return { error: { code: 'not_found', message: 'Not found' } }
  })
})

async function liveResponse(event: Parameters<typeof resolveActor>[0]) {
  try {
    await resolveActor(event)
  } catch (error) {
    if (error instanceof HttpError) {
      setResponseStatus(event, error.statusCode)
      return { error: { code: error.code, message: error.message } }
    }
    throw error
  }
  const encoder = new TextEncoder()
  let unsubscribe = () => {}
  let timer: ReturnType<typeof setInterval> | undefined
  const stream = new ReadableStream({
    start(controller) {
      const cleanup = () => {
        if (timer) {
          clearInterval(timer)
        }
        timer = undefined
        unsubscribe()
        unsubscribe = () => {}
        try {
          controller.close()
        } catch {
          // The client already went away.
        }
      }
      const send = (name: string, data: string) => {
        try {
          controller.enqueue(encoder.encode(`event: ${name}\ndata: ${data}\n\n`))
        } catch {
          cleanup()
        }
      }
      unsubscribe = subscribeLive((payload) => {
        send(payload.type, JSON.stringify({ type: payload.type }))
      })
      timer = setInterval(() => {
        send('ping', '{}')
      }, 15_000)
      event.req.signal.addEventListener('abort', cleanup)
      send('ready', '{}')
    },
    cancel() {
      if (timer) {
        clearInterval(timer)
      }
      unsubscribe()
      unsubscribe = () => {}
    },
  })
  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
    },
  })
}

function faviconResponse() {
  const uploaded = readTabFavicon()
  if (uploaded) {
    return new Response(new Uint8Array(uploaded.bytes), {
      headers: {
        'content-type': uploaded.contentType,
        'cache-control': 'no-cache',
      },
    })
  }
  const accent = publicSettings().accentColour
  return new Response(bookmarkGlyph(accent), {
    headers: {
      'content-type': 'image/svg+xml; charset=utf-8',
      'cache-control': 'no-cache',
    },
  })
}

function logoResponse(event: Parameters<typeof resolveActor>[0]) {
  const logo = readLogo()
  if (!logo) {
    setResponseStatus(event, 404)
    return { error: { code: 'not_found', message: 'Logo not found' } }
  }
  return new Response(new Uint8Array(logo.bytes), {
    headers: {
      'content-type': logo.contentType,
      'cache-control': 'no-cache',
    },
  })
}

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
