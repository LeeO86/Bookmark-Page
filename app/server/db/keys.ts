import { Buffer } from 'node:buffer'

const secretKeyPattern = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)$/
const formatError = 'BOOKMARK_SECRET_KEY must be standard Base64 that decodes to 32 bytes'

let installed: Buffer | undefined

export function decodeSecretKey(value: string | undefined): Buffer {
  if (value === undefined || value.trim() === '') {
    throw new Error('BOOKMARK_SECRET_KEY is required')
  }
  const trimmed = value.trim()
  if (!secretKeyPattern.test(trimmed)) {
    throw new Error(formatError)
  }
  const decoded = Buffer.from(trimmed, 'base64')
  if (decoded.length !== 32 || decoded.toString('base64') !== trimmed) {
    throw new Error(formatError)
  }
  return decoded
}

export function installSecretKey(value: string | undefined): Buffer {
  const decoded = decodeSecretKey(value)
  installed = decoded
  return decoded
}

export function getSecretKey(): Buffer {
  if (!installed) {
    throw new Error('Encryption key is not initialised')
  }
  return installed
}

export function clearSecretKey(): void {
  installed = undefined
}
