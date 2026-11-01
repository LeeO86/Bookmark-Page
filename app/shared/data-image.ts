export const inlineImageTypes = [
  'image/svg+xml',
  'image/png',
  'image/webp',
  'image/x-icon',
  'image/vnd.microsoft.icon',
] as const

/** Decode locally: a data URI must never enter the HTTP client. */
export function decodeDataImage(
  value: string,
  maxBytes = 512 * 1024,
): {
  mediaType: string
  bytes: Uint8Array
} {
  if (value.length > maxBytes * 4 + 256) throw new Error('Inline favicon exceeds the size limit')
  const match = /^data:([^,]*),(.*)$/is.exec(value)
  if (!match) throw new Error('Invalid inline favicon')
  const parts = match[1]!.toLowerCase().split(';')
  const mediaType = parts.shift() ?? ''
  if (!(inlineImageTypes as readonly string[]).includes(mediaType)) {
    throw new Error('Unsupported inline favicon media type')
  }
  const payload = match[2]!
  let bytes: Uint8Array
  if (parts.includes('base64')) {
    let encoded: string
    try {
      encoded = decodeURIComponent(payload)
    } catch {
      throw new Error('Invalid inline favicon encoding')
    }
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) {
      throw new Error('Invalid inline favicon Base64')
    }
    const decoded = atob(encoded)
    bytes = Uint8Array.from(decoded, (char) => char.charCodeAt(0))
  } else {
    if (/%(?![0-9a-f]{2})/i.test(payload)) throw new Error('Invalid inline favicon encoding')
    const output: number[] = []
    for (const part of payload.matchAll(/%([0-9a-f]{2})|([^%]+)/gi)) {
      if (part[1]) output.push(Number.parseInt(part[1], 16))
      else for (const byte of new TextEncoder().encode(part[2]!)) output.push(byte)
      if (output.length > maxBytes) throw new Error('Inline favicon exceeds the size limit')
    }
    bytes = Uint8Array.from(output)
  }
  if (!bytes.length || bytes.length > maxBytes)
    throw new Error('Inline favicon is empty or exceeds the size limit')
  const text = new TextDecoder().decode(bytes.subarray(0, 1024))
  const valid =
    mediaType === 'image/svg+xml'
      ? /<svg(?:\s|>)/i.test(text)
      : mediaType === 'image/png'
        ? bytes.length > 8 &&
          [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte)
        : mediaType === 'image/webp'
          ? bytes.length > 12 && text.startsWith('RIFF') && text.slice(8, 12) === 'WEBP'
          : bytes.length > 4 &&
            bytes[0] === 0 &&
            bytes[1] === 0 &&
            (bytes[2] === 1 || bytes[2] === 2) &&
            bytes[3] === 0
  if (!valid) throw new Error('Inline favicon content does not match its media type')
  return { mediaType, bytes }
}
