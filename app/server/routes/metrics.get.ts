import { defineEventHandler, getRequestHeader, setResponseStatus } from 'nuxt/server'
import { metricsAllowed, renderMetrics } from '../metrics'

export default defineEventHandler((event) => {
  if (!metricsAllowed(getRequestHeader(event, 'authorization'))) {
    setResponseStatus(event, 401)
    return { error: { code: 'unauthorized', message: 'Metrics token is required' } }
  }
  event.res.headers.set('content-type', 'text/plain; version=0.0.4; charset=utf-8')
  return renderMetrics()
})
