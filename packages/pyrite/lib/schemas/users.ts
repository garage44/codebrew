import {z} from 'zod'

import {
    UserIdPathSchema,
    UserIdSchema,
} from './common.ts'

/**
 * User schemas for user management and presence
 */

/**
 * User presence request schema (WebSocket)
 */
export const UserPresenceRequestSchema = z.object({
    status: z.unknown().optional(),
    userid: UserIdSchema,
})

export type UserPresenceRequest = z.infer<typeof UserPresenceRequestSchema>

/**
 * Create/update user request schema (HTTP POST body)
 * User data is flexible - matches UserManager interface
 */
export const UserDataSchema = z.record(z.unknown())

export type UserData = z.infer<typeof UserDataSchema>

// Re-export params schemas
export {UserIdPathSchema} from './common.ts'
