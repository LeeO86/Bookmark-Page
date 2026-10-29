import { z } from 'zod'

export const backupRequestSchema = z.object({
  includeSecrets: z.boolean().default(false),
  passphrase: z.string().min(8).max(500).optional(),
})

export const restoreRequestSchema = z.object({
  mode: z.enum(['replace', 'merge']),
  dryRun: z.boolean().default(true),
  passphrase: z.string().min(8).max(500).optional(),
  archive: z.string().min(1).max(50_000_000),
})

export const csvPreviewSchema = z.object({
  csv: z.string().max(2_000_000),
})

export const csvImportSchema = z.object({
  csv: z.string().max(2_000_000),
  dryRun: z.boolean().default(true),
  confirmDuplicates: z.boolean().default(false),
  mapping: z.object({
    name: z.string().min(1),
    host: z.string().optional(),
    description: z.string().optional(),
    link: z.string().optional(),
    tags: z.string().optional(),
    fields: z.record(z.string(), z.string()).default({}),
  }),
})

export const restorePreviewSchema = z.object({
  entriesCreated: z.number(),
  entriesUpdated: z.number(),
  entriesUnchanged: z.number(),
  entriesDeleted: z.number(),
  warnings: z.array(z.string()),
})

export const csvImportResultSchema = z.object({
  created: z.number(),
  warnings: z.array(z.string()),
  needsConfirmation: z.boolean(),
})
