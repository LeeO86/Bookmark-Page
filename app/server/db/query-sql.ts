import { sql, type SQL } from 'drizzle-orm'
import type { QueryNode, StatusTerm } from '../../shared/query'
import { roleAtLeast, roles, type Role } from '../../shared/roles'
import { entries } from './schema'

export function compileQuery(ast: QueryNode | null, role: Role): SQL {
  if (!ast) {
    return sql`1 = 1`
  }
  return compileNode(ast, role)
}

export function visibilitySql(
  role: Role,
  filters: Array<QueryNode | null>,
  allTabPublic: boolean,
): SQL {
  if (role !== 'anonymous' || allTabPublic) {
    return sql`1 = 1`
  }
  if (filters.length === 0) {
    return sql`1 = 0`
  }
  const parts = filters.map((filter) => compileQuery(filter, 'anonymous'))
  return sql`(${joinSql(parts, ' or ')})`
}

function compileNode(node: QueryNode, role: Role): SQL {
  switch (node.type) {
    case 'or':
      return sql`(${compileNode(node.left, role)} or ${compileNode(node.right, role)})`
    case 'and':
      return sql`(${compileNode(node.left, role)} and ${compileNode(node.right, role)})`
    case 'not':
      return sql`(not ${compileNode(node.child, role)})`
    case 'tag':
      return tagSql(node.namespace ?? '', node.value, node.wildcard)
    case 'is':
      return statusSql(node.value)
    case 'has':
      return hasSql(node.value)
    case 'text':
      return textSql(node.value, role)
  }
}

function tagSql(namespace: string, value: string, wildcard: boolean): SQL {
  if (wildcard && value.length === 0) {
    return sql`exists (
      select 1 from entry_tags et
      inner join tags t on t.id = et.tag_id
      where et.entry_id = ${entries.id}
        and t.namespace_name = ${namespace}
    )`
  }
  if (wildcard) {
    return sql`exists (
      select 1 from entry_tags et
      inner join tags t on t.id = et.tag_id
      where et.entry_id = ${entries.id}
        and t.namespace_name = ${namespace}
        and substr(t.value, 1, length(${value})) = ${value}
    )`
  }
  return sql`exists (
    select 1 from entry_tags et
    inner join tags t on t.id = et.tag_id
    where et.entry_id = ${entries.id}
      and t.namespace_name = ${namespace}
      and t.value = ${value}
  )`
}

function statusSql(value: StatusTerm): SQL {
  if (value === 'managed') {
    return sql`${entries.source} is not null`
  }
  if (value === 'unmanaged') {
    return sql`${entries.source} is null`
  }
  if (value === 'unknown') {
    return sql`(
      not exists (select 1 from checks c where c.entry_id = ${entries.id})
      or exists (
        select 1 from checks c
        left join check_status s on s.check_id = c.id
        where c.entry_id = ${entries.id}
          and (s.state is null or s.state = 'unknown')
      )
    )`
  }
  return sql`exists (
    select 1 from checks c
    inner join check_status s on s.check_id = c.id
    where c.entry_id = ${entries.id}
      and s.state = ${value}
  )`
}

function hasSql(value: string): SQL {
  if (value === 'link') {
    return sql`exists (select 1 from links l where l.entry_id = ${entries.id})`
  }
  if (value === 'check') {
    return sql`exists (select 1 from checks c where c.entry_id = ${entries.id})`
  }
  return sql`exists (
    select 1 from field_values fv
    inner join field_definitions fd on fd.id = fv.field_id
    where fv.entry_id = ${entries.id}
      and fd.key = ${value}
  )`
}

function textSql(value: string, role: Role): SQL {
  const pattern = likeContains(value)
  const visible = roles.filter((item) => roleAtLeast(role, item))
  const roleList = joinSql(
    visible.map((item) => sql`${item}`),
    ', ',
  )
  return sql`(
    ${entries.name} like ${pattern} escape ${'\\'}
    or ${entries.description} like ${pattern} escape ${'\\'}
    or ifnull(${entries.host}, '') like ${pattern} escape ${'\\'}
    or exists (
      select 1 from links l
      where l.entry_id = ${entries.id}
        and (
          l.label like ${pattern} escape ${'\\'}
          or l.url_template like ${pattern} escape ${'\\'}
        )
    )
    or exists (
      select 1 from field_values fv
      inner join field_definitions fd on fd.id = fv.field_id
      where fv.entry_id = ${entries.id}
        and fd.type != 'secret'
        and fd.searchable = 1
        and fd.min_role_to_view in (${roleList})
        and ifnull(fv.value_text, '') like ${pattern} escape ${'\\'}
    )
  )`
}

export function likeContains(value: string): string {
  return `%${escapeLike(value)}%`
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`)
}

function joinSql(parts: SQL[], separator: string): SQL {
  if (parts.length === 0) {
    return sql`null`
  }
  let combined = parts[0] as SQL
  const glue = sql.raw(separator)
  for (const part of parts.slice(1)) {
    combined = sql`${combined}${glue}${part}`
  }
  return combined
}
