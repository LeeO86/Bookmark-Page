// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2026-10-11',
  devtools: { enabled: true },
  modules: ['@nuxt/ui', '@nuxt/eslint'],
  css: ['~/assets/css/main.css'],
  typescript: {
    strict: true,
  },
  nitro: {
    externals: {
      external: ['better-sqlite3'],
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
})
