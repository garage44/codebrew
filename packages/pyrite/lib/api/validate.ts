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
