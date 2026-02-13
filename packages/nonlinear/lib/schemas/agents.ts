import {z} from 'zod'
import {IdSchema, SuccessResponseSchema, TimestampSchema} from './common.ts'

/**
 * Agent Schemas
 */

export const AgentTypeSchema = z.enum(['planner', 'developer', 'reviewer'])

export const AgentStatusSchema = z.enum(['idle', 'working', 'error', 'offline'])

export const AgentTaskStatusSchema = z.enum(['pending', 'processing', 'completed', 'failed'])

export const AgentTaskTypeSchema = z.enum(['mention', 'assignment', 'manual', 'refinement'])

// Base agent schema from database
export const AgentDbSchema = z.object({
    avatar: z.string().nullable(),
    /* JSON string */
    config: z.string(),
    created_at: TimestampSchema,
    display_name: z.string().nullable(),
    /* SQLite boolean (0 or 1) */
    enabled: z.number(),
    id: IdSchema,
    name: z.string(),
    status: AgentStatusSchema,
    type: AgentTypeSchema,
})

// Agent task schema
export const AgentTaskSchema = z.object({
    agent_id: IdSchema,
    completed_at: TimestampSchema.nullable(),
    created_at: TimestampSchema,
    error: z.string().nullable(),
    id: IdSchema,
    priority: z.number().int(),
    started_at: TimestampSchema.nullable(),
    status: AgentTaskStatusSchema,
    /* JSON string */
    task_data: z.string(),
    task_type: AgentTaskTypeSchema,
})

// Agent stats schema
export const AgentStatsSchema = z.object({
    completed: z.number().int(),
    failed: z.number().int(),
    pending: z.number().int(),
    processing: z.number().int(),
})

// Enriched agent response (with status, stats, serviceOnline)
export const EnrichedAgentSchema = AgentDbSchema.extend({
    currentTicketId: z.string().nullable(),
    lastActivity: TimestampSchema,
    serviceOnline: z.boolean(),
    stats: AgentStatsSchema,
})

export const CreateAgentRequestSchema = z.object({
    config: z.record(z.unknown()).optional(),
    enabled: z.boolean().optional(),
    name: z.string().min(1),
    type: AgentTypeSchema,
})

export const UpdateAgentRequestSchema = z.object({
    config: z.record(z.unknown()).optional(),
    enabled: z.boolean().optional(),
    name: z.string().min(1).optional(),
})

export const TriggerAgentRequestSchema = z.object({
    stream: z.boolean().optional(),
})
    /* Allow additional context fields */
    .catchall(z.unknown())

export const AgentResponseSchema = z.object({
    agent: AgentDbSchema,
})

export const AgentsResponseSchema = z.object({
    agents: z.array(EnrichedAgentSchema),
})

export const AgentStatsResponseSchema = z.object({
    agentId: IdSchema,
    stats: AgentStatsSchema,
})

export const AgentServiceStatusResponseSchema = z.object({
    agentId: IdSchema,
    online: z.boolean(),
})

export const StartAgentServiceResponseSchema = z.object({
    message: z.string(),
    online: z.boolean(),
    pid: z.number().optional(),
    success: z.boolean(),
})

export const StopAgentServiceResponseSchema = z.object({
    message: z.string(),
    online: z.boolean(),
    success: z.boolean(),
})

export const TriggerAgentResponseSchema = z.object({
    message: z.string(),
    streaming: z.boolean().optional(),
    success: z.boolean(),
    task_id: IdSchema,
})

export const SubscribeAgentResponseSchema = z.object({
    success: z.boolean(),
    topic: z.string(),
})

export const AgentParamsSchema = z.object({
    id: IdSchema,
})

export const AnthropicUsageResponseSchema = z.object({
    usage: z.object({
        limit: z.number().int().optional(),
        remaining: z.number().int().optional(),
        reset: z.string().optional(),
    }),
})

export const AnthropicTestResponseSchema = z.object({
    headers: z.object({
        limit: z.string().nullable(),
        remaining: z.string().nullable(),
        reset: z.string().nullable(),
    }),
    message: z.string(),
    success: z.boolean(),
    usage: z.object({
        limit: z.number().int().optional(),
        remaining: z.number().int().optional(),
        reset: z.string().optional(),
    }),
})

// Inferred types
export type AgentType = z.infer<typeof AgentTypeSchema>
export type AgentStatus = z.infer<typeof AgentStatusSchema>
export type AgentTaskStatus = z.infer<typeof AgentTaskStatusSchema>
export type AgentTaskType = z.infer<typeof AgentTaskTypeSchema>
export type AgentDb = z.infer<typeof AgentDbSchema>
export type AgentTask = z.infer<typeof AgentTaskSchema>
export type AgentStats = z.infer<typeof AgentStatsSchema>
export type EnrichedAgent = z.infer<typeof EnrichedAgentSchema>
export type CreateAgentRequest = z.infer<typeof CreateAgentRequestSchema>
export type UpdateAgentRequest = z.infer<typeof UpdateAgentRequestSchema>
export type TriggerAgentRequest = z.infer<typeof TriggerAgentRequestSchema>
export type AgentResponse = z.infer<typeof AgentResponseSchema>
export type AgentsResponse = z.infer<typeof AgentsResponseSchema>
export type AgentStatsResponse = z.infer<typeof AgentStatsResponseSchema>
export type AgentServiceStatusResponse = z.infer<typeof AgentServiceStatusResponseSchema>
export type StartAgentServiceResponse = z.infer<typeof StartAgentServiceResponseSchema>
export type StopAgentServiceResponse = z.infer<typeof StopAgentServiceResponseSchema>
export type TriggerAgentResponse = z.infer<typeof TriggerAgentResponseSchema>
export type SubscribeAgentResponse = z.infer<typeof SubscribeAgentResponseSchema>
