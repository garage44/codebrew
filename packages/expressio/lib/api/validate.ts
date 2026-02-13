import type {z} from 'zod'

/**
 * Validate request data against a Zod schema
 * Throws ZodError if validation fails
 */
export function validateRequest<Schema extends z.ZodType>(
    schema: Schema,
    data: unknown,
): z.infer<Schema> {
    return schema.parse(data)
}
