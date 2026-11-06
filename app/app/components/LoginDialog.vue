<script setup lang="ts">
const portal = usePortal()
const username = ref('')
const password = ref('')
const error = ref('')
const route = useRoute()
const emergencyOpen = ref(false)
const oidcStart = computed(
  () => '/api/v1/auth/oidc/start?' + new URLSearchParams({ returnTo: route.fullPath }).toString(),
)

async function submit() {
  error.value = ''
  try {
    await portal.login(username.value, password.value)
    username.value = ''
    password.value = ''
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : 'Login failed'
  }
}
</script>

<template>
  <UModal
    v-model:open="portal.loginOpen.value"
    title="Sign in"
    description="Use a local account or your identity provider."
  >
    <template #body>
      <UButton
        v-if="portal.authOptions.value.oidcEnabled"
        :href="oidcStart"
        block
        size="lg"
        class="mb-4"
        data-testid="oidc-sign-in"
      >
        Sign in with {{ portal.authOptions.value.oidcProviderName || 'OpenID' }}
      </UButton>
      <UButton
        v-if="!portal.authOptions.value.localLoginEnabled"
        type="button"
        color="neutral"
        variant="outline"
        block
        class="mb-3"
        :aria-expanded="emergencyOpen"
        @click="emergencyOpen = !emergencyOpen"
      >
        Emergency local sign-in
      </UButton>
      <p
        v-if="!portal.authOptions.value.localLoginEnabled && emergencyOpen"
        class="mb-3 text-sm text-muted"
      >
        Only designated break-glass accounts can sign in locally.
      </p>
      <form
        v-if="portal.authOptions.value.localLoginEnabled || emergencyOpen"
        class="space-y-3"
        @submit.prevent="submit"
      >
        <UFormField label="Username">
          <UInput
            v-model="username"
            autocomplete="username"
            required
            class="w-full"
            data-testid="login-username"
          />
        </UFormField>
        <UFormField label="Password">
          <UInput
            v-model="password"
            type="password"
            autocomplete="current-password"
            required
            class="w-full"
            data-testid="login-password"
          />
        </UFormField>
        <p v-if="error" class="text-sm text-error">{{ error }}</p>
        <UButton type="submit" data-testid="login-submit">Sign in</UButton>
      </form>
    </template>
  </UModal>
</template>
