import {z} from 'zod'

import {
    GroupIdParamsSchema,
    GroupIdPathSchema,
    IdSchema,
} from './common.ts'

/**
 * Group schemas for group management and state
 */

/**
 * Group sync request schema (WebSocket)
 */
export const GroupSyncRequestSchema = z.object({
    state: z.unknown(),
})

export type GroupSyncRequest = z.infer<typeof GroupSyncRequestSchema>

/**
 * Group lock request schema
 */
export const GroupLockRequestSchema = z.object({
    locked: z.boolean(),
    reason: z.string().optional(),
})

export type GroupLockRequest = z.infer<typeof GroupLockRequestSchema>

/**
 * Group recording request schema
 */
export const GroupRecordingRequestSchema = z.object({
    recording: z.boolean(),
    recordingId: z.string().optional(),
})

export type GroupRecordingRequest = z.infer<typeof GroupRecordingRequestSchema>

/**
 * Group config request schema
 */
export const GroupConfigRequestSchema = z.object({
    config: z.record(z.unknown()),
})

export type GroupConfigRequest = z.infer<typeof GroupConfigRequestSchema>

/**
 * Group update request schema
 */
export const GroupUpdateRequestSchema = z.object({
    action: z.string(),
    group: z.record(z.unknown()).optional(),
    groupId: z.string().optional(),
})

export type GroupUpdateRequest = z.infer<typeof GroupUpdateRequestSchema>

/**
 * Operator action request schema
 */
export const OperatorActionRequestSchema = z.object({
    action: z.string(),
    actionData: z.record(z.unknown()).optional(),
    targetUserId: z.string().optional(),
})

export type OperatorActionRequest = z.infer<typeof OperatorActionRequestSchema>

/**
 * Create/update group request schema (HTTP POST body)
 */
export const GroupDataSchema = z.record(z.unknown())

export type GroupData = z.infer<typeof GroupDataSchema>

// Re-export params schemas
export {GroupIdParamsSchema, GroupIdPathSchema} from './common.ts'
