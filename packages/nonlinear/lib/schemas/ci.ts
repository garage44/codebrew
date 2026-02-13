import {z} from 'zod'
import {IdSchema, SuccessResponseSchema, TimestampSchema} from './common.ts'

/**
 * CI Schemas
 */

export const CIRunStatusSchema = z.enum(['running', 'success', 'failed', 'fixed'])

export const CIRunSchema = z.object({
    completed_at: TimestampSchema.nullable(),
    /* JSON array string */
    fixes_applied: z.string().nullable(),
    id: IdSchema,
    output: z.string().nullable(),
    started_at: TimestampSchema,
    status: CIRunStatusSchema,
    ticket_id: IdSchema,
})

export const TriggerCIRunRequestSchema = z.object({
    repository_path: z.string().min(1),
    ticket_id: IdSchema,
})

export const CIRunsResponseSchema = z.object({
    runs: z.array(CIRunSchema),
})

export const CIRunResponseSchema = z.object({
    run: CIRunSchema,
})

export const TriggerCIRunResponseSchema = z.object({
    message: z.string(),
    success: z.literal(true),
})

export const CIRunParamsSchema = z.object({
    ticketId: IdSchema,
})

export const CIRunIdParamsSchema = z.object({
    id: IdSchema,
})

// Inferred types
export type CIRunStatus = z.infer<typeof CIRunStatusSchema>
export type CIRun = z.infer<typeof CIRunSchema>
export type TriggerCIRunRequest = z.infer<typeof TriggerCIRunRequestSchema>
export type CIRunsResponse = z.infer<typeof CIRunsResponseSchema>
export type CIRunResponse = z.infer<typeof CIRunResponseSchema>
export type TriggerCIRunResponse = z.infer<typeof TriggerCIRunResponseSchema>
