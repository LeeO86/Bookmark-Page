<script setup lang="ts">
import { themeStylesheet, type NeutralPalette } from '#shared/theme'
import type { PortalSettings } from './types/portal'

const settings = useState<PortalSettings | null>('portal-settings', () => null)
const themeCss = useState('bp-theme-css', () => '')

watch(
  settings,
  (value) => {
    if (!value) {
      return
    }
    themeCss.value = themeStylesheet(value.accentColour, value.neutralPalette as NeutralPalette)
  },
  { immediate: true },
)

useHead(() => ({
  title: settings.value?.siteTitle || 'Bookmark-Page',
  link: [{ rel: 'icon', href: '/api/v1/favicon' }],
  style: themeCss.value ? [{ id: 'bp-theme', innerHTML: themeCss.value }] : [],
}))
</script>

<template>
  <UApp>
    <NuxtRouteAnnouncer />
    <NuxtPage />
  </UApp>
</template>
