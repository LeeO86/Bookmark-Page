const secretNames = new Set([
  'password',
  'passwordhash',
  'token',
  'tokenhash',
  'valuesecret',
  'authorization',
  'cookie',
  'secret',
])

export function redact(value: unknown, secretFieldKeys: ReadonlySet<string> = new Set()): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redact(item, secretFieldKeys))
  }
  if (value !== null && typeof value === 'object') {
    const output: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value)) {
      if (secretNames.has(key.toLowerCase())) {
        output[key] = '[redacted]'
        continue
      }
      if (key === 'fields' && Array.isArray(item)) {
        output[key] = item.map((field) => redactField(field, secretFieldKeys))
        continue
      }
      if (
        key === 'value' &&
        secretFieldKeys.size > 0 &&
        outputHasSecretKey(value, secretFieldKeys)
      ) {
        output[key] = '[redacted]'
        continue
      }
      output[key] = redact(item, secretFieldKeys)
    }
    return output
  }
  return value
}

function redactField(field: unknown, secretFieldKeys: ReadonlySet<string>): unknown {
  if (field === null || typeof field !== 'object' || !('key' in field)) {
    return redact(field, secretFieldKeys)
  }
  const key = field.key
  if (typeof key === 'string' && secretFieldKeys.has(key)) {
    return { ...field, value: '[redacted]' }
  }
  return redact(field, secretFieldKeys)
}

function outputHasSecretKey(value: object, secretFieldKeys: ReadonlySet<string>): boolean {
  if (!('key' in value)) {
    return false
  }
  const key = value.key
  return typeof key === 'string' && secretFieldKeys.has(key)
}
