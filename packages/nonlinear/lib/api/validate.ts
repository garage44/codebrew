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

/**
 * Validate request data against a Zod schema (async)
 * Returns ZodError if validation fails instead of throwing
 */
export async function validateRequestSafe<T extends z.ZodType>(
    schema: T,
    data: unknown,
): Promise<{data?: z.infer<T>; error?: z.ZodError}> {
    const result = await schema.safeParseAsync(data)
    if (result.success) {
        return {data: result.data}
    }
    return {error: result.error}
}
