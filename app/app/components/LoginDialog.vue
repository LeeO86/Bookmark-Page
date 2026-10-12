<script setup lang="ts">
const portal = usePortal()
const username = ref('')
const password = ref('')
const error = ref('')

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
      <form
        v-if="portal.authOptions.value.localLoginEnabled"
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
      <a
        v-if="portal.authOptions.value.oidcEnabled"
        href="/api/v1/auth/oidc/start"
        class="mt-3 inline-block text-sm underline"
      >
        Sign in with OpenID
      </a>
    </template>
  </UModal>
</template>
