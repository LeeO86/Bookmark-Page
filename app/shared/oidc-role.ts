import { z } from 'zod'

/** Saved only on user records exposed through the admin user API and backups. */
export const oidcRoleDiagnosticsSchema = z.object({
  issuer: z.string(),
  subject: z.string(),
  claim: z.string(),
  values: z.array(z.string()),
  matched: z.boolean(),
  ignoredNonStringValues: z.boolean(),
  truncated: z.boolean(),
  receivedAt: z.string(),
})
export type OidcRoleDiagnostics = z.infer<typeof oidcRoleDiagnosticsSchema>
