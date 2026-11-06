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
const authError = useState<string | null>('portal-auth-error', () => null)

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
    <div
      v-if="authError"
      role="alert"
      class="flex items-center justify-between gap-3 border-b border-error bg-error/10 px-4 py-3 text-sm text-error"
      data-testid="sign-in-error"
    >
      <p>{{ authError }}</p>
      <UButton
        type="button"
        color="error"
        variant="ghost"
        icon="i-lucide-x"
        aria-label="Dismiss sign-in error"
        @click="authError = null"
      />
    </div>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
