<script setup lang="ts">
import {
  themeStylesheet,
  type AccentPreset,
  type BackgroundStyle,
  type NeutralPalette,
} from '#shared/theme'
import type { PortalSettings } from './types/portal'

const settings = useState<PortalSettings | null>('portal-settings', () => null)
const themeCss = useState('bp-theme-css', () => '')

watch(
  settings,
  (value) => {
    if (!value) {
      return
    }
    themeCss.value = themeStylesheet(
      value.accentColour,
      value.neutralPalette as NeutralPalette,
      value.accentPreset as AccentPreset,
      (value.background ?? 'gradient') as BackgroundStyle,
    )
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
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
