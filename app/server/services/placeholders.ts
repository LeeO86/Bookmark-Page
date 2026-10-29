const placeholderPattern = /\{\{\s*([A-Za-z0-9_.]+)\s*\}\}/g

export class PlaceholderError extends Error {
  constructor(readonly placeholder: string) {
    super(`Unknown placeholder {{${placeholder}}}`)
  }
}

export function assertKnownPlaceholders(template: string, allowInput: boolean): void {
  for (const match of template.matchAll(placeholderPattern)) {
    const key = match[1]
    if (!key || !knownPlaceholder(key, allowInput)) {
      throw new PlaceholderError(key ?? '')
    }
  }
}

export function resolvePlaceholders(
  template: string,
  context: {
    host: string | null
    name: string
    fields: Record<string, string>
    inputs: Record<string, string>
  },
): string {
  return template.replace(placeholderPattern, (_match, key: string) => {
    if (key === 'host') {
      if (!context.host) {
        throw new PlaceholderError('host')
      }
      return context.host
    }
    if (key === 'entry.name') {
      return context.name
    }
    if (key.startsWith('field.')) {
      const value = context.fields[key.slice('field.'.length)]
      if (value === undefined) {
        throw new PlaceholderError(key)
      }
      return value
    }
    if (key.startsWith('input.')) {
      const value = context.inputs[key.slice('input.'.length)]
      if (value === undefined) {
        throw new PlaceholderError(key)
      }
      return value
    }
    throw new PlaceholderError(key)
  })
}

export function redactSecretValues(text: string, secrets: readonly string[]): string {
  let output = text
  for (const secret of secrets) {
    if (secret.length === 0) {
      continue
    }
    output = output.split(secret).join('[redacted]')
  }
  return output
}

export function resolveLinkUrl(
  template: string,
  context: { host: string | null; name: string; fields: Record<string, string> },
  secretFields: ReadonlySet<string>,
): { url: string | null; error: string | null } {
  if (templateHasSecret(template, secretFields)) {
    return { url: null, error: 'This link uses a secret field and is resolved only on the server' }
  }
  try {
    const url = template.replace(placeholderPattern, (match, key: string) => {
      if (key === 'host') {
        if (!context.host) {
          throw new PlaceholderError('host')
        }
        return context.host
      }
      if (key === 'entry.name') {
        return context.name
      }
      if (key.startsWith('field.')) {
        const fieldKey = key.slice('field.'.length)
        const value = context.fields[fieldKey]
        if (value === undefined) {
          throw new PlaceholderError(key)
        }
        return value
      }
      if (key.startsWith('input.')) {
        return match
      }
      throw new PlaceholderError(key)
    })
    return { url, error: null }
  } catch (error) {
    if (error instanceof PlaceholderError) {
      return { url: null, error: error.message }
    }
    throw error
  }
}

function templateHasSecret(template: string, secretFields: ReadonlySet<string>): boolean {
  for (const match of template.matchAll(placeholderPattern)) {
    const key = match[1]
    if (key?.startsWith('field.') && secretFields.has(key.slice('field.'.length))) {
      return true
    }
  }
  return false
}

function knownPlaceholder(key: string, allowInput: boolean): boolean {
  if (key === 'host' || key === 'entry.name') {
    return true
  }
  if (key.startsWith('field.') && key.length > 'field.'.length) {
    return true
  }
  return allowInput && key.startsWith('input.') && key.length > 'input.'.length
}
