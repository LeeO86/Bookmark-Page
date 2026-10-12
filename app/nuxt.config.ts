// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2026-10-11',
  devtools: { enabled: true },
  modules: ['@nuxt/ui', '@nuxt/fonts', '@nuxt/eslint'],
  fonts: {
    families: [{ name: 'Inter Variable', provider: 'npm', global: true }],
  },
  css: ['~/assets/css/main.css'],
  typescript: {
    strict: true,
  },
  nitro: {
    externals: {
      external: ['better-sqlite3', '@node-rs/argon2'],
    },
  },
  vite: {
    optimizeDeps: {
      exclude: ['better-sqlite3'],
    },
  },
  eslint: {
    config: {
      stylistic: false,
    },
  },
  colorMode: {
    preference: 'system',
    fallback: 'light',
    classSuffix: '',
    storageKey: 'bp-color-mode',
  },
})
