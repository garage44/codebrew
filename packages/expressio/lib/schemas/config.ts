import {z} from 'zod'

/**
 * Enola engine configuration schema
 */
export const EnolaEngineConfigSchema = z.object({
    api_key: z.string().optional(),
    base_url: z.string().optional(),
})

/**
 * Enola engines configuration schema
 */
export const EnolaEnginesConfigSchema = z.record(z.string(), EnolaEngineConfigSchema)

/**
 * Enola configuration schema (request body for POST /api/config)
 */
export const EnolaConfigRequestSchema = z.object({
    engines: EnolaEnginesConfigSchema,
})

/**
 * Workspace description schema
 */
export const WorkspaceDescriptionSchema = z.object({
    source_file: z.string().optional(),
    workspace_id: z.string().min(1),
})

/**
 * Update config request schema
 */
export const UpdateConfigRequestSchema = z.object({
    enola: EnolaConfigRequestSchema,
    language_ui: z.string().min(1),
    workspaces: z.array(WorkspaceDescriptionSchema),
})

export type UpdateConfigRequest = z.infer<typeof UpdateConfigRequestSchema>

/**
 * Enola engine response schema (may not include api_key/base_url for non-admin)
 */
export const EnolaEngineResponseSchema = z.object({
    active: z.boolean(),
    api_key: z.string().optional(),
    base_url: z.string().optional(),
    name: z.string(),
    usage: z.object({
        count: z.number(),
        limit: z.number(),
    }),
})

/**
 * Enola engines response schema
 */
export const EnolaEnginesResponseSchema = z.record(z.string(), EnolaEngineResponseSchema)

/**
 * Language source schema
 */
export const LanguageSourceSchema = z.object({
    id: z.string(),
    name: z.string(),
})

/**
 * Language target schema
 */
export const LanguageTargetSchema = z.object({
    formality: z.boolean(),
    id: z.string(),
    name: z.string(),
})

/**
 * Enola languages schema
 */
export const EnolaLanguagesSchema = z.object({
    source: z.array(LanguageSourceSchema),
    target: z.array(LanguageTargetSchema),
})

/**
 * Enola config response schema
 */
export const EnolaConfigResponseSchema = z.object({
    engines: EnolaEnginesResponseSchema,
    languages: EnolaLanguagesSchema,
})

/**
 * Workspace description response schema
 */
export const WorkspaceDescriptionResponseSchema = z.object({
    source_file: z.string().nullable(),
    workspace_id: z.string().min(1),
})

/**
 * Get config response schema
 */
export const GetConfigResponseSchema = z.object({
    enola: EnolaConfigResponseSchema,
    language_ui: z.string(),
    workspaces: z.array(WorkspaceDescriptionResponseSchema),
})

/**
 * Update config response schema (same as get config)
 */
export const UpdateConfigResponseSchema = GetConfigResponseSchema

export type GetConfigResponse = z.infer<typeof GetConfigResponseSchema>
export type UpdateConfigResponse = z.infer<typeof UpdateConfigResponseSchema>
export type WorkspaceDescription = z.infer<typeof WorkspaceDescriptionSchema>
