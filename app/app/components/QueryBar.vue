<script setup lang="ts">
import {
  applySuggestion,
  queryChips,
  removeQueryChip,
  suggestionToken,
  suggestQuery,
} from '#shared/query-chips'

const portal = usePortal()
const input = ref<HTMLInputElement | null>(null)
const highlight = ref(0)

const parsed = computed(() => queryChips(portal.queryText.value))
const token = computed(() => suggestionToken(portal.queryText.value))
const suggestions = computed(() =>
  suggestQuery(
    token.value,
    portal.tags.value.map((tag) => tag.label),
    portal.fields.value
      .filter((field) => field.type !== 'secret' && field.searchable)
      .map((field) => field.key),
  ),
)

watch(suggestions, (items) => {
  highlight.value = 0
  if (import.meta.client) {
    portal.suggestionsOpen.value = items.length > 0 && document.activeElement === input.value
  }
})

function chipColour(kind: string): string {
  if (kind === 'is') {
    return '#0369a1'
  }
  if (kind === 'has') {
    return '#6d28d9'
  }
  if (kind === 'group') {
    return '#b45309'
  }
  if (kind === 'text') {
    return '#475569'
  }
  return '#64748b'
}

function colour(text: string): string | undefined {
  const term = text.replace(/^(?:NOT\s+|-\s*)/i, '')
  const name = term.split(':')[0]
  if (!name || !term.includes(':')) {
    return undefined
  }
  return portal.namespaces.value.find((namespace) => namespace.name === name)?.colour
}

async function onInput(event: Event) {
  const value = (event.target as HTMLInputElement).value
  await portal.setQuery(value)
  portal.suggestionsOpen.value = suggestions.value.length > 0
}

async function choose(suggestion: string) {
  const next = applySuggestion(portal.queryText.value, suggestion)
  await portal.setQuery(next)
  portal.suggestionsOpen.value = false
  input.value?.focus()
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowDown' && suggestions.value.length > 0) {
    event.preventDefault()
    event.stopPropagation()
    highlight.value = (highlight.value + 1) % suggestions.value.length
    portal.suggestionsOpen.value = true
    return
  }
  if (event.key === 'ArrowUp' && suggestions.value.length > 0) {
    event.preventDefault()
    event.stopPropagation()
    highlight.value = (highlight.value - 1 + suggestions.value.length) % suggestions.value.length
    portal.suggestionsOpen.value = true
    return
  }
  if (event.key === 'Enter' && portal.suggestionsOpen.value) {
    event.preventDefault()
    event.stopPropagation()
    const suggestion = suggestions.value[highlight.value]
    if (suggestion) {
      void choose(suggestion)
    }
    return
  }
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    if (portal.suggestionsOpen.value) {
      portal.suggestionsOpen.value = false
      return
    }
    void portal.setQuery('')
  }
}

function onFocus() {
  portal.suggestionsOpen.value = suggestions.value.length > 0
}

function onBlur() {
  window.setTimeout(() => {
    portal.suggestionsOpen.value = false
  }, 150)
}

defineExpose({ focus: () => input.value?.focus() })
</script>

<template>
  <div class="relative min-w-0 flex-1">
    <label class="sr-only" for="portal-query">Query</label>
    <input
      id="portal-query"
      ref="input"
      data-testid="query-input"
      :value="portal.queryText.value"
      class="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-sm outline-none focus:border-[var(--portal-accent)] dark:border-slate-600 dark:bg-slate-900"
      placeholder="Query, or press /"
      autocomplete="off"
      @input="onInput"
      @keydown="onKeydown"
      @focus="onFocus"
      @blur="onBlur"
    />
    <p v-if="parsed.error" class="mt-1 text-xs text-red-600">{{ parsed.error.message }}</p>
    <div v-if="parsed.chips.length > 0" class="mt-1 flex flex-wrap gap-1">
      <span
        v-for="(chip, index) in parsed.chips"
        :key="`${chip.start}-${chip.text}`"
        class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs text-white"
        :style="{ background: colour(chip.text) ?? chipColour(chip.kind) }"
      >
        <span v-if="index > 0 && chip.join === 'or'" class="opacity-80">OR</span>
        {{ chip.text }}
        <button
          type="button"
          class="rounded px-0.5 hover:bg-black/20"
          :aria-label="`Remove ${chip.text}`"
          @click="portal.setQuery(removeQueryChip(portal.queryText.value, index))"
        >
          ×
        </button>
      </span>
    </div>
    <ul
      v-if="portal.suggestionsOpen.value && suggestions.length > 0"
      class="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-md border border-slate-200 bg-white text-sm shadow dark:border-slate-700 dark:bg-slate-900"
    >
      <li v-for="(suggestion, index) in suggestions" :key="suggestion">
        <button
          type="button"
          class="block w-full px-2 py-1 text-left hover:bg-slate-100 dark:hover:bg-slate-800"
          :class="index === highlight ? 'bg-slate-100 dark:bg-slate-800' : ''"
          @mousedown.prevent="choose(suggestion)"
        >
          {{ suggestion }}
        </button>
      </li>
    </ul>
  </div>
</template>
