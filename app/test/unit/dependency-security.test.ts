import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { expect, it } from 'vitest'

it('blocks prototype poisoning in the patched build dependency without changing ordinary merges', () => {
  // pnpm's hoisted link is the patched transitive dependency used by Rollup.
  const resolve = createRequire(import.meta.url)
  const merge = resolve(
    fileURLToPath(new URL('../../../node_modules/.pnpm/node_modules/deepmerge', import.meta.url)),
  ) as (target: object, source: object) => Record<string, unknown>
  const attack: object = JSON.parse(
    '{"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}}}',
  )
  const result = merge(Object.create(null) as object, attack)
  expect(Object.getPrototypeOf(result)).toBe(Object.prototype)
  expect(result.polluted).toBeUndefined()
  expect(Object.hasOwn(result, 'constructor')).toBe(false)
  expect(merge(attack, {}).polluted).toBeUndefined()
  expect(merge({ nested: { left: 1 } }, { nested: { right: 2 } })).toEqual({
    nested: { left: 1, right: 2 },
  })
})
