import {z} from 'zod'

import {
    GroupIdParamsSchema,
    UserIdSchema,
} from './common.ts'

/**
 * Presence schemas for user presence and group state
 */

/**
 * Join group request schema
 */
export const JoinGroupRequestSchema = z.object({
    userId: UserIdSchema,
    username: z.string().min(1),
})

export type JoinGroupRequest = z.infer<typeof JoinGroupRequestSchema>

/**
 * Leave group request schema
 */
export const LeaveGroupRequestSchema = z.object({
    userId: UserIdSchema,
})

export type LeaveGroupRequest = z.infer<typeof LeaveGroupRequestSchema>

/**
 * Update user status request schema
 */
export const UpdateStatusRequestSchema = z.object({
    status: z.record(z.unknown()).optional(),
    userId: UserIdSchema,
})

export type UpdateStatusRequest = z.infer<typeof UpdateStatusRequestSchema>

/**
 * Get users request schema
 */
export const GetUsersRequestSchema = z.object({
    userId: UserIdSchema.optional(),
})

export type GetUsersRequest = z.infer<typeof GetUsersRequestSchema>

// Re-export params schemas
export {GroupIdParamsSchema} from './common.ts'
