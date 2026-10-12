<script setup lang="ts">
const portal = usePortal()
const route = useRoute()
const links = [
  { to: '/', label: 'Portal' },
  { to: '/admin', label: 'Settings' },
  { to: '/admin/users', label: 'Users' },
  { to: '/admin/auth', label: 'Auth status' },
  { to: '/admin/fields', label: 'Fields' },
  { to: '/admin/namespaces', label: 'Namespaces' },
  { to: '/admin/tokens', label: 'API tokens' },
  { to: '/admin/scopes', label: 'Ansible scopes' },
  { to: '/admin/icons', label: 'Icons' },
  { to: '/admin/actions', label: 'Action templates' },
  { to: '/admin/backup', label: 'Backup' },
  { to: '/admin/csv', label: 'CSV import' },
  { to: '/admin/audit', label: 'Audit log' },
]

onMounted(() => {
  void portal.load()
})
</script>

<template>
  <UDashboardGroup class="h-dvh">
    <UDashboardSidebar
      id="admin"
      collapsible
      resizable
      :default-size="16"
      :min-size="12"
      :max-size="28"
    >
      <template #header="{ collapsed }">
        <span v-if="!collapsed" class="font-semibold">Admin</span>
      </template>
      <nav aria-label="Admin sections" class="space-y-1 text-sm">
        <NuxtLink
          v-for="link in links"
          :key="link.to"
          :to="link.to"
          class="block rounded px-2 py-1 hover:bg-elevated"
          active-class=""
          exact-active-class="bg-primary text-inverted"
          :aria-current="route.path === link.to ? 'page' : undefined"
        >
          {{ link.label }}
        </NuxtLink>
      </nav>
    </UDashboardSidebar>
    <UDashboardPanel id="admin-panel">
      <nav
        aria-label="Admin sections"
        class="flex gap-2 overflow-x-auto border-b border-default p-2 lg:hidden"
      >
        <NuxtLink
          v-for="link in links"
          :key="`compact-${link.to}`"
          :to="link.to"
          class="shrink-0 rounded px-2 py-1 text-sm hover:bg-elevated"
          exact-active-class="bg-primary text-inverted"
        >
          {{ link.label }}
        </NuxtLink>
      </nav>
      <slot />
    </UDashboardPanel>
  </UDashboardGroup>
</template>
