import { parseQuery } from './query'

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
  const replacement = token.text.startsWith('-') ? `-${suggestion}` : suggestion
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
  if (lower.startsWith('is:')) {
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
  if (/[\s()"]/.test(term)) {
    return `"${term.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
  }
  return term
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
