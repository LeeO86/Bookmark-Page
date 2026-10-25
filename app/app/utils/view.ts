import type { PortalEntry, PortalField, SortKey } from '../types/portal'

export interface EntryGroup {
  key: string
  label: string
  entries: PortalEntry[]
}

export function sortEntries(
  entries: readonly PortalEntry[],
  key: SortKey,
  direction: 'asc' | 'desc',
): PortalEntry[] {
  const factor = direction === 'asc' ? 1 : -1
  return [...entries].sort((left, right) => compareEntries(left, right, key) * factor)
}

export function groupEntries(
  entries: readonly PortalEntry[],
  namespace: string | null,
  labelFor: (value: string) => string = (value) => value,
): EntryGroup[] {
  if (!namespace) {
    return [{ key: 'all', label: 'All', entries: [...entries] }]
  }
  if (namespace === 'state') {
    const order = ['online', 'offline', 'unknown'] as const
    const groups: EntryGroup[] = order
      .map((value) => ({
        key: value,
        label: labelFor(value),
        entries: entries.filter((entry) => statusName(entry.status) === value),
      }))
      .filter((group) => group.entries.length > 0)
    const quiet = entries.filter((entry) => entry.status === null)
    if (quiet.length > 0) {
      groups.push({ key: '__ungrouped', label: 'Ungrouped', entries: quiet })
    }
    return groups
  }
  const groups = new Map<string, PortalEntry[]>()
  const ungrouped: PortalEntry[] = []
  for (const entry of entries) {
    const tags = entry.tags.filter((tag) => tag.namespace === namespace)
    if (tags.length === 0) {
      ungrouped.push(entry)
      continue
    }
    for (const tag of tags) {
      const rows = groups.get(tag.value) ?? []
      rows.push(entry)
      groups.set(tag.value, rows)
    }
  }
  const grouped = [...groups.entries()]
    .sort((left, right) => labelFor(left[0]).localeCompare(labelFor(right[0])))
    .map(([value, rows]) => ({ key: value, label: labelFor(value), entries: rows }))
  if (ungrouped.length > 0) {
    grouped.push({ key: '__ungrouped', label: 'Ungrouped', entries: ungrouped })
  }
  return grouped
}

export function visibleFieldColumns(
  columns: readonly string[],
  fields: readonly PortalField[],
): PortalField[] {
  if (columns.length > 0) {
    return columns.flatMap((key) => {
      const field = fields.find((item) => item.key === key)
      return field ? [field] : []
    })
  }
  return fields.filter((field) => field.showAsColumnDefault)
}

export function isPathLocked(
  editMode: PortalEntry['editMode'],
  managed: readonly string[],
  path: string,
): boolean {
  if (editMode === 'locked') {
    return true
  }
  if (editMode === 'field_ownership') {
    return managed.includes(path)
  }
  return false
}

export function tagCounts(entries: readonly PortalEntry[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const entry of entries) {
    for (const tag of entry.tags) {
      counts.set(tag.label, (counts.get(tag.label) ?? 0) + 1)
    }
  }
  return counts
}

function compareEntries(left: PortalEntry, right: PortalEntry, key: SortKey): number {
  if (key === 'manual') {
    return left.sort - right.sort || left.name.localeCompare(right.name)
  }
  if (key === 'name') {
    return left.name.localeCompare(right.name)
  }
  if (key === 'description') {
    return left.description.localeCompare(right.description)
  }
  if (key === 'status') {
    return statusRank(left.status) - statusRank(right.status)
  }
  if (key.startsWith('field:')) {
    return fieldText(left, key.slice('field:'.length)).localeCompare(
      fieldText(right, key.slice('field:'.length)),
    )
  }
  return 0
}

function statusName(status: PortalEntry['status']): 'online' | 'offline' | 'unknown' | null {
  if (status === 'up') {
    return 'online'
  }
  if (status === 'down') {
    return 'offline'
  }
  if (status === 'unknown') {
    return 'unknown'
  }
  return null
}

function statusRank(status: PortalEntry['status']): number {
  if (status === 'up') {
    return 0
  }
  if (status === 'unknown') {
    return 1
  }
  if (status === 'down') {
    return 2
  }
  return 3
}

function fieldText(entry: PortalEntry, key: string): string {
  return entry.fields.find((field) => field.key === key)?.value ?? ''
}
