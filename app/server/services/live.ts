export interface LiveEvent {
  type: 'entries' | 'status'
}

type Listener = (event: LiveEvent) => void

const listeners = new Set<Listener>()

export function publishLive(event: LiveEvent): void {
  for (const listener of listeners) {
    listener(event)
  }
}

export function subscribeLive(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
