export interface EntryFacets {
  mode: 'disjunctive' | 'filtered'
  tags: Record<string, number>
  state: { online: number; offline: number; unknown: number }
}
