import { queryHasTerm, toggleSidebarQueryTerm } from '#shared/query-chips'
import { plainTagColour } from '#shared/theme'

export function useSidebarFacets() {
  const portal = usePortal()
  const selected = (token: string) => queryHasTerm(portal.queryText.value, token)
  const counts = computed(() => {
    if (portal.entryFacets.value) return new Map(Object.entries(portal.entryFacets.value.tags))
    const result = new Map<string, number>()
    for (const entry of portal.entries.value)
      for (const tag of entry.tags) {
        const token = tag.namespace ? tag.label : '#' + tag.value
        result.set(token, (result.get(token) ?? 0) + 1)
      }
    return result
  })
  const selectedFirst = <T extends { token: string }>(values: T[]) =>
    values.sort((left, right) => Number(selected(right.token)) - Number(selected(left.token)))
  const stateTags = computed(() => {
    const state = portal.entryFacets.value?.state ?? {
      online: portal.entries.value.filter((entry) => entry.status === 'up').length,
      offline: portal.entries.value.filter((entry) => entry.status === 'down').length,
      unknown: portal.entries.value.filter((entry) => entry.status === 'unknown').length,
    }
    return selectedFirst(
      [
        { token: 'state:online', title: 'Online', count: state.online, mark: 'status-up' },
        { token: 'state:offline', title: 'Offline', count: state.offline, mark: 'status-down' },
        { token: 'state:unknown', title: 'Unknown', count: state.unknown, mark: 'status-unknown' },
      ].filter((tag) => tag.count > 0 || selected(tag.token)),
    )
  })
  const sections = computed(() => {
    const groups = [...portal.namespaces.value]
      .filter((namespace) => namespace.showInSidebar)
      .sort((left, right) => left.sort - right.sort || left.label.localeCompare(right.label))
      .map((namespace) => ({
        id: namespace.id,
        label: namespace.label,
        colour: namespace.colour,
        tags: portal.tags.value
          .filter((tag) => tag.namespace === namespace.name)
          .map((tag) => ({
            token: tag.label,
            title: tag.displayLabel || tag.value,
            count: counts.value.get(tag.label) ?? 0,
          })),
      }))
    groups.push({
      id: 'plain',
      label: 'Tags',
      colour: plainTagColour,
      tags: portal.tags.value
        .filter((tag) => tag.namespace === null)
        .map((tag) => ({
          token: '#' + tag.value,
          title: tag.displayLabel || tag.value,
          count: counts.value.get('#' + tag.value) ?? 0,
        })),
    })
    return groups
      .map((group) => ({
        ...group,
        tags: selectedFirst(
          group.tags
            .filter((tag) => tag.count > 0 || selected(tag.token))
            .sort((left, right) => left.title.localeCompare(right.title)),
        ),
      }))
      .filter((group) => group.tags.length > 0)
  })
  async function addTag(event: MouseEvent, token: string) {
    await portal.setQuery(
      toggleSidebarQueryTerm(
        portal.queryText.value,
        token,
        event.altKey ? 'not' : event.shiftKey ? 'or' : 'and',
      ),
    )
  }
  return { sections, stateTags, selected, addTag }
}
