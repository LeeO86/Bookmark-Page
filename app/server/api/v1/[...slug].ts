import { listEntryFacets } from '../../services/facets'
import {
  previewEntryFavicon,
  supplyEntryFavicon,
  removeSuppliedFavicon,
} from '../../icons/supplied'
import { contentHash } from '../../icons/refs'
import { syncFilters } from '../../services/filters-sync'
import {
  clearSession,
  defineEventHandler,
  getQuery,
  getRequestURL,
  readBody,
  setResponseStatus,
  updateSession,
} from 'nuxt/server'
import {
  actionExecuteSchema,
  actionTemplateSchema,
  checkReportSchema,
  checkLeaseSchema,
  entryPatchSchema,
  entryFaviconSupplySchema,
  entryWriteSchema,
  fieldDefinitionSchema,
  filterPatchSchema,
  filterWriteSchema,
  iconWriteSchema,
  filtersSyncSchema,
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
import {
  startOidcSignIn,
  completeOidcSignIn,
  clearOidcSuppression,
  suppressOidc,
} from '../../auth/oidc-flow'
import { publicActor } from '../../auth/presentation'
import { authOptions, authStatus } from '../../auth/status'
import { peerIp, resolveActor } from '../../auth/resolve'
import { sessionConfig, type AppSession } from '../../auth/session'
import {
  requireAdmin,
  requireRead,
  requireRole,
  requireWrite,
  requireTokenScope,
} from '../../auth/permissions'
import { getDatabase } from '../../db/client'
import { users } from '../../db/schema'
import { eq } from 'drizzle-orm'
import { run } from '../../http/api'
import { badRequest, HttpError } from '../../http/errors'
import { openApiDocument, openApiHtml } from '../../openapi'
import {
  createFieldDefinition,
  createFilter,
  createIcon,
  replaceIcon,
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
  refreshMissingFavicons,
  listEntryHistory,
  restoreEntry,
  revealField,
  revealLink,
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
  prepareBrandingImage,
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
      await updateSession<AppSession>(event, sessionConfig(), {
        userId: user.id,
        signInMethod: getDatabase().select().from(users).where(eq(users.id, user.id)).get()
          ?.breakGlass
          ? 'break-glass'
          : 'local',
      })
      clearOidcSuppression(event)
      return { user }
    }
    if (method === 'POST' && path === '/api/v1/auth/logout') {
      await clearSession(event, sessionConfig())
      suppressOidc(event, true)
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
    if (method === 'GET' && path === '/api/v1/auth/oidc/start') return startOidcSignIn(event)
    if (method === 'GET' && path === '/api/v1/auth/oidc/callback') return completeOidcSignIn(event)

    if (method === 'GET' && path === '/api/v1/entries') {
      const query = getQuery(event)
      const result = listEntries(actor, typeof query.q === 'string' ? query.q : '')
      if (query.facetQuery === undefined) return result
      if (
        typeof query.facetQuery !== 'string' ||
        (query.facetTab !== undefined && typeof query.facetTab !== 'string')
      )
        throw badRequest('Invalid facet parameters')
      const tab =
        query.facetTab && query.facetTab !== 'all'
          ? listFilters(actor).find((filter) => filter.id === query.facetTab)
          : null
      if (query.facetTab && query.facetTab !== 'all' && !tab) throw badRequest('Unknown facet tab')
      return { ...result, facets: listEntryFacets(actor, query.facetQuery, tab?.query ?? '') }
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
    const linkReveal = matchAll(path, /^\/api\/v1\/entries\/([^/]+)\/links\/([^/]+)\/reveal$/)
    if (linkReveal && method === 'POST') {
      requireRead(actor)
      event.res.headers.set('cache-control', 'no-store')
      return revealLink(
        actor,
        decodeURIComponent(linkReveal[0] ?? ''),
        decodeURIComponent(linkReveal[1] ?? ''),
      )
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
    const faviconPreview = match(path, /^\/api\/v1\/entries\/([^/]+)\/favicon\/preview$/)
    if (faviconPreview && method === 'POST') {
      requireWrite(actor)
      const id = decodeURIComponent(faviconPreview)
      getEntry(actor, id)
      const preview = previewEntryFavicon(
        actor,
        id,
        entryFaviconSupplySchema.parse(await readBody(event)),
      )
      return {
        contentHash: preview.contentHash,
        mediaType: preview.image.mediaType,
        currentHash: preview.currentHash,
        currentSource: preview.currentSource,
      }
    }
    const faviconRefresh = match(path, /^\/api\/v1\/entries\/([^/]+)\/favicon$/)
    if (faviconRefresh && method === 'DELETE') {
      requireWrite(actor)
      const id = decodeURIComponent(faviconRefresh)
      getEntry(actor, id)
      return removeSuppliedFavicon(actor, id)
    }
    if (faviconRefresh && method === 'PUT') {
      requireWrite(actor)
      const id = decodeURIComponent(faviconRefresh)
      getEntry(actor, id)
      return supplyEntryFavicon(actor, id, entryFaviconSupplySchema.parse(await readBody(event)))
    }
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
      requireTokenScope(actor, ['write', 'admin'])
      setResponseStatus(event, 201)
      return createFilter(actor, filterWriteSchema.parse(await readBody(event)))
    }
    const filterId = match(path, /^\/api\/v1\/filters\/([^/]+)$/)
    if (filterId && method === 'PATCH') {
      requireRole(actor, 'viewer')
      requireTokenScope(actor, ['write', 'admin'])
      return updateFilter(
        actor,
        decodeURIComponent(filterId),
        filterPatchSchema.parse(await readBody(event)),
      )
    }
    if (filterId && method === 'DELETE') {
      requireRole(actor, 'viewer')
      requireTokenScope(actor, ['write', 'admin'])
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
      const name = getQuery(event).name
      return {
        icons: searchIcons(
          typeof query === 'string' ? query : '',
          typeof name === 'string' ? name : undefined,
        ),
      }
    }
    if (method === 'POST' && path === '/api/v1/icons/preview') {
      requireAdmin(actor)
      const body = iconWriteSchema.parse(await readBody(event))
      const data = prepareUpload(body.contentType, body.data)
      return { contentHash: contentHash(data), byteSize: data.length, mediaType: body.contentType }
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
    if (iconId && (method === 'PUT' || method === 'PATCH')) {
      requireAdmin(actor)
      const body = iconWriteSchema.partial({ name: true }).parse(await readBody(event))
      return replaceIcon(actor, decodeURIComponent(iconId), {
        name: body.name,
        mediaType: body.contentType,
        data: prepareUpload(body.contentType, body.data),
      })
    }
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
    const filterSync = match(path, /^\/api\/v1\/scopes\/([^/]+)\/filters\/sync$/)
    if (filterSync && method === 'POST') {
      requireAdmin(actor)
      return syncFilters(
        actor,
        decodeURIComponent(filterSync),
        filtersSyncSchema.parse(await readBody(event)),
      )
    }
    if (method === 'GET' && path === '/api/v1/favicons') {
      requireAdmin(actor)
      return {
        failures: listEntries(actor, '')
          .entries.filter((entry) => entry.faviconStatus?.error)
          .map((entry) => ({ id: entry.id, name: entry.name, ...entry.faviconStatus })),
      }
    }
    if (method === 'POST' && path === '/api/v1/favicons/refresh-missing') {
      requireAdmin(actor)
      return refreshMissingFavicons(actor)
    }
    const sync = match(path, /^\/api\/v1\/scopes\/([^/]+)\/sync$/)
    if (sync && method === 'POST') {
      requireWrite(actor)
      return syncScope(actor, decodeURIComponent(sync), syncBodySchema.parse(await readBody(event)))
    }

    if (method === 'POST' && path === '/api/v1/checks/lease') {
      const { limit } = checkLeaseSchema.parse((await readBody(event)) ?? {})
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
      requireTokenScope(actor, ['write', 'admin'])
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
    const imagePreview = match(path, /^\/api\/v1\/settings\/(logo|favicon)\/preview$/)
    if (method === 'POST' && imagePreview) {
      requireAdmin(actor)
      const body = (imagePreview === 'logo' ? logoWriteSchema : faviconWriteSchema).parse(
        await readBody(event),
      )
      const { contentHash, byteSize, contentType } = prepareBrandingImage(
        imagePreview === 'logo' ? 'logo' : 'tab_favicon',
        body.contentType,
        body.data,
      )
      return { contentHash, byteSize, contentType }
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
