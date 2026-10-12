<script setup lang="ts">
const settings = useState<{
  siteTitle?: string
  faviconColour?: string
  accentColour?: string
} | null>('portal-settings', () => null)

useHead(() => {
  const colour = /^#[0-9a-fA-F]{6}$/.test(settings.value?.faviconColour ?? '')
    ? (settings.value?.faviconColour ?? '#0f766e')
    : '#0f766e'
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="${colour}"/></svg>`
  return {
    title: settings.value?.siteTitle || 'Bookmark-Page',
    link: [{ rel: 'icon', href: `data:image/svg+xml,${encodeURIComponent(svg)}` }],
  }
})
</script>

<template>
  <UApp>
    <NuxtRouteAnnouncer />
    <NuxtPage />
  </UApp>
</template>

<style>
:focus-visible {
  outline: 2px solid #0f766e;
  outline-offset: 2px;
}
</style>
