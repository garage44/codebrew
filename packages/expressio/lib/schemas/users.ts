import {z} from 'zod'
import {UserIdPathSchema} from './common.ts'

/**
 * Upload avatar path parameters schema
 */
export const UploadAvatarParamsSchema = UserIdPathSchema

/**
 * Upload avatar response schema
 */
export const UploadAvatarResponseSchema = z.object({
    avatar: z.string(),
    success: z.literal(true),
    url: z.string(),
})

export type UploadAvatarParams = z.infer<typeof UploadAvatarParamsSchema>
export type UploadAvatarResponse = z.infer<typeof UploadAvatarResponseSchema>
