import type {z} from 'zod'

/**
 * Validate request data against a Zod schema
 * Throws ZodError if validation fails
 */
export function validateRequest<T extends z.ZodType>(
    schema: T,
    data: unknown,
): z.infer<T> {
    return schema.parse(data)
}
