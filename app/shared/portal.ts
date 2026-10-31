/** Select only a view present in the caller's visible catalogue. */
export function initialPortalFilter<T extends { id: string; ownerUserId: string | null }>(
  filters: readonly T[],
  requested: string,
  allVisible: boolean,
): T | null {
  return (
    filters.find((filter) => filter.id === requested) ??
    (allVisible ? null : (filters.find((filter) => filter.ownerUserId === null) ?? null))
  )
}
