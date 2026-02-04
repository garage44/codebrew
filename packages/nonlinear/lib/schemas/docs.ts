import {z} from 'zod'
import {IdSchema, SuccessResponseSchema, TimestampSchema} from './common.ts'

/**
 * Documentation Schemas
 */

export const LabelDefinitionSchema = z.object({
    color: z.string(),
    name: z.string(),
})

// Base doc schema from database
export const DocDbSchema = z.object({
    author_id: z.string(),
    content: z.string(),
    created_at: TimestampSchema,
    id: IdSchema,
    path: z.string(),
    title: z.string(),
    updated_at: TimestampSchema,
})

// Enriched doc response (with tags, labelDefinitions)
export const EnrichedDocSchema = DocDbSchema.extend({
    labelDefinitions: z.array(LabelDefinitionSchema).optional(),
    tags: z.array(z.string()),
})

export const CreateDocRequestSchema = z.object({
    content: z.string(),
    labels: z.array(z.string()).optional(),
    path: z.string().min(1),
    title: z.string().min(1),
})

export const UpdateDocRequestSchema = z.object({
    content: z.string().optional(),
    labels: z.array(z.string()).optional(),
    path: z.string().min(1).optional(),
    title: z.string().min(1).optional(),
})

export const GetDocsQuerySchema = z.object({
    tags: z.string().optional(),
    workspace: z.string().optional(),
})

export const GetDocByPathQuerySchema = z.object({
    path: z.string().min(1),
})

export const DocSearchQuerySchema = z.object({
    contentType: z.enum(['doc', 'ticket', 'both']).default('both'),
    limit: z.coerce.number().int().min(1).max(100).default(10),
    query: z.string().min(1),
    tags: z.string().optional(),
    workspace: z.string().optional(),
})

export const DocResponseSchema = z.object({
    doc: EnrichedDocSchema,
})

export const DocsResponseSchema = z.object({
    docs: z.array(EnrichedDocSchema),
})

export const DeleteDocResponseSchema = SuccessResponseSchema

export const DocParamsSchema = z.object({
    id: IdSchema,
})

// Inferred types
export type DocDb = z.infer<typeof DocDbSchema>
export type EnrichedDoc = z.infer<typeof EnrichedDocSchema>
export type CreateDocRequest = z.infer<typeof CreateDocRequestSchema>
export type UpdateDocRequest = z.infer<typeof UpdateDocRequestSchema>
export type GetDocsQuery = z.infer<typeof GetDocsQuerySchema>
export type GetDocByPathQuery = z.infer<typeof GetDocByPathQuerySchema>
export type DocSearchQuery = z.infer<typeof DocSearchQuerySchema>
export type DocResponse = z.infer<typeof DocResponseSchema>
export type DocsResponse = z.infer<typeof DocsResponseSchema>
export type DeleteDocResponse = z.infer<typeof DeleteDocResponseSchema>
