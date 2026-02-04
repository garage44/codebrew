import {z} from 'zod'

/**
 * Common schemas used across multiple API endpoints
 */

export const TimestampSchema = z.number().int().positive()

/**
 * ID schema - accepts any non-empty string
 * Note: randomId() generates short alphanumeric IDs (not UUIDs)
 * Use UuidSchema for actual UUID validation when needed
 */
export const IdSchema = z.string().min(1)

/**
 * UUID schema for actual UUID validation
 * Use this when you need strict UUID format (e.g., user IDs)
 */
export const UuidSchema = z.string().uuid()

export const PaginationQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(100).default(50),
    offset: z.coerce.number().int().min(0).default(0),
})

export const SuccessResponseSchema = z.object({
    success: z.literal(true),
})
