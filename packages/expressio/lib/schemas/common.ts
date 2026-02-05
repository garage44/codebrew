import {z} from 'zod'

/**
 * Common schemas used across multiple API endpoints
 */

/**
 * ID schema - accepts any non-empty string
 * Note: randomId() generates short alphanumeric IDs (not UUIDs)
 */
export const IdSchema = z.string().min(1)

/**
 * Translation path schema - array of strings
 */
export const PathSchema = z.array(z.string())

/**
 * Language ID schema - string identifier for languages
 */
export const LanguageIdSchema = z.string().min(1)

/**
 * WebSocket path parameters schema
 * For routes like /api/workspaces/:workspace_id
 */
export const WorkspaceIdParamsSchema = z.object({
    workspace_id: IdSchema,
})

/**
 * HTTP path parameters schema
 * HTTP router uses param0, param1, etc.
 */
export const WorkspaceIdPathSchema = z.object({
    /** workspace_id */
    param0: IdSchema,
})

/**
 * User ID path parameters schema (HTTP)
 */
export const UserIdPathSchema = z.object({
    /** userid */
    param0: IdSchema,
})
