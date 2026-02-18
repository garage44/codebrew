import type {Database} from 'bun:sqlite'

import {initDatabase as initCommonDatabase} from '@garage44/common/lib/database'
import {homedir} from 'node:os'
import path from 'node:path'

import {logger} from '../service.ts'

/**
 * SQLite Database for Pyrite
 * Manages Pyrite-specific tables: channels, channel members, and chat messages
 * Users table is managed by common database initialization
 */

let db: Database | null = null

export interface Channel {
    created_at: number
    description: string
    id: number
    is_default: number
    name: string
    slug: string
}

export interface ChannelMember {
    channel_id: number
    joined_at: number
    // 'member' | 'admin'
    role: string
    // TEXT to match users.id (UUID string from common database)
    user_id: string
}

export interface Message {
    channel_id: number
    id: number
    // 'message' | 'me' | 'system'
    kind: string
    message: string
    timestamp: number
    // TEXT to match users.id (UUID string from common database)
    user_id: string
    username: string
}

/**
 * Initialize the database connection and create tables if needed
 * Uses common database initialization for users table
 */
export function initDatabase(dbPath?: string): Database {
    if (db) {
        return db
    }

    // Check for environment variable first (for PR deployments and isolated instances)
    const envDbPath = process.env.DB_PATH
    const finalPath = dbPath || envDbPath || path.join(homedir(), '.pyrite.db')

    // Initialize common database (creates users table)
    db = initCommonDatabase(finalPath, 'pyrite', logger)

    // Create Pyrite-specific tables
    createPyriteTables()

    return db
}

/**
 * Create Pyrite-specific database tables
 * Users table is created by common database initialization
 */
function createPyriteTables() {
    if (!db) {
        throw new Error('Database not initialized')
    }

    // Channels table
    db.exec(`
        CREATE TABLE IF NOT EXISTS channels (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            slug TEXT UNIQUE NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            created_at INTEGER NOT NULL,
            is_default INTEGER NOT NULL DEFAULT 0
        )
    `)

    // Create index on slug for performance
    db.exec('CREATE INDEX IF NOT EXISTS idx_channels_slug ON channels(slug)')

    // Add is_default column if it doesn't exist (migration for existing databases)
    try {
        // Check if column exists by querying table info
        const tableInfo = db.prepare('PRAGMA table_info(channels)').all() as {name: string}[]
        const hasIsDefaultColumn = tableInfo.some((col) => col.name === 'is_default')
        if (!hasIsDefaultColumn) {
            db.exec('ALTER TABLE channels ADD COLUMN is_default INTEGER NOT NULL DEFAULT 0')
            logger.info('[db] added is_default column to channels table')
        }
    } catch (alterError) {
        logger.warn('[db] failed to check/add is_default column:', alterError)
    }

    /*
     * Channel members table
     * Note: user_id is TEXT to match users.id (UUID string from common database)
     */
    db.exec(`
        CREATE TABLE IF NOT EXISTS channel_members (
            channel_id INTEGER NOT NULL,
            user_id TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'member',
            joined_at INTEGER NOT NULL,
            PRIMARY KEY (channel_id, user_id),
            FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `)

    /*
     * Messages table
     * Note: user_id is TEXT to match users.id (UUID string from common database)
     */
    db.exec(`
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            channel_id INTEGER NOT NULL,
            user_id TEXT NOT NULL,
            username TEXT NOT NULL,
            message TEXT NOT NULL,
            timestamp INTEGER NOT NULL,
            kind TEXT NOT NULL DEFAULT 'message',
            FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `)

    // Create indexes for performance
    db.exec('CREATE INDEX IF NOT EXISTS idx_messages_channel_timestamp ON messages(channel_id, timestamp DESC)')
    db.exec('CREATE INDEX IF NOT EXISTS idx_channel_members_user ON channel_members(user_id)')

    logger.info('[db] pyrite-specific tables created successfully')
}

/**
 * Initialize Pyrite-specific default data if database is empty
 * User initialization is handled by UserManager in common service
 */
export async function initializeDefaultData() {
    if (!db) {
        throw new Error('Database not initialized')
    }

    try {
        // Check if we have any channels
        const channelCountStmt = db.prepare('SELECT COUNT(*) as count FROM channels')
        const channelCount = channelCountStmt.get() as {count: number} | undefined

        if (!channelCount || channelCount.count === 0) {
            logger.info('[db] initializing pyrite default data...')

            // Get the admin user ID (created by UserManager)
            const adminUserQuery = db.prepare('SELECT id, username FROM users WHERE username = ?')
            const adminUser = adminUserQuery.get('admin') as {id: string; username: string} | undefined

            if (!adminUser) {
                logger.warn('[db] admin user not found, skipping pyrite default data initialization')
                logger.warn('[db] available users:', db.prepare('SELECT id, username FROM users').all())
                return
            }

            logger.info(`[db] found admin user: ${adminUser.username} (${adminUser.id})`)

            const now = Date.now()

            /*
             * Create default "general" channel
             * slug directly matches Galene group name (1:1 mapping)
             */
            const channelInsert = db.prepare(`
                INSERT INTO channels (name, slug, description, created_at)
                VALUES (?, ?, ?, ?)
            `)
            const channelResult = channelInsert.run('general', 'general', 'General discussion channel', now)
            const channelId = channelResult.lastInsertRowid as number

            if (!channelId || channelId <= 0) {
                logger.error('[db] failed to create general channel - no channel id returned')
                return
            }

            logger.info(`[db] created general channel (id: ${channelId})`)

            // Add admin to general channel
            const memberInsert = db.prepare(`
                INSERT INTO channel_members (channel_id, user_id, role, joined_at)
                VALUES (?, ?, ?, ?)
            `)
            memberInsert.run(channelId, adminUser.id, 'admin', now)

            logger.info(`[db] added admin user (${adminUser.username}) to general channel`)

            // Create default "pyrite" channel
            const pyriteChannelResult = channelInsert.run('pyrite', 'pyrite', 'Pyrite discussion channel', now)
            const pyriteChannelId = pyriteChannelResult.lastInsertRowid as number

            if (!pyriteChannelId || pyriteChannelId <= 0) {
                logger.error('[db] failed to create pyrite channel - no channel id returned')
            } else {
                logger.info(`[db] created pyrite channel (id: ${pyriteChannelId})`)

                // Add admin to pyrite channel
                memberInsert.run(pyriteChannelId, adminUser.id, 'admin', now)
                logger.info(`[db] added admin user (${adminUser.username}) to pyrite channel`)
            }

            // Sync default channels to Galene groups
            try {
                const {ChannelManager} = await import('./channel-manager.ts')
                const channelManager = new ChannelManager(db)
                const syncResult = await channelManager.syncAllChannelsToGalene()
                logger.info(`[db] synced ${syncResult.success} default channel(s) to galene groups`)
                if (syncResult.failed > 0) {
                    logger.warn(`[db] failed to sync ${syncResult.failed} channel(s) to galene`)
                }
            } catch (syncError) {
                logger.error('[db] failed to sync default channels to galene (non-fatal):', syncError)
                // Don't fail initialization if sync fails - channels are still created
            }

            // Sync users to Galene (global config.json and group files)
            try {
                const {syncUsersToGalene} = await import('./sync.ts')
                await syncUsersToGalene()
                logger.info('[db] synced users to galene (global config and group files)')
            } catch (syncError) {
                logger.error('[db] failed to sync users to galene (non-fatal):', syncError)
                // Don't fail initialization if sync fails - users can be synced later
            }

            logger.info('[db] pyrite default data initialization completed successfully')
        } else {
            logger.info(`[db] channels already exist (${channelCount.count}), skipping default data initialization`)
        }
    } catch (error) {
        logger.error('[db] error initializing pyrite default data:', error)
        throw error
    }
}

/**
 * Get database instance
 */
export function getDatabase(): Database {
    if (!db) {
        throw new Error('Database not initialized. Call initDatabase() first.')
    }
    return db
}

/**
 * Close database connection
 */
export function closeDatabase() {
    if (db) {
        db.close()
        db = null
        logger.info('[db] connection closed')
    }
}
