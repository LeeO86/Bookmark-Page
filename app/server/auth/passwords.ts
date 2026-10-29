import { hash, verify } from '@node-rs/argon2'

// Argon2id is the library default. The const enum cannot be imported under verbatimModuleSyntax.
const options = {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
}

export const minimumPasswordLength = 8

export async function hashPassword(password: string): Promise<string> {
  return hash(password, options)
}

export async function verifyPassword(encoded: string, password: string): Promise<boolean> {
  return verify(encoded, password, options)
}
