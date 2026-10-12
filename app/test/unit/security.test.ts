import { describe, expect, it } from 'vitest'
import { contentSecurityPolicyFor, inlineScriptHashes } from '../../server/http/security'

describe('content security policy', () => {
  it('allows the exact inline boot scripts with hashes', () => {
    const html =
      '<script type="importmap">{"imports":{}}</script><script src="/app.js"></script><script>window.__NUXT__={}</script>'
    const hashes = inlineScriptHashes(html)
    expect(hashes).toHaveLength(2)
    const policy = contentSecurityPolicyFor(html)
    expect(policy).toContain("script-src 'self'")
    expect(policy).toContain(hashes[0] ?? '')
    expect(policy).toContain(hashes[1] ?? '')
    expect(policy).not.toContain('unsafe-eval')
    expect(contentSecurityPolicyFor(html, true)).toContain('unsafe-eval')
  })
})
