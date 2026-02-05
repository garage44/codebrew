import {z} from 'zod'

/**
 * Common schemas used across multiple API endpoints
 */

/**
 * ID schema - accepts any non-empty string
 */
export const IdSchema = z.string().min(1)

/**
 * Group ID schema - string identifier for groups
 */
export const GroupIdSchema = z.string().min(1)

/**
 * Channel ID schema - numeric identifier for channels
 */
export const ChannelIdSchema = z.string().regex(/^\d+$/).transform(Number)

/**
 * User ID schema - string identifier for users
 */
export const UserIdSchema = z.string().min(1)

/**
 * Channel slug schema - string identifier for channels (matches Galene group name)
 */
export const ChannelSlugSchema = z.string().min(1)

/**
 * WebSocket path parameters schema
 * For routes like /api/presence/:groupId
 */
export const GroupIdParamsSchema = z.object({
    groupId: IdSchema,
})

/**
 * HTTP path parameters schema
 * HTTP router uses param0, param1, etc.
 */
export const GroupIdPathSchema = z.object({
    /** groupid */
    param0: IdSchema,
})

/**
 * Channel ID path parameters schema (HTTP)
 */
export const ChannelIdPathSchema = z.object({
    /** channelId */
    param0: ChannelIdSchema,
})

/**
 * User ID path parameters schema (HTTP)
 */
export const UserIdPathSchema = z.object({
    /** userid */
    param0: IdSchema,
})

/**
 * Channel slug params schema (WebSocket)
 */
export const ChannelSlugParamsSchema = z.object({
    channelSlug: ChannelSlugSchema,
})
