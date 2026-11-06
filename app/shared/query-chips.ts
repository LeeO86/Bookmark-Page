import { parseQuery, type QueryNode } from './query'

export type QueryChipKind = 'tag' | 'is' | 'has' | 'text' | 'group'
export type QueryJoin = 'and' | 'or'
export type QueryAppend = 'and' | 'or' | 'not'

export interface QueryChip {
  text: string
  start: number
  end: number
  negated: boolean
  join: QueryJoin
  kind: QueryChipKind
}

export interface QueryChipResult {
  chips: QueryChip[]
  error: { message: string; position: number } | null
}

export function queryChips(input: string): QueryChipResult {
  const parsed = parseQuery(input)
  if (!parsed.ok) {
    return { chips: [], error: { message: parsed.message, position: parsed.position } }
  }
  return { chips: scanChips(input), error: null }
}

export function removeQueryChip(input: string, index: number): string {
  const parsed = queryChips(input)
  const chip = parsed.chips[index]
  if (parsed.error || !chip) {
    return input
  }
  return chipsToQuery(parsed.chips.filter((_, chipIndex) => chipIndex !== index))
}

export function chipsToQuery(chips: readonly QueryChip[]): string {
  return chips
    .map((chip, index) => (index > 0 && chip.join === 'or' ? `OR ${chip.text}` : chip.text))
    .join(' ')
}

export function appendQueryTerm(input: string, term: string, mode: QueryAppend): string {
  const piece = mode === 'not' ? `-${formatTerm(term)}` : formatTerm(term)
  const trimmed = input.trim()
  if (!trimmed) {
    return piece
  }
  if (mode === 'or') {
    return `${trimmed} OR ${piece}`
  }
  return `${trimmed} ${piece}`
}

export function queryHasTerm(input: string, term: string): boolean {
  const parsed = parseQuery(input)
  const target = parseQuery(formatTerm(term))
  if (!parsed.ok || !target.ok || !target.ast) return false
  return (
    containsTerm(parsed.ast, target.ast) ||
    containsTerm(parsed.ast, { type: 'not', child: target.ast })
  )
}

/** Toggle a facet, removing duplicates and preserving the remaining boolean expression. */
export function toggleQueryTerm(input: string, term: string, mode: QueryAppend): string {
  const parsed = parseQuery(input)
  const target = parseQuery(formatTerm(term))
  if (!parsed.ok || !target.ok || !target.ast) return input
  const positive = target.ast
  const negative: QueryNode = { type: 'not', child: positive }
  const active = containsTerm(parsed.ast, mode === 'not' ? negative : positive)
  const remainder = removeTerm(removeTerm(parsed.ast, positive), negative)
  if (active) return remainder ? formatNode(remainder) : ''
  const query = remainder ? formatNode(remainder, mode === 'or' ? 0 : 2) : ''
  return appendQueryTerm(query, term, mode)
}

/** Namespace identity is shared by server counts and sidebar-only query edits. */
export function facetNamespace(node: QueryNode): string | undefined {
  if (node.type === 'not') return facetNamespace(node.child)
  if (node.type === 'tag') return node.namespace === null ? 'plain' : `tag:${node.namespace}`
  if (node.type === 'state') return 'state'
  return undefined
}

export function simpleFacetTerms(input: string): QueryNode[] | null {
  const parsed = parseQuery(input)
  const chips = queryChips(input)
  if (!parsed.ok || chips.chips.some((chip) => chip.kind === 'group' || chip.join === 'or'))
    return null
  const flatten = (node: QueryNode | null): QueryNode[] | null => {
    if (!node) return []
    if (node.type === 'or') return null
    if (node.type === 'and') {
      const left = flatten(node.left),
        right = flatten(node.right)
      return left && right ? [...left, ...right] : null
    }
    if (node.type === 'not' && (node.child.type === 'and' || node.child.type === 'or')) return null
    return [node]
  }
  return flatten(parsed.ast)
}

export function withoutFacetNamespace(terms: QueryNode[], namespace: string): QueryNode | null {
  return terms
    .filter((term) => facetNamespace(term) !== namespace)
    .reduce<QueryNode | null>((left, right) => (left ? { type: 'and', left, right } : right), null)
}

/** A single selected facet switches; the existing chip/query helpers keep their semantics. */
export function toggleSidebarQueryTerm(input: string, term: string, mode: QueryAppend): string {
  if (mode !== 'and') return toggleQueryTerm(input, term, mode)
  const parsed = parseQuery(input),
    target = parseQuery(formatTerm(term))
  if (!parsed.ok || !target.ok || !target.ast) return input
  const namespace = facetNamespace(target.ast)
  if (namespace === undefined) return toggleQueryTerm(input, term, mode)
  if (queryHasTerm(input, term)) {
    const remaining = removeTerm(removeTerm(parsed.ast, target.ast), {
      type: 'not',
      child: target.ast,
    })
    return remaining ? formatNode(remaining) : ''
  }
  const matches: QueryNode[] = []
  const visit = (node: QueryNode | null) => {
    if (!node) return
    if (node.type === 'and' || node.type === 'or') {
      visit(node.left)
      visit(node.right)
    } else if (facetNamespace(node) === namespace) matches.push(node)
  }
  visit(parsed.ast)
  if (matches.length !== 1) return toggleQueryTerm(input, term, mode)
  const replace = (node: QueryNode): QueryNode => {
    if (sameTerm(node, matches[0]!)) return target.ast!
    if (node.type === 'and' || node.type === 'or')
      return { ...node, left: replace(node.left), right: replace(node.right) }
    return node
  }
  return parsed.ast ? formatNode(replace(parsed.ast)) : formatNode(target.ast)
}

function sameTerm(node: QueryNode, target: QueryNode): boolean {
  return JSON.stringify(node) === JSON.stringify(target)
}

function containsTerm(node: QueryNode | null, target: QueryNode): boolean {
  if (!node) return false
  if (sameTerm(node, target)) return true
  return (
    (node.type === 'and' || node.type === 'or') &&
    (containsTerm(node.left, target) || containsTerm(node.right, target))
  )
}

function removeTerm(node: QueryNode | null, target: QueryNode): QueryNode | null {
  if (!node || sameTerm(node, target)) return null
  if (node.type !== 'and' && node.type !== 'or') return node
  const left = removeTerm(node.left, target)
  const right = removeTerm(node.right, target)
  if (!left || !right) return left ?? right
  return { ...node, left, right }
}

function formatNode(node: QueryNode, parentPrecedence = 0): string {
  switch (node.type) {
    case 'and':
      return groupNode(
        `${formatNode(node.left, 2)} ${formatNode(node.right, 2)}`,
        2,
        parentPrecedence,
      )
    case 'or':
      return groupNode(
        `${formatNode(node.left, 1)} OR ${formatNode(node.right, 1)}`,
        1,
        parentPrecedence,
      )
    case 'not':
      return `-${formatNode(node.child, 3)}`
    case 'tag':
      return formatTerm(
        `${node.namespace === null ? '#' : node.namespace + ':'}${node.value}${node.wildcard ? '*' : ''}`,
      )
    case 'is':
      return `is:${node.value}`
    case 'state':
      return `state:${node.value}`
    case 'has':
      return `has:${node.value}`
    case 'text':
      return `"${node.value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
  }
}

function groupNode(query: string, precedence: number, parent: number): string {
  return precedence < parent ? `(${query})` : query
}

export function combineQueries(left: string, right: string): string {
  const first = left.trim()
  const second = right.trim()
  if (first && second) {
    return `(${first}) (${second})`
  }
  return first || second
}

export function activeQueryToken(
  input: string,
  cursor = input.length,
): { text: string; start: number; end: number } {
  const clamped = Math.max(0, Math.min(cursor, input.length))
  let start = clamped
  while (start > 0) {
    const char = input[start - 1]
    if (char === undefined || isSpace(char) || char === '(' || char === ')') {
      break
    }
    start -= 1
  }
  let end = clamped
  while (end < input.length) {
    const char = input[end]
    if (char === undefined || isSpace(char) || char === '(' || char === ')') {
      break
    }
    end += 1
  }
  return { text: input.slice(start, end), start, end }
}

export function suggestionToken(input: string, cursor = input.length): string {
  const text = activeQueryToken(input, cursor).text
  return text.startsWith('-') ? text.slice(1) : text
}

export function applySuggestion(input: string, suggestion: string, cursor = input.length): string {
  const token = activeQueryToken(input, cursor)
  const replacement = token.text.startsWith('-')
    ? `-${formatTerm(suggestion)}`
    : formatTerm(suggestion)
  const before = input.slice(0, token.start)
  const after = input.slice(token.end)
  const prefix = before.length > 0 && !/\s$/.test(before) ? `${before} ` : before
  return `${prefix}${replacement}${after}`
}

export function suggestQuery(
  token: string,
  tags: readonly string[],
  fieldKeys: readonly string[],
): string[] {
  const needle = token.trim().toLowerCase()
  if (!needle || needle === 'and' || needle === 'or' || needle === 'not') {
    return []
  }
  const options = [
    ...tags,
    'is:up',
    'is:down',
    'is:unknown',
    'is:managed',
    'is:unmanaged',
    'state:online',
    'state:offline',
    'state:unknown',
    'has:link',
    'has:check',
    ...fieldKeys.map((key) => `has:${key}`),
  ]
  const seen = new Set<string>()
  const matches: string[] = []
  for (const option of options) {
    const lower = option.toLowerCase()
    if (seen.has(lower) || !lower.startsWith(needle) || lower === needle) {
      continue
    }
    seen.add(lower)
    matches.push(option)
    if (matches.length === 8) {
      break
    }
  }
  return matches
}

function scanChips(input: string): QueryChip[] {
  const chips: QueryChip[] = []
  let index = 0
  let join: QueryJoin = 'and'
  let negated = false
  let negStart = 0

  const push = (raw: string, start: number, end: number) => {
    const text = raw.trim()
    if (!text) {
      return
    }
    chips.push({ text, start, end, negated, join, kind: chipKind(text) })
    negated = false
    join = 'and'
  }

  while (index < input.length) {
    while (index < input.length && isSpace(input[index] ?? '')) {
      index += 1
    }
    if (index >= input.length) {
      break
    }
    const char = input[index] ?? ''
    if (char === '(') {
      const end = matchingParen(input, index)
      push(input.slice(negated ? negStart : index, end), negated ? negStart : index, end)
      index = end
      continue
    }
    if (char === '"') {
      const end = closingQuote(input, index)
      push(input.slice(negated ? negStart : index, end), negated ? negStart : index, end)
      index = end
      continue
    }
    if (char === '-' && !negated) {
      negated = true
      negStart = index
      index += 1
      continue
    }
    const start = index
    while (index < input.length) {
      const current = input[index]
      if (
        current === undefined ||
        isSpace(current) ||
        current === '(' ||
        current === ')' ||
        current === '"'
      ) {
        break
      }
      index += 1
    }
    if (input[index] === '"' && /(?:^#|:)$/.test(input.slice(start, index)))
      index = closingQuote(input, index)
    const word = input.slice(start, index)
    const keyword = word.toLowerCase()
    if (!negated && (keyword === 'and' || keyword === 'or')) {
      join = keyword
      continue
    }
    if (!negated && keyword === 'not') {
      negated = true
      negStart = start
      continue
    }
    const textStart = negated ? negStart : start
    push(input.slice(textStart, index), textStart, index)
  }
  return chips
}

export function chipKind(text: string): QueryChipKind {
  const term = text.replace(/^(?:NOT\s+|-\s*)/i, '')
  if (term.startsWith('(')) {
    return 'group'
  }
  if (term.startsWith('"')) {
    return 'text'
  }
  const lower = term.toLowerCase()
  if (lower.startsWith('is:') || lower.startsWith('state:')) {
    return 'is'
  }
  if (lower.startsWith('has:')) {
    return 'has'
  }
  if (term.startsWith('#') || term.includes(':')) {
    return 'tag'
  }
  return 'text'
}

function formatTerm(term: string): string {
  const quote = (value: string) => `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
  if (!/[\s()"]/.test(term)) return term
  const match = /^(#[^]*|[^:]+:[^]*)$/.exec(term)
  if (match) {
    const split = term.startsWith('#') ? 1 : term.indexOf(':') + 1
    return term.slice(0, split) + quote(term.slice(split))
  }
  return quote(term)
}

function matchingParen(input: string, open: number): number {
  let depth = 0
  let index = open
  while (index < input.length) {
    const char = input[index]
    if (char === '"') {
      index = closingQuote(input, index)
      continue
    }
    if (char === '(') {
      depth += 1
    }
    if (char === ')') {
      depth -= 1
      if (depth === 0) {
        return index + 1
      }
    }
    index += 1
  }
  return input.length
}

function closingQuote(input: string, start: number): number {
  let index = start + 1
  while (index < input.length) {
    const char = input[index]
    if (char === '\\') {
      index += 2
      continue
    }
    if (char === '"') {
      return index + 1
    }
    index += 1
  }
  return input.length
}

function isSpace(char: string): boolean {
  return char === ' ' || char === '\t' || char === '\n' || char === '\r'
}
