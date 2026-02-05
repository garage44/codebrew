import {z} from 'zod'
import {ChannelSlugParamsSchema} from './common.ts'

/**
 * Chat schemas for messaging and typing indicators
 */

/**
 * Send message request schema
 */
export const SendMessageRequestSchema = z.object({
    kind: z.string().default('message'),
    message: z.string().min(1),
})

export type SendMessageRequest = z.infer<typeof SendMessageRequestSchema>

/**
 * Typing indicator request schema
 */
export const TypingIndicatorRequestSchema = z.object({
    typing: z.boolean(),
})

export type TypingIndicatorRequest = z.infer<typeof TypingIndicatorRequestSchema>

/**
 * Get messages request schema
 */
export const GetMessagesRequestSchema = z.object({
    limit: z.number().int().positive()
        .default(100)
        .optional(),
})

export type GetMessagesRequest = z.infer<typeof GetMessagesRequestSchema>

// Re-export params schemas
export {ChannelSlugParamsSchema} from './common.ts'
