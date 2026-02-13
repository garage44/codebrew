import {Database} from 'bun:sqlite'
import fs from 'fs-extra'
import path from 'node:path'

import {logger} from '../service.ts'
import {config} from './config.ts'
import {groupTemplate, loadGroup} from './group.ts'

/**
 * Channel Manager for Pyrite
 * Handles CRUD operations for channels and channel membership
 */

export interface Channel {
    created_at: number
    description: string
    id: number
    is_default: number
    member_count?: number
    name: string
    slug: string
    unread_count?: number
}

export interface ChannelMember {
    avatar: string
    channel_id: number
    joined_at: number
    role: 'member' | 'admin'
    user_id: string
    username: string
}

export class ChannelManager {
    private db: Database

    constructor(database: Database) {
        this.db = database
    }

    /**
     * Create a new channel
     * slug directly matches Galene group name (1:1 mapping)
     */
    async createChannel(
        name: string,
        slug: string,
        description: string,
        creatorId: string,
        isDefault: boolean = false,
    ): Promise<Channel> {
        const now = Date.now()

        // If setting as default, unset all other defaults first
        if (isDefault) {
            await this.unsetAllDefaults()
        }

        const insertChannel = this.db.prepare(`
            INSERT INTO channels (name, slug, description, created_at, is_default)
            VALUES (?, ?, ?, ?, ?)
        `)

        const result = insertChannel.run(name, slug, description, now, isDefault ? 1 : 0)
        const channelId = result.lastInsertRowid as number

        // Add creator as admin
        await this.addMember(channelId, creatorId, 'admin')

        logger.info(`[ChannelManager] Created channel "${name}" (slug: ${slug}, id: ${channelId}, is_default: ${isDefault})`)

        return this.getChannel(channelId)!
    }

    /**
     * Get a channel by ID
     */
    getChannel(id: number): Channel | null {
        const stmt = this.db.prepare(`
            SELECT c.*, COUNT(cm.user_id) as member_count
            FROM channels c
            LEFT JOIN channel_members cm ON c.id = cm.channel_id
            WHERE c.id = ?
            GROUP BY c.id
        `)

        return stmt.get(id) as Channel | null
    }

    /**
     * Get a channel by name
     */
    getChannelByName(name: string): Channel | null {
        const stmt = this.db.prepare(`
            SELECT c.*, COUNT(cm.user_id) as member_count
            FROM channels c
            LEFT JOIN channel_members cm ON c.id = cm.channel_id
            WHERE c.name = ?
            GROUP BY c.id
        `)

        return stmt.get(name) as Channel | null
    }

    /**
     * Get a channel by slug
     * slug directly matches Galene group name (1:1 mapping)
     */
    getChannelBySlug(slug: string): Channel | null {
        const stmt = this.db.prepare(`
            SELECT c.*, COUNT(cm.user_id) as member_count
            FROM channels c
            LEFT JOIN channel_members cm ON c.id = cm.channel_id
            WHERE c.slug = ?
            GROUP BY c.id
        `)

        return stmt.get(slug) as Channel | null
    }

    /**
     * List all channels
     */
    async listChannels(): Promise<Channel[]> {
        const stmt = this.db.prepare(`
            SELECT c.*, COUNT(cm.user_id) as member_count
            FROM channels c
            LEFT JOIN channel_members cm ON c.id = cm.channel_id
            GROUP BY c.id
            ORDER BY c.created_at ASC
        `)

        return stmt.all() as Channel[]
    }

    /**
     * List channels that a user is a member of
     */
    listUserChannels(userId: string): Channel[] {
        const stmt = this.db.prepare(`
            SELECT c.*, COUNT(cm.user_id) as member_count
            FROM channels c
            INNER JOIN channel_members cm ON c.id = cm.channel_id
            WHERE cm.user_id = ?
            GROUP BY c.id
            ORDER BY c.created_at ASC
        `)

        return stmt.all(userId) as Channel[]
    }

    /**
     * Update a channel
     */
    async updateChannel(
        id: number,
        updates: Partial<Pick<Channel, 'name' | 'slug' | 'description' | 'is_default'>>,
    ): Promise<Channel | null> {
        const channel = this.getChannel(id)
        if (!channel) return null

        // If setting as default, unset all other defaults first
        if (updates.is_default !== undefined && updates.is_default === 1) {
            await this.unsetAllDefaults(id)
        }

        const fields = []
        const values = []

        if (updates.name !== undefined) {
            fields.push('name = ?')
            values.push(updates.name)
        }
        if (updates.slug !== undefined) {
            fields.push('slug = ?')
            values.push(updates.slug)
        }
        if (updates.description !== undefined) {
            fields.push('description = ?')
            values.push(updates.description)
        }
        if (updates.is_default !== undefined) {
            fields.push('is_default = ?')
            values.push(updates.is_default)
        }

        if (fields.length === 0) return channel

        const stmt = this.db.prepare(`
            UPDATE channels
            SET ${fields.join(', ')}
            WHERE id = ?
        `)

        stmt.run(...values, id)

        logger.info(`[ChannelManager] Updated channel ${id}`)
        return this.getChannel(id)
    }

    /**
     * Delete a channel
     */
    async deleteChannel(id: number): Promise<boolean> {
        const channel = this.getChannel(id)
        if (!channel) return false

        // Delete channel (cascade will handle members and messages)
        const stmt = this.db.prepare('DELETE FROM channels WHERE id = ?')
        stmt.run(id)

        logger.info(`[ChannelManager] Deleted channel "${channel.name}" (id: ${id})`)
        return true
    }

    /**
     * Add a user to a channel
     */
    async addMember(channelId: number, userId: string, role: 'member' | 'admin' = 'member'): Promise<boolean> {
        const now = Date.now()

        const stmt = this.db.prepare(`
            INSERT OR REPLACE INTO channel_members (channel_id, user_id, role, joined_at)
            VALUES (?, ?, ?, ?)
        `)

        stmt.run(channelId, userId, role, now)

        logger.info(`[ChannelManager] Added user ${userId} to channel ${channelId} as ${role}`)
        return true
    }

    /**
     * Remove a user from a channel
     */
    async removeMember(channelId: number, userId: string): Promise<boolean> {
        const stmt = this.db.prepare(`
            DELETE FROM channel_members
            WHERE channel_id = ? AND user_id = ?
        `)

        const result = stmt.run(channelId, userId)

        if (result.changes > 0) {
            logger.info(`[ChannelManager] Removed user ${userId} from channel ${channelId}`)
            return true
        }

        return false
    }

    /**
     * Get channel members
     */
    getChannelMembers(channelId: number): ChannelMember[] {
        const stmt = this.db.prepare(`
            SELECT cm.*, u.username, u.avatar
            FROM channel_members cm
            INNER JOIN users u ON cm.user_id = u.id
            WHERE cm.channel_id = ?
            ORDER BY cm.joined_at ASC
        `)

        return stmt.all(channelId) as ChannelMember[]
    }

    /**
     * Check if user is member of channel
     */
    isMember(channelId: number, userId: string): boolean {
        const stmt = this.db.prepare(`
            SELECT 1 FROM channel_members
            WHERE channel_id = ? AND user_id = ?
        `)

        return !!stmt.get(channelId, userId)
    }

    /**
     * Get user's role in channel
     */
    getUserRole(channelId: number, userId: string): 'member' | 'admin' | null {
        const stmt = this.db.prepare(`
            SELECT role FROM channel_members
            WHERE channel_id = ? AND user_id = ?
        `)

        const result = stmt.get(channelId, userId) as {role: string} | null
        return result?.role as 'member' | 'admin' | null
    }

    /**
     * Check if user can access channel
     * Channels are public by default - all authenticated users can access them
     * Membership is still tracked for role/permission purposes
     */
    canAccessChannel(channelId: number, userId: string): boolean {
        /*
         * All authenticated users can access channels (public by default)
         * Membership is still tracked for roles/permissions within channels
         */
        if (!userId) return false
        return true
    }

    /**
     * Get channels that need Galene group sync
     */
    async getChannelsForGaleneSync(): Promise<Channel[]> {
        return await this.listChannels()
    }

    /**
     * Sync a single channel to Galene group file
     * Creates the group file if it doesn't exist, updates it if it does
     */
    async syncChannelToGalene(channel: Channel): Promise<boolean> {
        try {
            // Channel slug directly matches Galene group name (1:1 mapping)
            const groupName = channel.slug

            // Check if SFU path is configured
            if (!config.sfu.path) {
                logger.warn(`[ChannelManager] SFU path not configured, skipping sync for channel "${channel.name}"`)
                return false
            }

            // Ensure groups directory exists
            const groupsPath = path.join(config.sfu.path, 'groups')
            await fs.ensureDir(groupsPath)

            const existingGroup = await loadGroup(groupName)

            let groupData
            if (existingGroup) {
                // Group file exists - update it with channel info
                logger.info(
                    `[ChannelManager] Updating existing Galene group file for channel "${channel.name}" (slug: ${groupName})`,
                )
                groupData = existingGroup
                // Ensure _name is set (required by saveGroup)
                if (!groupData._name) {
                    groupData._name = groupName
                }
                groupData.displayName = channel.name
                groupData.description = channel.description || ''
            } else {
                // Group file doesn't exist - create new one
                logger.info(`[ChannelManager] Creating new Galene group file for channel "${channel.name}" (slug: ${groupName})`)
                groupData = groupTemplate(groupName)
                groupData.displayName = channel.name
                groupData.description = channel.description || ''
            }

            // Save the group file in native Galene format (without op/other/presenter arrays)
            await this.saveGroupNativeGalene(groupName, groupData)
            logger.info(`[ChannelManager] Successfully synced channel "${channel.name}" to Galene group "${groupName}"`)
            return true
        } catch (error) {
            logger.error(`[ChannelManager] Failed to sync channel "${channel.name}" to Galene:`, error)
            // Log the actual error message for debugging
            if (error instanceof Error) {
                logger.error(`[ChannelManager] Error details: ${error.message}`)
                logger.error(`[ChannelManager] Stack trace: ${error.stack}`)
            }
            return false
        }
    }

    /**
     * Sync all channels to Galene group files
     * Creates group files for channels that don't have them yet
     */
    async syncAllChannelsToGalene(): Promise<{failed: number; success: number}> {
        try {
            const channels = await this.listChannels()
            let success = 0
            let failed = 0

            logger.info(`[ChannelManager] Syncing ${channels.length} channels to Galene groups`)

            for (const channel of channels) {
                const result = await this.syncChannelToGalene(channel)
                if (result) {
                    success++
                } else {
                    failed++
                }
            }

            logger.info(`[ChannelManager] Sync complete: ${success} succeeded, ${failed} failed`)
            return {failed, success}
        } catch (error) {
            logger.error('[ChannelManager] Failed to sync channels to Galene:', error)
            return {failed: 0, success: 0}
        }
    }

    /**
     * Save group file in native Galene format (without Pyrite-specific op/other/presenter arrays)
     * Galene only understands the native format with users dictionary
     */
    private async saveGroupNativeGalene(groupName: string, groupData: Record<string, unknown>): Promise<void> {
        // Create a clean copy without Pyrite-specific fields
        const nativeData: Record<string, unknown> = {
            // Copy all native Galene fields
            'allow-anonymous': groupData['allow-anonymous'] ?? false,
            'allow-recording': groupData['allow-recording'] ?? true,
            'allow-subgroups': groupData['allow-subgroups'] ?? true,
            autokick: groupData.autokick ?? false,
            autolock: groupData.autolock ?? false,
            codecs: groupData.codecs ?? ['opus', 'vp8'],
            comment: groupData.comment ?? '',
            contact: groupData.contact ?? '',
            description: groupData.description ?? '',
            displayName: groupData.displayName ?? groupName,
            'max-clients': groupData['max-clients'] ?? 10,
            'max-history-age': groupData['max-history-age'] ?? 14400,
            public: groupData.public ?? false,
        }

        // Handle wildcard-user for public access (native Galene format)
        if (groupData['allow-anonymous'] || groupData.public) {
            nativeData['wildcard-user'] = {
                password: {type: 'wildcard'},
                permissions: 'present',
            }
        }

        // Include users dictionary if it exists (required for Galene)
        if (groupData.users && typeof groupData.users === 'object' && !Array.isArray(groupData.users)) {
            nativeData.users = groupData.users
        } else {
            // Ensure users dictionary exists (even if empty)
            nativeData.users = {}
        }

        /*
         * Remove any Pyrite-specific fields that shouldn't be in the file
         * (op, other, presenter arrays are for Pyrite internal use only)
         */

        // Write the native Galene format file
        const groupsPath = path.join(config.sfu.path, 'groups')
        const groupFile = path.join(groupsPath, `${groupName}.json`)
        await fs.writeFile(groupFile, JSON.stringify(nativeData, null, 2))
    }

    /**
     * Get the default channel
     */
    getDefaultChannel(): Channel | null {
        const stmt = this.db.prepare(`
            SELECT c.*, COUNT(cm.user_id) as member_count
            FROM channels c
            LEFT JOIN channel_members cm ON c.id = cm.channel_id
            WHERE c.is_default = 1
            GROUP BY c.id
            LIMIT 1
        `)

        return stmt.get() as Channel | null
    }

    /**
     * Unset all default channels (except optionally one channel ID)
     */
    private async unsetAllDefaults(exceptChannelId?: number): Promise<void> {
        if (exceptChannelId) {
            const stmt = this.db.prepare(`
                UPDATE channels
                SET is_default = 0
                WHERE is_default = 1 AND id != ?
            `)
            stmt.run(exceptChannelId)
        } else {
            const stmt = this.db.prepare(`
                UPDATE channels
                SET is_default = 0
                WHERE is_default = 1
            `)
            stmt.run()
        }
    }

    /**
     * Delete Galene group file for a channel
     */
    async deleteGaleneGroup(slug: string): Promise<boolean> {
        try {
            const groupFile = path.join(config.sfu.path, 'groups', `${slug}.json`)
            if (await fs.pathExists(groupFile)) {
                await fs.remove(groupFile)
                logger.info(`[ChannelManager] Deleted Galene group file: ${groupFile}`)
                return true
            }
            logger.warn(`[ChannelManager] Galene group file not found: ${groupFile}`)
            return false
        } catch (error) {
            logger.error(`[ChannelManager] Failed to delete Galene group file for slug "${slug}":`, error)
            return false
        }
    }
}
