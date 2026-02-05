import {z} from 'zod'
import {PathSchema} from './common.ts'
import {WorkspaceIdParamsSchema, WorkspaceIdPathSchema} from './common.ts'

// Re-export for convenience
export {WorkspaceIdParamsSchema, WorkspaceIdPathSchema} from './common.ts'

/**
 * Translation value schema (base structure)
 */
export const TranslationValueSchema = z.object({
    cache: z.string().optional(),
    source: z.string(),
    target: z.record(z.string()),
})

/**
 * Create path request schema
 */
export const CreatePathRequestSchema = z.object({
    path: PathSchema,
    value: TranslationValueSchema,
})

/**
 * Delete path request schema
 */
export const DeletePathRequestSchema = z.object({
    path: z.union([z.string(), PathSchema]),
})

/**
 * Move path request schema
 */
export const MovePathRequestSchema = z.object({
    new_path: PathSchema,
    old_path: PathSchema,
})

/**
 * Collapse path request schema
 */
export const CollapsePathRequestSchema = z.object({
    path: PathSchema,
    tag_modifier: z.boolean().optional(),
    value: z.object({
        _collapsed: z.boolean().optional(),
    }).optional(),
})

/**
 * Update tag request schema
 */
export const UpdateTagRequestSchema = z.object({
    path: PathSchema,
    source: z.string(),
})

/**
 * Translate request schema
 */
export const TranslateRequestSchema = z.object({
    ignore_cache: z.boolean().optional(),
    path: PathSchema,
    value: z.object({
        _soft: z.boolean().optional(),
        source: z.string(),
    }).optional(),
})

/**
 * Translation target result schema
 */
export const TranslationTargetSchema = z.object({
    id: z.string(),
    ref: z.record(z.unknown()),
})

/**
 * Translate response schema
 */
export const TranslateResponseSchema = z.object({
    cached: z.array(z.string()),
    error: z.string().optional(),
    success: z.boolean(),
    targets: z.array(TranslationTargetSchema),
    translations: z.array(z.string()),
})

/**
 * Get translations path parameters schema (HTTP)
 */
export const GetTranslationsParamsSchema = WorkspaceIdPathSchema

export type CreatePathRequest = z.infer<typeof CreatePathRequestSchema>
export type DeletePathRequest = z.infer<typeof DeletePathRequestSchema>
export type MovePathRequest = z.infer<typeof MovePathRequestSchema>
export type CollapsePathRequest = z.infer<typeof CollapsePathRequestSchema>
export type UpdateTagRequest = z.infer<typeof UpdateTagRequestSchema>
export type TranslateRequest = z.infer<typeof TranslateRequestSchema>
export type TranslateResponse = z.infer<typeof TranslateResponseSchema>
export type GetTranslationsParams = z.infer<typeof GetTranslationsParamsSchema>
