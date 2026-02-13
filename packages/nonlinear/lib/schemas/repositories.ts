import {z} from 'zod'
import {IdSchema, SuccessResponseSchema, TimestampSchema} from './common.ts'

/**
 * Repository Schemas
 */

export const RepositoryPlatformSchema = z.enum(['github', 'gitlab', 'local'])

export const RepositorySchema = z.object({
    config: z.string(), // JSON string
    created_at: TimestampSchema,
    id: IdSchema,
    name: z.string(),
    path: z.string(),
    platform: RepositoryPlatformSchema,
    remote_url: z.string().nullable(),
    updated_at: TimestampSchema,
})

export const CreateRepositoryRequestSchema = z.object({
    config: z.record(z.unknown()).optional(),
    name: z.string().min(1),
    path: z.string().min(1),
    platform: RepositoryPlatformSchema.optional(),
    remote_url: z.string().url().nullable()
        .optional(),
})

export const UpdateRepositoryRequestSchema = z.object({
    config: z.record(z.unknown()).optional(),
    name: z.string().min(1).optional(),
    path: z.string().min(1).optional(),
    platform: RepositoryPlatformSchema.optional(),
    remote_url: z.string().url().nullable()
        .optional(),
})

export const DiscoverRepositoriesRequestSchema = z.object({
    searchPath: z.string().optional(),
})

export const DiscoveredRepositorySchema = z.object({
    name: z.string(),
    path: z.string(),
})

export const RepositoryResponseSchema = z.object({
    repository: RepositorySchema,
})

export const RepositoriesResponseSchema = z.object({
    repositories: z.array(RepositorySchema),
})

export const DiscoverRepositoriesResponseSchema = z.object({
    discovered: z.array(DiscoveredRepositorySchema),
})

export const DeleteRepositoryResponseSchema = SuccessResponseSchema

export const RepositoryParamsSchema = z.object({
    id: IdSchema,
})

// Inferred types
export type Repository = z.infer<typeof RepositorySchema>
export type CreateRepositoryRequest = z.infer<typeof CreateRepositoryRequestSchema>
export type UpdateRepositoryRequest = z.infer<typeof UpdateRepositoryRequestSchema>
export type DiscoverRepositoriesRequest = z.infer<typeof DiscoverRepositoriesRequestSchema>
export type DiscoveredRepository = z.infer<typeof DiscoveredRepositorySchema>
export type RepositoryResponse = z.infer<typeof RepositoryResponseSchema>
export type RepositoriesResponse = z.infer<typeof RepositoriesResponseSchema>
export type DiscoverRepositoriesResponse = z.infer<typeof DiscoverRepositoriesResponseSchema>
export type DeleteRepositoryResponse = z.infer<typeof DeleteRepositoryResponseSchema>
