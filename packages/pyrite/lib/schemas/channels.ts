import {z} from 'zod'
import {ChannelIdPathSchema, ChannelIdSchema, ChannelSlugParamsSchema, UserIdSchema} from './common.ts'

/**
 * Channel schemas for channel management and membership
 */

/**
 * Create channel request schema
 */
export const CreateChannelRequestSchema = z.object({
    description: z.string().optional(),
    galeneGroup: z.string().min(1),
    name: z.string().min(1),
})

export type CreateChannelRequest = z.infer<typeof CreateChannelRequestSchema>

/**
 * Create channel request schema (HTTP - includes is_default)
 */
export const CreateChannelHttpRequestSchema = z.object({
    description: z.string().optional(),
    is_default: z.boolean().optional(),
    name: z.string().min(1),
    slug: z.string().min(1),
})

export type CreateChannelHttpRequest = z.infer<typeof CreateChannelHttpRequestSchema>

/**
 * Update channel request schema
 */
export const UpdateChannelRequestSchema = z.object({
    description: z.string().optional(),
    is_default: z.number().optional(),
    name: z.string().optional(),
    slug: z.string().optional(),
})

export type UpdateChannelRequest = z.infer<typeof UpdateChannelRequestSchema>

/**
 * Add channel member request schema
 */
export const AddChannelMemberRequestSchema = z.object({
    role: z.enum(['member', 'admin']).default('member'),
    userId: UserIdSchema,
})

export type AddChannelMemberRequest = z.infer<typeof AddChannelMemberRequestSchema>

/**
 * Channel ID params schema (WebSocket)
 */
export const ChannelIdParamsSchema = z.object({
    channelId: z.string().regex(/^\d+$/).transform(Number),
})

/**
 * Channel member params schema (WebSocket - for DELETE)
 */
export const ChannelMemberParamsSchema = z.object({
    channelId: z.string().regex(/^\d+$/).transform(Number),
    userId: UserIdSchema,
})

// Re-export params schemas
export {ChannelIdPathSchema, ChannelSlugParamsSchema} from './common.ts'
