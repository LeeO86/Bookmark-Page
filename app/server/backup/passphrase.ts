import { createCipheriv, createDecipheriv, pbkdf2Sync, randomBytes } from 'node:crypto'
import { badRequest } from '../http/errors'

const iterations = 600_000
const ivLength = 12
const tagLength = 16
const checkText = 'bookmark-page'

export interface PassphraseHeader {
  kdf: 'pbkdf2-sha256'
  iterations: number
  salt: string
  check: string
}

export function protectSecrets(passphrase: string): { key: Buffer; header: PassphraseHeader } {
  const salt = randomBytes(16)
  const key = pbkdf2Sync(passphrase, salt, iterations, 32, 'sha256')
  return {
    key,
    header: {
      kdf: 'pbkdf2-sha256',
      iterations,
      salt: salt.toString('base64'),
      check: sealString(checkText, key),
    },
  }
}

export function openSecrets(header: PassphraseHeader, passphrase: string): Buffer {
  if (header.kdf !== 'pbkdf2-sha256' || header.iterations < 100_000) {
    throw badRequest('This backup uses an unsupported passphrase format')
  }
  const key = pbkdf2Sync(
    passphrase,
    Buffer.from(header.salt, 'base64'),
    header.iterations,
    32,
    'sha256',
  )
  try {
    if (openString(header.check, key) !== checkText) {
      throw new Error('check mismatch')
    }
  } catch {
    throw badRequest('Passphrase does not match this backup')
  }
  return key
}

export function sealString(plaintext: string, key: Buffer): string {
  const iv = randomBytes(ivLength)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64')
}

export function openString(encoded: string, key: Buffer): string {
  const payload = Buffer.from(encoded, 'base64')
  if (payload.length < ivLength + tagLength) {
    throw new Error('Sealed value is invalid')
  }
  const iv = payload.subarray(0, ivLength)
  const tag = payload.subarray(ivLength, ivLength + tagLength)
  const ciphertext = payload.subarray(ivLength + tagLength)
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
}
