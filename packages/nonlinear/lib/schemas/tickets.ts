import {z} from 'zod'
import {IdSchema, SuccessResponseSchema, TimestampSchema} from './common.ts'

/**
 * Ticket Schemas
 */

export const TicketStatusSchema = z.enum(['backlog', 'todo', 'in_progress', 'review', 'closed'])

export const AssigneeTypeSchema = z.enum(['agent', 'human'])

export const TicketAssigneeSchema = z.object({
    assignee_id: z.string(),
    assignee_type: AssigneeTypeSchema,
})

export const LabelDefinitionSchema = z.object({
    color: z.string(),
    name: z.string(),
})

// Base ticket schema from database
export const TicketDbSchema = z.object({
    assignee_id: z.string().nullable(),
    assignee_type: AssigneeTypeSchema.nullable(),
    branch_name: z.string().nullable(),
    created_at: TimestampSchema,
    description: z.string().nullable(),
    id: IdSchema,
    merge_request_id: z.string().nullable(),
    priority: z.number().int().min(0)
        .max(100)
        .nullable(),
    repository_id: IdSchema,
    solution_plan: z.string().nullable(),
    status: TicketStatusSchema,
    title: z.string().min(1),
    updated_at: TimestampSchema,
})

// Ticket with repository name (from JOIN)
export const TicketWithRepositorySchema = TicketDbSchema.extend({
    repository_name: z.string().nullable(),
})

// Ticket with repository path (from JOIN)
export const TicketWithRepositoryPathSchema = TicketDbSchema.extend({
    repository_name: z.string().nullable(),
    repository_path: z.string().nullable(),
})

// Enriched ticket response (with assignees, labels, labelDefinitions)
export const EnrichedTicketSchema = TicketWithRepositorySchema.extend({
    assignees: z.array(TicketAssigneeSchema),
    labelDefinitions: z.array(LabelDefinitionSchema).optional(),
    labels: z.array(z.string()),
})

export const CreateTicketRequestSchema = z.object({
    assignee_id: z.string().optional().nullable(),
    assignee_type: AssigneeTypeSchema.optional().nullable(),
    assignees: z.array(TicketAssigneeSchema).optional(),
    description: z.string().optional(),
    labels: z.array(z.string()).optional(),
    priority: z.number().int().min(0)
        .max(100)
        .optional(),
    repository_id: IdSchema,
    status: TicketStatusSchema.default('backlog'),
    title: z.string().min(1),
})

export const UpdateTicketRequestSchema = z.object({
    assignee_id: z.string().optional(),
    assignee_type: AssigneeTypeSchema.optional(),
    assignees: z.array(TicketAssigneeSchema).optional(),
    description: z.string().optional(),
    labels: z.array(z.string()).optional(),
    priority: z.number().int().min(0)
        .max(100)
        .optional(),
    solution_plan: z.string().optional(),
    status: TicketStatusSchema.optional(),
    title: z.string().min(1).optional(),
})

export const CommentStatusSchema = z.enum(['generating', 'completed', 'failed'])

export const CommentSchema = z.object({
    author_id: z.string(),
    author_type: AssigneeTypeSchema,
    content: z.string(),
    created_at: TimestampSchema,
    id: IdSchema,
    mentions: z.string().nullable(), // JSON array string
    responding_to: z.string().nullable(),
    status: CommentStatusSchema,
    ticket_id: IdSchema,
    updated_at: TimestampSchema.optional(),
})

export const CreateCommentRequestSchema = z.object({
    author_id: z.string(),
    author_type: AssigneeTypeSchema,
    content: z.string().min(1),
    mentions: z.array(z.string()).optional(),
})

export const CommentResponseSchema = z.object({
    comment: CommentSchema,
})

export const TicketResponseSchema = z.object({
    ticket: EnrichedTicketSchema,
})

export const TicketWithCommentsResponseSchema = z.object({
    comments: z.array(CommentSchema),
    ticket: EnrichedTicketSchema,
})

export const TicketsResponseSchema = z.object({
    tickets: z.array(EnrichedTicketSchema),
})

export const ApproveTicketResponseSchema = z.object({
    message: z.string(),
    success: z.literal(true),
})

export const ReopenTicketRequestSchema = z.object({
    reason: z.string().optional(),
})

export const TicketParamsSchema = z.object({
    id: IdSchema,
})

export const TicketCommentParamsSchema = z.object({
    commentId: z.string(),
    ticketId: IdSchema,
})

// Inferred types
export type TicketStatus = z.infer<typeof TicketStatusSchema>
export type AssigneeType = z.infer<typeof AssigneeTypeSchema>
export type TicketAssignee = z.infer<typeof TicketAssigneeSchema>
export type LabelDefinition = z.infer<typeof LabelDefinitionSchema>
export type TicketDb = z.infer<typeof TicketDbSchema>
export type TicketWithRepository = z.infer<typeof TicketWithRepositorySchema>
export type EnrichedTicket = z.infer<typeof EnrichedTicketSchema>
export type CreateTicketRequest = z.infer<typeof CreateTicketRequestSchema>
export type UpdateTicketRequest = z.infer<typeof UpdateTicketRequestSchema>
export type CommentStatus = z.infer<typeof CommentStatusSchema>
export type Comment = z.infer<typeof CommentSchema>
export type CreateCommentRequest = z.infer<typeof CreateCommentRequestSchema>
export type TicketResponse = z.infer<typeof TicketResponseSchema>
export type TicketWithCommentsResponse = z.infer<typeof TicketWithCommentsResponseSchema>
export type TicketsResponse = z.infer<typeof TicketsResponseSchema>
export type ApproveTicketResponse = z.infer<typeof ApproveTicketResponseSchema>
export type ReopenTicketRequest = z.infer<typeof ReopenTicketRequestSchema>
