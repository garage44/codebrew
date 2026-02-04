import {z} from 'zod'
import {SuccessResponseSchema} from './common.ts'

/**
 * Deployment Schemas
 */

export const DeployPRRequestSchema = z.object({
    author: z.string().optional(),
    branch: z.string().min(1),
    pr_number: z.number().int().positive(),
    sha: z.string().optional(),
})

export const DeploymentPortsSchema = z.record(z.number().int().positive())

export const DeploymentSchema = z.object({
    author: z.string(),
    created: z.number(),
    number: z.number().int().positive(),
    ports: DeploymentPortsSchema,
    status: z.string(),
    updated: z.number(),
})

export const DeployPRResponseSchema = z.object({
    deployment: z.object({
        number: z.number().int().positive(),
        ports: DeploymentPortsSchema,
        status: z.string(),
        urls: z.array(z.object({
            package: z.string(),
            url: z.string().url(),
        })),
    }).optional(),
    message: z.string(),
    success: z.boolean(),
})

export const DeployStatusResponseSchema = z.object({
    deployment: z.object({
        author: z.string(),
        created: z.number(),
        number: z.number().int().positive(),
        ports: DeploymentPortsSchema,
        status: z.string(),
        updated: z.number(),
        urls: z.array(z.object({
            package: z.string(),
            url: z.string().url(),
        })),
    }).optional(),
    error: z.string().optional(),
    success: z.boolean(),
})

export const DeployCleanupResponseSchema = z.object({
    error: z.string().optional(),
    message: z.string(),
    success: z.boolean(),
})

export const DeployPRNumberParamsSchema = z.object({
    prNumber: z.coerce.number().int().positive(),
})

// Inferred types
export type DeployPRRequest = z.infer<typeof DeployPRRequestSchema>
export type DeploymentPorts = z.infer<typeof DeploymentPortsSchema>
export type Deployment = z.infer<typeof DeploymentSchema>
export type DeployPRResponse = z.infer<typeof DeployPRResponseSchema>
export type DeployStatusResponse = z.infer<typeof DeployStatusResponseSchema>
export type DeployCleanupResponse = z.infer<typeof DeployCleanupResponseSchema>
