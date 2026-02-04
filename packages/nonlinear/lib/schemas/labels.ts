import {z} from 'zod'
import {IdSchema, SuccessResponseSchema, TimestampSchema} from './common.ts'

/**
 * Label Definition Schemas
 */

export const LabelDefinitionSchema = z.object({
    color: z.string(),
    created_at: TimestampSchema,
    id: z.string(),
    name: z.string(),
    updated_at: TimestampSchema,
})

export const CreateLabelRequestSchema = z.object({
    color: z.string().min(1),
    id: z.string().optional(),
    name: z.string().min(1),
})

export const UpdateLabelRequestSchema = z.object({
    color: z.string().min(1).optional(),
    name: z.string().min(1).optional(),
})

export const LabelResponseSchema = z.object({
    label: LabelDefinitionSchema,
})

export const LabelsResponseSchema = z.object({
    labels: z.array(LabelDefinitionSchema),
})

export const DeleteLabelResponseSchema = SuccessResponseSchema

export const LabelParamsSchema = z.object({
    id: z.string(),
})

export const LabelNameParamsSchema = z.object({
    name: z.string(),
})

// Inferred types
export type LabelDefinition = z.infer<typeof LabelDefinitionSchema>
export type CreateLabelRequest = z.infer<typeof CreateLabelRequestSchema>
export type UpdateLabelRequest = z.infer<typeof UpdateLabelRequestSchema>
export type LabelResponse = z.infer<typeof LabelResponseSchema>
export type LabelsResponse = z.infer<typeof LabelsResponseSchema>
export type DeleteLabelResponse = z.infer<typeof DeleteLabelResponseSchema>
