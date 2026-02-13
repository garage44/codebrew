import type {z} from 'zod'

/**
 * Validate request data against a Zod schema
 * Throws ZodError if validation fails
 */
export function validateRequest<TSchema extends z.ZodType>(
    schema: TSchema,
    data: unknown,
): z.infer<TSchema> {
    return schema.parse(data)
}

/**
 * Validate request data against a Zod schema (async)
 * Returns ZodError if validation fails instead of throwing
 */
export async function validateRequestSafe<TSchema extends z.ZodType>(
    schema: TSchema,
    data: unknown,
): Promise<{data?: z.infer<TSchema>; error?: z.ZodError}> {
    const result = await schema.safeParseAsync(data)
    if (result.success) {
        return {data: result.data}
    }
    return {error: result.error}
}
