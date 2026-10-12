import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { getSecretKey } from './keys'

const ivLength = 12
const tagLength = 16

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(ivLength)
  const cipher = createCipheriv('aes-256-gcm', getSecretKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, ciphertext]).toString('base64')
}

export function decryptSecret(encoded: string): string {
  const payload = Buffer.from(encoded, 'base64')
  if (payload.length < ivLength + tagLength) {
    throw new Error('Secret payload is invalid')
  }
  const iv = payload.subarray(0, ivLength)
  const tag = payload.subarray(ivLength, ivLength + tagLength)
  const ciphertext = payload.subarray(ivLength + tagLength)
  const decipher = createDecipheriv('aes-256-gcm', getSecretKey(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
}
