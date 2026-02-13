import {getAvatarStoragePath} from '@garage44/common/lib/avatar-routes'
import {userManager} from '@garage44/common/service'
import fs from 'fs-extra'
import path from 'node:path'
import {z} from 'zod'

import {validateRequest} from '../lib/api/validate.ts'
import {UploadAvatarParamsSchema, UploadAvatarResponseSchema} from '../lib/schemas/users.ts'
import {logger} from '../service.ts'

export default function apiUsers(router: {
    post: (
        path: string,
        handler: (req: Request, params: Record<string, string>, session?: Record<string, string>) => Promise<Response>,
    ) => void
}): void {
    /**
     * Upload avatar for a user
     * POST /api/users/:userid/avatar
     * Note: /api/users/me is handled by common middleware
     * IMPORTANT: This must be registered BEFORE any other /api/users/:userid routes to avoid route matching issues
     */
    router.post('/api/users/:userid/avatar', async (req: Request, params: Record<string, string>) => {
        try {
            const {param0: userId} = validateRequest(UploadAvatarParamsSchema, params)

            logger.info(`[Users API] POST /api/users/:userid/avatar - userId from params: ${userId}`)

            // Basic path traversal protection
            if (userId.match(/\.\.\//g) !== null) {
                return new Response(JSON.stringify({error: 'invalid user id'}), {
                    headers: {'Content-Type': 'application/json'},
                    status: 400,
                })
            }

            // Check if user exists
            logger.info(`[Users API] Looking up user with ID: ${userId}`)
            // Try to get user by ID first, then by username if not found
            let user = await userManager.getUser(userId)
            if (!user) {
                // If userId is a username, try getUserByUsername
                user = await userManager.getUserByUsername(userId)
            }
            if (!user) {
                logger.warn(`[Users API] User not found for ID: ${userId}`)
                const allUsers = await userManager.listUsers()
                logger.warn('[Users API] Available user IDs:', allUsers.map((u) => u.id).join(', '))
                logger.warn('[Users API] Available usernames:', allUsers.map((u) => u.username).join(', '))
                return new Response(JSON.stringify({error: 'user not found'}), {
                    headers: {'Content-Type': 'application/json'},
                    status: 404,
                })
            }

            logger.info('[Users API] Found user:', {avatar: user.profile?.avatar, id: user.id, username: user.username})
            // Parse multipart form data
            const formData = await req.formData()
            const file = formData.get('avatar') as File | null

            if (!file) {
                return new Response(JSON.stringify({error: 'no file provided'}), {
                    headers: {'Content-Type': 'application/json'},
                    status: 400,
                })
            }

            // Validate file type
            const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
            if (!allowedTypes.includes(file.type)) {
                return new Response(JSON.stringify({error: 'invalid file type. allowed: jpeg, png, webp'}), {
                    headers: {'Content-Type': 'application/json'},
                    status: 400,
                })
            }

            /*
             * Validate file size (max 2MB)
             */
            const maxSize = 2 * 1024 * 1024
            if (file.size > maxSize) {
                return new Response(JSON.stringify({error: 'file too large. max size: 2MB'}), {
                    headers: {'Content-Type': 'application/json'},
                    status: 400,
                })
            }

            // Determine file extension from MIME type
            const extMap: Record<string, string> = {
                'image/jpeg': 'jpg',
                'image/jpg': 'jpg',
                'image/png': 'png',
                'image/webp': 'webp',
            }
            const ext = extMap[file.type] || 'png'

            // Create avatars directory if it doesn't exist (using ~/.{appName}/avatars/ convention)
            const avatarsDir = getAvatarStoragePath('expressio')
            await fs.ensureDir(avatarsDir)

            // Save file with user.id as filename (use actual user ID, not the userId param which might be username)
            const filename = `${user.id}.${ext}`
            const filePath = path.join(avatarsDir, filename)

            // Convert File to Buffer and write to disk
            const arrayBuffer = await file.arrayBuffer()
            await Bun.write(filePath, arrayBuffer)

            logger.info(`[Users API] Saved avatar for user ${user.id}: ${filePath}`)

            // Update user avatar in database (use user.id, not userId param)
            const avatarFilename = filename
            // Store the user ID to verify it doesn't change
            const userDbId = user.id
            logger.info(`[Users API] Updating user ${userDbId} avatar in DB to: ${avatarFilename}`)
            logger.info(`[Users API] Original user ID before update: ${userDbId}`)

            const updatedUser = await userManager.updateUser(userDbId, {
                profile: {
                    ...user.profile,
                    avatar: avatarFilename,
                },
            })

            if (!updatedUser) {
                logger.error(`[Users API] Failed to update user ${userDbId} - updateUser returned null`)
                return new Response(JSON.stringify({error: 'failed to update user in database'}), {
                    headers: {'Content-Type': 'application/json'},
                    status: 500,
                })
            }

            // Verify the user ID didn't change
            if (updatedUser.id !== userDbId) {
                logger.error(`[Users API] CRITICAL: User ID changed from ${userDbId} to ${updatedUser.id} during update!`)
                // This shouldn't happen, but if it does, return an error
                return new Response(JSON.stringify({error: 'user ID mismatch after update'}), {
                    headers: {'Content-Type': 'application/json'},
                    status: 500,
                })
            }

            logger.info(
                `[Users API] User updated successfully. New avatar: ${updatedUser.profile.avatar}, ` +
                    `ID verified: ${updatedUser.id}`,
            )

            // Return success with avatar URL
            const response = {
                avatar: avatarFilename,
                success: true as const,
                url: `/avatars/${avatarFilename}`,
            }
            // Validate response matches schema
            validateRequest(UploadAvatarResponseSchema, response)
            return new Response(JSON.stringify(response), {
                headers: {'Content-Type': 'application/json'},
            })
        } catch (error) {
            if (error instanceof z.ZodError) {
                return new Response(JSON.stringify({error: error.errors}), {
                    headers: {'Content-Type': 'application/json'},
                    status: 400,
                })
            }
            logger.error(`[Users API] Error uploading avatar for user ${params.param0}:`, error)
            return new Response(JSON.stringify({error: 'failed to upload avatar'}), {
                headers: {'Content-Type': 'application/json'},
                status: 500,
            })
        }
    })
}
