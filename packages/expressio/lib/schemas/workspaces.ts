import {z} from 'zod'
import {IdSchema, WorkspaceIdParamsSchema, WorkspaceIdPathSchema} from './common.ts'

// Re-export for convenience
export {WorkspaceIdParamsSchema, WorkspaceIdPathSchema} from './common.ts'

/**
 * Target language schema (for workspace config - name is optional as it's looked up from Enola)
 * formality can be undefined or empty string (will be normalized to undefined)
 */
export const TargetLanguageSchema = z.object({
    engine: z.enum(['anthropic', 'deepl']),
    formality: z.enum(['default', 'more', 'less']).optional(),
    id: z.string(),
    name: z.string().optional(),
})

/**
 * Target language schema (for requests - all fields required)
 */
export const TargetLanguageRequestSchema = z.object({
    engine: z.enum(['anthropic', 'deepl']),
    formality: z.enum(['default', 'more', 'less']),
    id: z.string(),
    name: z.string(),
})

/**
 * Workspace sync schema
 */
export const WorkspaceSyncSchema = z.object({
    dir: z.string(),
    enabled: z.boolean(),
    suggestions: z.boolean().optional(),
})

/**
 * Workspace config schema (for responses - name is optional)
 */
export const WorkspaceConfigSchema = z.object({
    languages: z.object({
        source: z.string(),
        target: z.array(TargetLanguageSchema),
    }),
    source_file: z.string().nullable(),
    sync: WorkspaceSyncSchema,
    workspace_id: IdSchema,
})

/**
 * Workspace config schema (for requests - all fields required)
 */
export const WorkspaceConfigRequestSchema = z.object({
    languages: z.object({
        source: z.string(),
        target: z.array(TargetLanguageRequestSchema),
    }),
    source_file: z.string().nullable(),
    sync: WorkspaceSyncSchema,
    workspace_id: IdSchema,
})

/**
 * Browse request schema
 */
export const BrowseRequestSchema = z.object({
    path: z.string().optional(),
})

/**
 * Browse directory entry schema
 */
export const BrowseDirectoryEntrySchema = z.object({
    is_workspace: z.boolean(),
    name: z.string(),
    path: z.string(),
})

/**
 * Browse workspace info schema
 */
export const BrowseWorkspaceInfoSchema = z.object({
    config: WorkspaceConfigSchema,
    id: IdSchema,
})

/**
 * Browse current schema
 */
export const BrowseCurrentSchema = z.object({
    path: z.string(),
    workspace: BrowseWorkspaceInfoSchema.nullable(),
})

/**
 * Browse response schema
 */
export const BrowseResponseSchema = z.object({
    current: BrowseCurrentSchema,
    directories: z.array(BrowseDirectoryEntrySchema),
    parent: z.string().nullable(),
})

/**
 * Get workspace response schema
 */
export const GetWorkspaceResponseSchema = z.object({
    config: WorkspaceConfigSchema,
    i18n: z.record(z.unknown()).optional(),
    id: IdSchema,
})

/**
 * Usage response schema
 */
export const GetUsageResponseSchema = z.object({
    count: z.number(),
    limit: z.number(),
})

/**
 * Update workspace request schema
 */
export const UpdateWorkspaceRequestSchema = z.object({
    workspace: z.object({
        config: WorkspaceConfigRequestSchema,
    }),
})

/**
 * Update workspace response schema
 */
export const UpdateWorkspaceResponseSchema = z.object({
    languages: z.object({
        source: z.string(),
        target: z.array(TargetLanguageSchema),
    }),
})

/**
 * Create workspace request schema
 */
export const CreateWorkspaceRequestSchema = z.object({
    path: z.string(),
})

/**
 * Create workspace response schema
 */
export const CreateWorkspaceResponseSchema = z.object({
    // Response schema allows optional name
    workspace: WorkspaceConfigSchema,
})

/**
 * Delete workspace response schema
 */
export const DeleteWorkspaceResponseSchema = z.object({
    message: z.literal('ok'),
})

export type BrowseRequest = z.infer<typeof BrowseRequestSchema>
export type BrowseResponse = z.infer<typeof BrowseResponseSchema>
export type GetWorkspaceResponse = z.infer<typeof GetWorkspaceResponseSchema>
export type GetUsageResponse = z.infer<typeof GetUsageResponseSchema>
export type UpdateWorkspaceRequest = z.infer<typeof UpdateWorkspaceRequestSchema>
export type UpdateWorkspaceResponse = z.infer<typeof UpdateWorkspaceResponseSchema>
export type CreateWorkspaceRequest = z.infer<typeof CreateWorkspaceRequestSchema>
export type CreateWorkspaceResponse = z.infer<typeof CreateWorkspaceResponseSchema>
export type DeleteWorkspaceResponse = z.infer<typeof DeleteWorkspaceResponseSchema>
