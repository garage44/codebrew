import {Database} from 'bun:sqlite'
import fs from 'fs-extra'
import {homedir} from 'node:os'
import path from 'node:path'

/**
 * Common database initialization for user management
 * Shared between Expressio and Pyrite
 */

/**
 * Create the users table schema
 * This is the common table used by UserManager for all services
 * Only creates the table if it doesn't already exist
 */
export function createUsersTable(db: Database, logger?: Logger): boolean {
    // Check if table already exists
    const tableExistsStmt = db.prepare(`
        SELECT name FROM sqlite_master
        WHERE type='table' AND name='users'
    `)
    const result = tableExistsStmt.get() as {name: string} | null | undefined

    // Debug logging
    if (logger) {
        logger.info(`[Database] Checking if users table exists... Result: ${result ? JSON.stringify(result) : 'null/undefined'}`)
    }

    const tableExists = result !== null && result !== undefined

    // Only create if it doesn't exist
    if (!tableExists) {
        if (logger) {
            logger.info('[Database] Users table does not exist, creating it...')
        }
        db.exec(`
            CREATE TABLE users (
                id TEXT PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                permissions TEXT NOT NULL DEFAULT '{}',
                avatar TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            )
        `)
        // Table was created
        return true
    }
    if (logger) {
        logger.info('[Database] Users table already exists')
    }
    // Table already existed
    return false
}

/**
 * Initialize database connection with common setup
 * @param dbPath Path to database file (defaults to ~/.{appName}.db)
 * @param appName Application name (e.g., 'expressio', 'pyrite')
 * @param logger Optional logger instance
 * @returns Initialized database instance
 */
interface Logger {
    info(message: string): void
    warn?(message: string): void
}

export function initDatabase(dbPath?: string, appName?: string, logger?: Logger): Database {
    // Check for environment variable first (for PR deployments and isolated instances)
    const envDbPath = process.env.DB_PATH
    const finalPath = dbPath || envDbPath || (appName ? path.join(homedir(), `.${appName}.db`) : path.join(homedir(), '.app.db'))

    if (logger) {
        logger.info(`[Database] Initializing SQLite database at ${finalPath}`)
    }

    // Check if database file exists
    const dbExists = fs.pathExistsSync(finalPath)

    if (logger) {
        logger.info(`[Database] Database file exists: ${dbExists}`)
    }

    /*
     * WAL/SHM files are normal parts of SQLite's WAL mode operation
     * They contain uncommitted changes that will be merged back into the main database
     * Deleting them can cause data loss or make the database appear empty/corrupted
     * Only clean up WAL/SHM files if database file doesn't exist (fresh install scenario)
     */
    if (!dbExists) {
        const walPath = `${finalPath}-wal`
        const shmPath = `${finalPath}-shm`

        /*
         * If database doesn't exist, clean up any orphaned WAL/SHM files
         * (these would be from a previous installation that was deleted)
         */
        try {
            if (fs.pathExistsSync(walPath)) {
                fs.removeSync(walPath)
                if (logger) {
                    logger.info(`[Database] Removed orphaned WAL file: ${walPath}`)
                }
            }
            if (fs.pathExistsSync(shmPath)) {
                fs.removeSync(shmPath)
                if (logger) {
                    logger.info(`[Database] Removed orphaned SHM file: ${shmPath}`)
                }
            }
        } catch (cleanupError) {
            if (logger) {
                logger.warn?.(`[Database] Cleanup warning: ${cleanupError}`)
            }
        }
    }

    // Create database (will create new file if it doesn't exist)
    const db = new Database(finalPath, {create: true})

    /*
     * Enable WAL mode for better concurrent access (only if not already in WAL mode)
     * Don't force WAL mode if database already exists - it might already have a different journal mode
     */
    if (dbExists) {
        // Check current journal mode
        const journalModeStmt = db.prepare('PRAGMA journal_mode')
        const currentMode = journalModeStmt.get() as {journal_mode: string} | undefined
        if (logger) {
            logger.info(`[Database] Current journal mode: ${currentMode?.journal_mode || 'unknown'}`)
        }
        // Only set WAL mode if not already set (don't force it)
        if (currentMode?.journal_mode !== 'wal') {
            db.exec('PRAGMA journal_mode = WAL')
            if (logger) {
                logger.info('[Database] Set journal mode to WAL')
            }
        }
    } else {
        // New database - set WAL mode
        db.exec('PRAGMA journal_mode = WAL')
        if (logger) {
            logger.info('[Database] New database, set journal mode to WAL')
        }
    }

    db.exec('PRAGMA foreign_keys = ON')

    // Create common users table (only if it doesn't exist)
    const tableWasCreated = createUsersTable(db, logger)

    if (logger) {
        if (tableWasCreated) {
            logger.info('[Database] Common users table created successfully')
        } else {
            logger.info('[Database] Common users table already exists, skipping creation')
        }
    }

    return db
}
