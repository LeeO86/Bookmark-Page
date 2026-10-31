import { describe, expect, it } from 'vitest'
import {
  appendQueryTerm,
  applySuggestion,
  combineQueries,
  queryChips,
  removeQueryChip,
  queryHasTerm,
  toggleQueryTerm,
  suggestQuery,
} from '../../shared/query-chips'

describe('query chips', () => {
  it('splits terms, joins, and negation', () => {
    expect(queryChips('type:audio room:studio1').chips.map((chip) => chip.text)).toEqual([
      'type:audio',
      'room:studio1',
    ])
    const orQuery = queryChips('type:audio OR room:studio1')
    expect(orQuery.chips.map((chip) => [chip.text, chip.join])).toEqual([
      ['type:audio', 'and'],
      ['room:studio1', 'or'],
    ])
    expect(queryChips('-type:audio').chips[0]).toMatchObject({
      text: '-type:audio',
      negated: true,
      kind: 'tag',
    })
    expect(queryChips('NOT type:audio').chips[0]?.text).toBe('NOT type:audio')
    expect(queryChips('(room:a OR room:b) type:audio').chips.map((chip) => chip.kind)).toEqual([
      'group',
      'tag',
    ])
    expect(queryChips('(a').error?.message).toBeTruthy()
  })

  it('removes a chip and appends AND, OR, and NOT', () => {
    expect(removeQueryChip('type:audio OR room:studio1', 0)).toBe('room:studio1')
    expect(removeQueryChip('type:audio room:studio1', 1)).toBe('type:audio')
    expect(appendQueryTerm('', 'type:audio', 'and')).toBe('type:audio')
    expect(appendQueryTerm('type:audio', 'room:1', 'or')).toBe('type:audio OR room:1')
    expect(appendQueryTerm('type:audio', 'spare', 'not')).toBe('type:audio -spare')
    expect(appendQueryTerm('type:audio', 'studio 1', 'and')).toBe('type:audio "studio 1"')
    expect(combineQueries('a OR b', 'type:audio')).toBe('(a OR b) (type:audio)')
  })

  it('suggests tags and operators from the active token', () => {
    expect(suggestQuery('type:au', ['type:audio', 'type:video'], ['note'])).toEqual(['type:audio'])
    expect(suggestQuery('has:n', [], ['note'])).toEqual(['has:note'])
    expect(applySuggestion('type:au room:1', 'type:audio', 'type:au'.length)).toBe(
      'type:audio room:1',
    )
  })

  it('toggles facets and removes every duplicate without disturbing other filters', () => {
    const token = 'group:Infrastruktur'
    expect(toggleQueryTerm('', token, 'and')).toBe(token)
    expect(toggleQueryTerm(token, token, 'and')).toBe('')
    expect(toggleQueryTerm(`${token} ${token} ${token}`, token, 'and')).toBe('')
    expect(toggleQueryTerm(`${token} room:studio ${token}`, token, 'and')).toBe('room:studio')
    expect(toggleQueryTerm('(group:Infrastruktur OR room:a) type:audio', token, 'and')).toBe(
      'room:a type:audio',
    )
  })

  it('compares parsed quoted values and toggles OR and NOT facets', () => {
    expect(queryHasTerm('group:"Control Room"', 'group:Control Room')).toBe(true)
    expect(toggleQueryTerm('group:"Control Room"', 'group:Control Room', 'and')).toBe('')
    expect(toggleQueryTerm('room:a OR room:b', 'room:b', 'or')).toBe('room:a')
    expect(toggleQueryTerm('NOT room:a -room:a', 'room:a', 'not')).toBe('')
    expect(toggleQueryTerm('room:a', 'room:a', 'not')).toBe('-room:a')
    expect(toggleQueryTerm('-room:a', 'room:a', 'and')).toBe('room:a')
    expect(queryHasTerm('-room:a', 'room:a')).toBe(true)
    expect(queryHasTerm('room:A', 'room:a')).toBe(false)
    expect(toggleQueryTerm('(room:a', 'room:b', 'and')).toBe('(room:a')
    expect(toggleQueryTerm('room:a OR room:b', 'type:audio', 'and')).toBe(
      '(room:a OR room:b) type:audio',
    )
  })
})
