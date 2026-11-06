<script setup lang="ts">
const collapsed = ref<string[]>([])
const { sections, stateTags, selected, addTag } = useSidebarFacets()
function toggle(id: string) {
  collapsed.value = collapsed.value.includes(id)
    ? collapsed.value.filter((item) => item !== id)
    : [...collapsed.value, id]
}
</script>

<template>
  <div class="text-sm">
    <p v-if="stateTags.length === 0 && sections.length === 0" class="text-xs text-muted">
      No tags in this view.
    </p>
    <section v-if="stateTags.length > 0" class="mb-3">
      <p class="flex items-center gap-2 font-medium">
        <span class="inline-block size-2 rounded-full bg-primary" />
        State
      </p>
      <ul class="mt-1 space-y-0.5 pl-4">
        <li v-for="tag in stateTags" :key="tag.token">
          <button
            type="button"
            class="flex w-full items-center justify-between rounded px-1 py-0.5 text-left hover:bg-elevated"
            :class="selected(tag.token) ? 'bg-primary/15 font-medium' : ''"
            :aria-pressed="selected(tag.token)"
            :title="`${tag.token}. Click to switch or remove; Shift for OR, Alt for NOT`"
            @click="addTag($event, tag.token)"
          >
            <span class="flex min-w-0 items-center gap-2">
              <span class="status-mark size-2 rounded-full" :class="tag.mark" />
              <span class="truncate">{{ tag.title }}</span>
            </span>
            <span class="text-xs text-muted">{{ tag.count }}</span>
          </button>
        </li>
      </ul>
    </section>
    <section v-for="section in sections" :key="section.id" class="mb-3">
      <button
        type="button"
        class="flex w-full items-center gap-2 text-left font-medium"
        :aria-expanded="!collapsed.includes(section.id)"
        @click="toggle(section.id)"
      >
        <span
          class="inline-block size-2 rounded-full bg-primary"
          :style="section.colour ? { background: section.colour } : undefined"
        />
        {{ section.label }}
      </button>
      <ul v-show="!collapsed.includes(section.id)" class="mt-1 space-y-0.5 pl-4">
        <li v-for="tag in section.tags" :key="tag.token">
          <button
            type="button"
            class="flex w-full items-center justify-between rounded px-1 py-0.5 text-left hover:bg-elevated"
            :class="selected(tag.token) ? 'bg-primary/15 font-medium' : ''"
            :aria-pressed="selected(tag.token)"
            :title="`${tag.token}. Click to switch or remove; Shift for OR, Alt for NOT`"
            @click="addTag($event, tag.token)"
          >
            <span class="truncate">{{ tag.title }}</span>
            <span class="text-xs text-muted">{{ tag.count }}</span>
          </button>
        </li>
      </ul>
    </section>
  </div>
</template>
