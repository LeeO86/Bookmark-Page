import { v7 as uuidv7 } from 'uuid'

export function newId(): string {
  return uuidv7()
}

export function now(): Date {
  return new Date()
}
