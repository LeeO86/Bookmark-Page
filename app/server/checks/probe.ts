import { spawn } from 'node:child_process'
import { connect } from 'node:net'
import { limitedRequest } from '../http/limited'
import { expectationMet, type Expectation } from './expect'

export interface ProbeResult {
  state: 'up' | 'down' | 'unknown'
  latencyMs: number | null
  message: string
}

let icmpState: 'unknown' | 'yes' | 'no' = 'unknown'

export function icmpAvailable(): boolean {
  return icmpState === 'yes'
}

export async function detectIcmp(): Promise<void> {
  const result = await probeIcmp('127.0.0.1', 1000)
  if (result.message.startsWith('ICMP is unavailable')) {
    icmpState = 'no'
    console.error(result.message)
    return
  }
  icmpState = 'yes'
}

export function probeTcp(host: string, port: number, timeoutMs: number): Promise<ProbeResult> {
  if (!safeHost(host)) {
    return Promise.resolve({ state: 'unknown', latencyMs: null, message: 'Check host is invalid' })
  }
  return new Promise((resolve) => {
    const started = Date.now()
    const socket = connect({ host, port, timeout: timeoutMs })
    const finish = (result: ProbeResult) => {
      socket.destroy()
      resolve(result)
    }
    socket.once('connect', () => {
      finish({ state: 'up', latencyMs: Date.now() - started, message: 'Connected' })
    })
    socket.once('timeout', () => {
      finish({ state: 'down', latencyMs: Date.now() - started, message: 'Timed out' })
    })
    socket.once('error', (error) => {
      finish({ state: 'down', latencyMs: Date.now() - started, message: error.message })
    })
  })
}

export async function probeHttp(
  url: string,
  expectation: Expectation,
  tlsVerify: boolean,
  timeoutMs: number,
  method = 'GET',
  body: string | null = null,
): Promise<ProbeResult> {
  const started = Date.now()
  try {
    const response = await limitedRequest(url, {
      method,
      body,
      timeoutMs,
      maxBytes: 65_536,
      maxRedirects: 3,
      tlsVerify,
    })
    const verdict = expectationMet(response.status, response.body.toString('utf8'), expectation)
    return {
      state: verdict.ok ? 'up' : 'down',
      latencyMs: Date.now() - started,
      message: verdict.message,
    }
  } catch (error) {
    return {
      state: 'down',
      latencyMs: Date.now() - started,
      message: error instanceof Error ? error.message : 'HTTP check failed',
    }
  }
}

export function probeIcmp(host: string, timeoutMs: number): Promise<ProbeResult> {
  if (icmpState === 'no') {
    return Promise.resolve(icmpUnavailable())
  }
  if (!safeHost(host)) {
    return Promise.resolve({ state: 'unknown', latencyMs: null, message: 'Check host is invalid' })
  }
  const seconds = Math.max(1, Math.ceil(timeoutMs / 1000))
  return new Promise((resolve) => {
    const started = Date.now()
    const child = spawn('ping', ['-c', '1', '-W', String(seconds), host], {
      timeout: timeoutMs + 500,
    })
    let stderr = ''
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8')
    })
    child.on('error', (error) => {
      if (error.message.includes('ENOENT')) {
        icmpState = 'no'
        resolve(icmpUnavailable())
        return
      }
      resolve({ state: 'down', latencyMs: Date.now() - started, message: error.message })
    })
    child.on('close', (code) => {
      const detail = stderr.trim()
      if (code === 0) {
        icmpState = 'yes'
        resolve({ state: 'up', latencyMs: Date.now() - started, message: 'ICMP echo received' })
        return
      }
      if (/operation not permitted|permission denied|cap_net_raw|socktype/i.test(detail)) {
        icmpState = 'no'
        resolve(icmpUnavailable())
        return
      }
      resolve({
        state: 'down',
        latencyMs: Date.now() - started,
        message: detail || 'No ICMP echo',
      })
    })
  })
}

export function icmpUnavailable(): ProbeResult {
  return {
    state: 'unknown',
    latencyMs: null,
    message: 'ICMP is unavailable because the server cannot open raw sockets (CAP_NET_RAW).',
  }
}

function safeHost(host: string): boolean {
  return /^[A-Za-z0-9.:%-]+$/.test(host) && !host.startsWith('-')
}
