import type { Actor } from '../auth/permissions'
import { getDatabase } from '../db/client'
import { entries, fieldDefinitions } from '../db/schema'
import { badRequest } from '../http/errors'
import { writeAudit } from '../services/audit'
import { createEntry } from '../services/entries'
import { publishLive } from '../services/live'

export interface CsvMapping {
  name: string
  host?: string
  description?: string
  link?: string
  tags?: string
  fields: Record<string, string>
}

export interface CsvImportResult {
  created: number
  warnings: string[]
  needsConfirmation: boolean
}

export function previewCsv(csv: string): { headers: string[]; rows: string[][] } {
  const table = parseCsv(csv)
  const headers = table[0]
  if (!headers || headers.every((cell) => cell.trim() === '')) {
    throw badRequest('The CSV file needs a header row')
  }
  return { headers, rows: table.slice(1, 9) }
}

export function importCsv(
  actor: Actor,
  csv: string,
  mapping: CsvMapping,
  dryRun: boolean,
  confirmDuplicates: boolean,
): CsvImportResult {
  const table = parseCsv(csv)
  const headers = table[0]
  if (!headers) {
    throw badRequest('The CSV file needs a header row')
  }
  const index = new Map(headers.map((header, position) => [header, position]))
  for (const header of [
    mapping.name,
    mapping.host,
    mapping.description,
    mapping.link,
    mapping.tags,
  ]) {
    if (header && !index.has(header)) {
      throw badRequest(`CSV column "${header}" was not found`)
    }
  }
  const definitions = new Map(
    getDatabase()
      .select()
      .from(fieldDefinitions)
      .all()
      .map((field) => [field.key, field]),
  )
  for (const key of Object.keys(mapping.fields)) {
    if (!definitions.has(key)) {
      throw badRequest(`Unknown field ${key}`)
    }
    const column = mapping.fields[key]
    if (column && !index.has(column)) {
      throw badRequest(`CSV column "${column}" was not found`)
    }
  }
  const existingNames = new Set(
    getDatabase()
      .select({ name: entries.name })
      .from(entries)
      .all()
      .map((row) => row.name),
  )
  const existingHosts = new Set(
    getDatabase()
      .select({ host: entries.host })
      .from(entries)
      .all()
      .flatMap((row) => (row.host ? [row.host] : [])),
  )
  const warnings: string[] = []
  const planned: Array<Parameters<typeof createEntry>[1]> = []
  const seenNames = new Set<string>()
  const seenHosts = new Set<string>()
  table.slice(1).forEach((row, offset) => {
    const line = offset + 2
    const name = cell(row, index, mapping.name).trim()
    if (!name) {
      throw badRequest(`Row ${line} has no name`)
    }
    const host = cell(row, index, mapping.host).trim()
    const description = cell(row, index, mapping.description)
    const link = cell(row, index, mapping.link).trim()
    const tags = cell(row, index, mapping.tags)
      .split(/[;,]/)
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0)
    if (seenNames.has(name) || existingNames.has(name)) {
      warnings.push(`Row ${line} uses the name ${name}, which already exists`)
    }
    if (host && (seenHosts.has(host) || existingHosts.has(host))) {
      warnings.push(`Row ${line} uses the host ${host}, which already exists`)
    }
    seenNames.add(name)
    if (host) {
      seenHosts.add(host)
    }
    const fields = Object.entries(mapping.fields).flatMap(([key, column]) => {
      const value = cell(row, index, column)
      return value === '' ? [] : [{ key, value }]
    })
    planned.push({
      name,
      description,
      host: host || null,
      iconRef: null,
      sort: 0,
      tags,
      links: link
        ? [
            {
              label: 'Open',
              urlTemplate: link,
              type: 'web',
              isPrimary: true,
              sort: 0,
              iconRef: null,
            },
          ]
        : [],
      fields,
      checks: [],
      actions: [],
      confirmDuplicates,
    })
  })
  if (warnings.length > 0 && !confirmDuplicates) {
    return { created: 0, warnings, needsConfirmation: true }
  }
  if (dryRun) {
    return { created: planned.length, warnings, needsConfirmation: false }
  }
  for (const entry of planned) {
    createEntry(actor, entry)
  }
  if (planned.length > 0) {
    publishLive({ type: 'entries' })
  }
  writeAudit(actor, 'csv.import', 'entry', null, { created: planned.length })
  return { created: planned.length, warnings, needsConfirmation: false }
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cellValue = ''
  let quoted = false
  const source = text.replace(/^\uFEFF/, '')
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index] ?? ''
    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          cellValue += '"'
          index += 1
        } else {
          quoted = false
        }
      } else {
        cellValue += char
      }
      continue
    }
    if (char === '"') {
      quoted = true
      continue
    }
    if (char === ',') {
      row.push(cellValue)
      cellValue = ''
      continue
    }
    if (char === '\n') {
      row.push(cellValue)
      cellValue = ''
      pushRow(rows, row)
      row = []
      continue
    }
    if (char !== '\r') {
      cellValue += char
    }
  }
  if (cellValue.length > 0 || row.length > 0) {
    row.push(cellValue)
    pushRow(rows, row)
  }
  return rows
}

function pushRow(rows: string[][], row: string[]): void {
  if (row.length === 1 && row[0] === '') {
    return
  }
  rows.push(row)
}

function cell(row: string[], index: Map<string, number>, header: string | undefined): string {
  if (!header) {
    return ''
  }
  const position = index.get(header)
  if (position === undefined) {
    return ''
  }
  return row[position] ?? ''
}
