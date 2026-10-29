export type StatusTerm = 'up' | 'down' | 'unknown' | 'managed' | 'unmanaged'

export type QueryNode =
  | { type: 'or'; left: QueryNode; right: QueryNode }
  | { type: 'and'; left: QueryNode; right: QueryNode }
  | { type: 'not'; child: QueryNode }
  | { type: 'tag'; namespace: string | null; value: string; wildcard: boolean }
  | { type: 'is'; value: StatusTerm }
  | { type: 'state'; value: 'online' | 'offline' | 'unknown' }
  | { type: 'has'; value: string }
  | { type: 'text'; value: string }

export type ParseResult =
  { ok: true; ast: QueryNode | null } | { ok: false; message: string; position: number }

type Token =
  | { type: 'or' | 'and' | 'not' | 'minus' | 'lparen' | 'rparen'; position: number }
  | { type: 'word'; value: string; position: number }
  | { type: 'phrase'; value: string; position: number }

const statusTerms = new Set<StatusTerm>(['up', 'down', 'unknown', 'managed', 'unmanaged'])

export function parseQuery(input: string): ParseResult {
  try {
    const tokens = lex(input)
    if (tokens.length === 0) {
      return { ok: true, ast: null }
    }
    const parser = new Parser(tokens)
    const ast = parser.parseOr()
    parser.expectEnd()
    return { ok: true, ast }
  } catch (error) {
    if (error instanceof ParseError) {
      return { ok: false, message: error.message, position: error.position }
    }
    throw error
  }
}

class ParseError extends Error {
  constructor(
    message: string,
    readonly position: number,
  ) {
    super(message)
  }
}

class Parser {
  private index = 0

  constructor(private readonly tokens: Token[]) {}

  parseOr(): QueryNode {
    let left = this.parseAnd()
    while (this.match('or')) {
      left = { type: 'or', left, right: this.parseAnd() }
    }
    return left
  }

  expectEnd(): void {
    if (this.peek()) {
      const token = this.peek()
      throw new ParseError('Unexpected token', token?.position ?? 0)
    }
  }

  private parseAnd(): QueryNode {
    let left = this.parseUnary()
    while (this.match('and') || this.startsUnary()) {
      left = { type: 'and', left, right: this.parseUnary() }
    }
    return left
  }

  private parseUnary(): QueryNode {
    const token = this.peek()
    if (token?.type === 'not' || token?.type === 'minus') {
      this.index += 1
      return { type: 'not', child: this.parseUnary() }
    }
    return this.parsePrimary()
  }

  private parsePrimary(): QueryNode {
    const token = this.peek()
    if (!token) {
      throw new ParseError('Unexpected end of query', this.endPosition())
    }
    if (token.type === 'lparen') {
      this.index += 1
      const inner = this.parseOr()
      if (!this.match('rparen')) {
        throw new ParseError('Unbalanced parentheses', token.position)
      }
      return inner
    }
    if (token.type === 'word' || token.type === 'phrase') {
      this.index += 1
      const next = this.peek()
      if (
        token.type === 'word' &&
        (token.value.endsWith(':') || token.value === '#') &&
        next?.type === 'phrase' &&
        next.position === token.position + token.value.length
      ) {
        this.index += 1
        return tagTerm(
          token.value === '#' ? null : token.value.slice(0, -1),
          next.value,
          token.position,
        )
      }
      return token.type === 'phrase' ? { type: 'text', value: token.value } : termFromWord(token)
    }
    throw new ParseError('Unexpected token', token.position)
  }

  private startsUnary(): boolean {
    const token = this.peek()
    return (
      token?.type === 'not' ||
      token?.type === 'minus' ||
      token?.type === 'lparen' ||
      token?.type === 'word' ||
      token?.type === 'phrase'
    )
  }

  private match(type: Token['type']): boolean {
    if (this.peek()?.type === type) {
      this.index += 1
      return true
    }
    return false
  }

  private peek(): Token | undefined {
    return this.tokens[this.index]
  }

  private endPosition(): number {
    const last = this.tokens[this.tokens.length - 1]
    return last ? last.position : 0
  }
}

function termFromWord(token: Extract<Token, { type: 'word' }>): QueryNode {
  if (token.value.startsWith('#')) {
    return tagTerm(null, token.value.slice(1), token.position)
  }
  const colon = token.value.indexOf(':')
  if (colon <= 0) {
    return { type: 'text', value: token.value }
  }
  const name = token.value.slice(0, colon)
  const rest = token.value.slice(colon + 1)
  if (name.toLowerCase() === 'is') {
    const value = rest.toLowerCase()
    if (!isStatusTerm(value)) {
      throw new ParseError(`Unknown is: term "${rest}"`, token.position)
    }
    return { type: 'is', value }
  }
  if (name.toLowerCase() === 'state') {
    const value = rest.toLowerCase()
    if (value !== 'online' && value !== 'offline' && value !== 'unknown') {
      throw new ParseError(`Unknown state: term "${rest}"`, token.position)
    }
    return { type: 'state', value }
  }
  if (name.toLowerCase() === 'has') {
    if (rest.length === 0) {
      throw new ParseError('has: needs a target', token.position)
    }
    const lower = rest.toLowerCase()
    return { type: 'has', value: lower === 'link' || lower === 'check' ? lower : rest }
  }
  return tagTerm(name, rest, token.position)
}

function tagTerm(namespace: string | null, raw: string, position: number): QueryNode {
  if (raw.length === 0) {
    throw new ParseError('Tag value is empty', position)
  }
  if (raw.endsWith('*')) {
    return { type: 'tag', namespace, value: raw.slice(0, -1), wildcard: true }
  }
  return { type: 'tag', namespace, value: raw, wildcard: false }
}

function isStatusTerm(value: string): value is StatusTerm {
  return statusTerms.has(value as StatusTerm)
}

function lex(input: string): Token[] {
  const tokens: Token[] = []
  let index = 0
  while (index < input.length) {
    const char = input[index]
    if (char === undefined) {
      break
    }
    if (isSpace(char)) {
      index += 1
      continue
    }
    if (char === '(') {
      tokens.push({ type: 'lparen', position: index })
      index += 1
      continue
    }
    if (char === ')') {
      tokens.push({ type: 'rparen', position: index })
      index += 1
      continue
    }
    if (char === '"') {
      const start = index
      index += 1
      let value = ''
      let closed = false
      while (index < input.length) {
        const current = input[index]
        if (current === undefined) {
          break
        }
        if (current === '\\') {
          const next = input[index + 1]
          if (next === undefined) {
            throw new ParseError('Unclosed quote', start)
          }
          value += next
          index += 2
          continue
        }
        if (current === '"') {
          closed = true
          index += 1
          break
        }
        value += current
        index += 1
      }
      if (!closed) {
        throw new ParseError('Unclosed quote', start)
      }
      tokens.push({ type: 'phrase', value, position: start })
      continue
    }
    if (char === '-') {
      tokens.push({ type: 'minus', position: index })
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
    const value = input.slice(start, index)
    const keyword = value.toLowerCase()
    if (keyword === 'or' || keyword === 'and' || keyword === 'not') {
      tokens.push({ type: keyword, position: start })
    } else {
      tokens.push({ type: 'word', value, position: start })
    }
  }
  return tokens
}

function isSpace(char: string): boolean {
  return char === ' ' || char === '\t' || char === '\n' || char === '\r'
}
