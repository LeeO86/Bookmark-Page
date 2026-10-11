export interface Expectation {
  status?: string[]
  bodyContains?: string | null
  bodyRegex?: string | null
  jsonPath?: string | null
  equals?: string | null
}

export function expectationMet(
  status: number,
  body: string,
  expectation: Expectation,
): { ok: boolean; message: string } {
  const codes = expectation.status?.length ? expectation.status : ['2xx']
  if (!codes.some((code) => statusMatches(status, code))) {
    return { ok: false, message: `Status ${status} did not match ${codes.join(', ')}` }
  }
  if (expectation.bodyContains && !body.includes(expectation.bodyContains)) {
    return { ok: false, message: 'Response body did not contain the expected text' }
  }
  if (expectation.bodyRegex) {
    try {
      if (!new RegExp(expectation.bodyRegex).test(body)) {
        return { ok: false, message: 'Response body did not match the expected pattern' }
      }
    } catch {
      return { ok: false, message: 'Response pattern is invalid' }
    }
  }
  if (expectation.jsonPath) {
    let parsed: unknown
    try {
      parsed = JSON.parse(body) as unknown
    } catch {
      return { ok: false, message: 'Response body is not JSON' }
    }
    const value = readPath(parsed, expectation.jsonPath)
    if (value === undefined) {
      return { ok: false, message: `JSON path ${expectation.jsonPath} was not found` }
    }
    if (expectation.equals != null && String(value) !== expectation.equals) {
      return { ok: false, message: `JSON path ${expectation.jsonPath} was ${String(value)}` }
    }
  }
  return { ok: true, message: `Status ${status}` }
}

function statusMatches(status: number, expected: string): boolean {
  if (/^[1-5]xx$/i.test(expected)) {
    return Math.floor(status / 100) === Number(expected[0])
  }
  return String(status) === expected
}

function readPath(value: unknown, path: string): unknown {
  let current = value
  for (const part of path.split('.').filter((item) => item.length > 0)) {
    if (Array.isArray(current) && /^\d+$/.test(part)) {
      current = current[Number(part)]
      continue
    }
    if (!current || typeof current !== 'object' || !(part in current)) {
      return undefined
    }
    current = (current as Record<string, unknown>)[part]
  }
  return current
}
