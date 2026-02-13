import {initDatabase as initCommonDatabase} from '@garage44/common/lib/database'
import {Database} from 'bun:sqlite'
import {homedir} from 'node:os'
import path from 'node:path'

import {logger} from '../service.ts'
import {config} from './config.ts'

/**
 * SQLite Database for Nonlinear
 * Manages Nonlinear-specific tables: repositories, tickets, comments, agents, ci_runs
 * Users table is managed by common database initialization
 */

let db: Database | null = null

export interface Repository {
    config: string
    // JSON string
    created_at: number
    id: string
    name: string
    path: string
    platform: 'github' | 'gitlab' | 'local'
    remote_url: string | null
    updated_at: number
}

export interface Ticket {
    assignee_id: string | null
    assignee_type: 'agent' | 'human' | null
    assignees?: Array<{assignee_id: string; assignee_type: 'agent' | 'human'}>
    branch_name: string | null
    created_at: number
    description: string | null
    id: string
    // Populated via JOINs for API responses
    labels?: string[]
    merge_request_id: string | null
    priority: number | null
    repository_id: string
    solution_plan: string | null
    status: 'backlog' | 'todo' | 'in_progress' | 'review' | 'closed'
    title: string
    updated_at: number
}

export interface TicketLabel {
    label: string
    ticket_id: string
}

export interface TicketAssignee {
    assignee_id: string
    assignee_type: 'agent' | 'human'
    ticket_id: string
}

export interface Comment {
    author_id: string
    author_type: 'agent' | 'human'
    content: string
    created_at: number
    id: string
    mentions: string | null
    // JSON array string
    responding_to: string | null
    status: 'generating' | 'completed' | 'failed'
    ticket_id: string
    updated_at?: number
}

export interface Agent {
    avatar: string | null
    config: string
    // JSON string
    created_at: number
    display_name: string | null
    enabled: number
    // SQLite boolean (0 or 1)
    id: string
    name: string
    status: 'idle' | 'working' | 'error' | 'offline'
    type: 'planner' | 'developer' | 'reviewer'
}

export interface AgentTask {
    agent_id: string
    completed_at: number | null
    created_at: number
    error: string | null
    id: string
    priority: number
    started_at: number | null
    status: 'pending' | 'processing' | 'completed' | 'failed'
    task_data: string
    // JSON string
    task_type: 'mention' | 'assignment' | 'manual' | 'refinement'
}

export interface CIRun {
    completed_at: number | null
    fixes_applied: string | null
    // JSON array string
    id: string
    output: string | null
    started_at: number
    status: 'running' | 'success' | 'failed' | 'fixed'
    ticket_id: string
}

export interface LabelDefinition {
    color: string
    created_at: number
    id: string
    name: string
    updated_at: number
}

export interface Documentation {
    author_id: string
    content: string
    created_at: number
    id: string
    path: string
    title: string
    updated_at: number
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
    const finalPath = dbPath || envDbPath || path.join(homedir(), '.nonlinear.db')

    // Initialize common database (creates users table)
    db = initCommonDatabase(finalPath, 'nonlinear', logger)

    // Load sqlite-vec extension for vector search
    loadVecExtension(db)

    // Create Nonlinear-specific tables
    createNonlinearTables()

    // Initialize fixtures in development mode (async, non-blocking)
    if ((process.env.NODE_ENV === 'development' || process.env.BUN_ENV === 'development') && db) {
        const workspaceCount = db.prepare('SELECT COUNT(*) as count FROM repositories').get() as {count: number} | undefined
        if (!workspaceCount || workspaceCount.count === 0) {
            /*
             * Database is empty, initialize fixtures
             * Use dynamic import to avoid blocking initialization
             */
            Promise.all([import('./fixtures.ts'), import('./workspace.ts')])
                .then(([{initializeFixtures}, {findWorkspaceRoot}]) => {
                    const workspaceRoot = findWorkspaceRoot() || process.cwd()
                    logger.info(`[Database] Initializing fixtures from ${workspaceRoot}`)
                    return initializeFixtures(db!, workspaceRoot)
                })
                .catch((error) => {
                    logger.error('[Database] Failed to initialize fixtures:', error)
                })
        } else {
            logger.info('[Database] Workspace already exists, skipping fixture initialization')
        }
    }

    return db
}

/**
 * Load sqlite-vec extension
 */
function loadVecExtension(db: Database): void {
    try {
        /*
         * Use sqlite-vec's load() function which handles platform-specific binaries
         * It finds vec0.so in the platform-specific package (e.g., sqlite-vec-linux-x64)
         */
        if (typeof db.loadExtension === 'function') {
            // Try CommonJS require first (works in Bun)
            try {
                const {load} = require('sqlite-vec')
                load(db)
                logger.info('[Database] Loaded sqlite-vec extension')
                return
            } catch (_requireError) {
                // Fallback to ES module import
                import('sqlite-vec')
                    .then(({load}) => {
                        load(db)
                        logger.info('[Database] Loaded sqlite-vec extension')
                    })
                    .catch((importError) => {
                        logger.warn('[Database] Failed to load sqlite-vec extension via import:', importError)
                    })
            }
        } else {
            logger.warn('[Database] Database does not support loadExtension')
        }
    } catch (error) {
        logger.warn('[Database] Failed to load sqlite-vec extension:', error)
        // Continue without vector search - can add embeddings later
    }
}

/**
 * Create Nonlinear-specific database tables
 * Users table is created by common database initialization
 */
function createNonlinearTables() {
    if (!db) throw new Error('Database not initialized')

    // Repositories table
    db.exec(`
        CREATE TABLE IF NOT EXISTS repositories (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            path TEXT NOT NULL,
            platform TEXT NOT NULL,
            remote_url TEXT,
            config TEXT NOT NULL DEFAULT '{}',
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )
    `)

    // Tickets table
    db.exec(`
        CREATE TABLE IF NOT EXISTS tickets (
            id TEXT PRIMARY KEY,
            repository_id TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT,
            solution_plan TEXT,
            status TEXT NOT NULL,
            priority INTEGER,
            assignee_type TEXT,
            assignee_id TEXT,
            branch_name TEXT,
            merge_request_id TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            FOREIGN KEY (repository_id) REFERENCES repositories(id) ON DELETE CASCADE
        )
    `)

    // Create index on status for faster queries
    db.exec('CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status)')
    db.exec('CREATE INDEX IF NOT EXISTS idx_tickets_repository_id ON tickets(repository_id)')

    // Comments table
    db.exec(`
        CREATE TABLE IF NOT EXISTS comments (
            id TEXT PRIMARY KEY,
            ticket_id TEXT NOT NULL,
            author_type TEXT NOT NULL,
            author_id TEXT NOT NULL,
            content TEXT NOT NULL,
            mentions TEXT,
            responding_to TEXT,
            status TEXT NOT NULL DEFAULT 'completed',
            created_at INTEGER NOT NULL,
            updated_at INTEGER,
            FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
        )
    `)

    // Migrate existing comments table if needed (add new columns)
    try {
        db.exec(`
            ALTER TABLE comments ADD COLUMN responding_to TEXT
        `)
    } catch {
        // Column already exists, ignore
    }
    try {
        db.exec(`
            ALTER TABLE comments ADD COLUMN status TEXT NOT NULL DEFAULT 'completed'
        `)
    } catch {
        // Column already exists, ignore
    }
    try {
        db.exec(`
            ALTER TABLE comments ADD COLUMN updated_at INTEGER
        `)
    } catch {
        // Column already exists, ignore
    }

    // Create index on ticket_id for faster comment queries
    db.exec('CREATE INDEX IF NOT EXISTS idx_comments_ticket_id ON comments(ticket_id)')
    db.exec('CREATE INDEX IF NOT EXISTS idx_comments_responding_to ON comments(responding_to)')
    db.exec('CREATE INDEX IF NOT EXISTS idx_comments_status ON comments(status)')

    // Agents table
    db.exec(`
        CREATE TABLE IF NOT EXISTS agents (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            type TEXT NOT NULL,
            config TEXT NOT NULL DEFAULT '{}',
            enabled INTEGER NOT NULL DEFAULT 1,
            avatar TEXT,
            display_name TEXT,
            status TEXT NOT NULL DEFAULT 'idle',
            created_at INTEGER NOT NULL
        )
    `)

    // Migrate existing agents table if needed (add new columns)
    try {
        db.exec(`
            ALTER TABLE agents ADD COLUMN avatar TEXT
        `)
    } catch {
        // Column already exists, ignore
    }
    try {
        db.exec(`
            ALTER TABLE agents ADD COLUMN display_name TEXT
        `)
    } catch {
        // Column already exists, ignore
    }
    try {
        db.exec(`
            ALTER TABLE agents ADD COLUMN status TEXT NOT NULL DEFAULT 'idle'
        `)
    } catch {
        // Column already exists, ignore
    }

    // Agent tasks table
    db.exec(`
        CREATE TABLE IF NOT EXISTS agent_tasks (
            id TEXT PRIMARY KEY,
            agent_id TEXT NOT NULL,
            task_type TEXT NOT NULL,
            task_data TEXT NOT NULL,
            status TEXT NOT NULL,
            priority INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL,
            started_at INTEGER,
            completed_at INTEGER,
            error TEXT,
            FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
        )
    `)

    // Create indexes on agent_tasks for efficient queries
    db.exec('CREATE INDEX IF NOT EXISTS idx_agent_tasks_agent_status ON agent_tasks(agent_id, status)')
    db.exec('CREATE INDEX IF NOT EXISTS idx_agent_tasks_created ON agent_tasks(created_at)')
    db.exec('CREATE INDEX IF NOT EXISTS idx_agent_tasks_priority ON agent_tasks(priority DESC, created_at ASC)')

    // CI runs table
    db.exec(`
        CREATE TABLE IF NOT EXISTS ci_runs (
            id TEXT PRIMARY KEY,
            ticket_id TEXT NOT NULL,
            status TEXT NOT NULL,
            output TEXT,
            fixes_applied TEXT,
            started_at INTEGER NOT NULL,
            completed_at INTEGER,
            FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
        )
    `)

    // Create index on ticket_id for faster CI run queries
    db.exec('CREATE INDEX IF NOT EXISTS idx_ci_runs_ticket_id ON ci_runs(ticket_id)')

    // Ticket labels junction table
    db.exec(`
        CREATE TABLE IF NOT EXISTS ticket_labels (
            ticket_id TEXT NOT NULL,
            label TEXT NOT NULL,
            PRIMARY KEY (ticket_id, label),
            FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
        )
    `)

    // Create indexes on ticket_labels
    db.exec('CREATE INDEX IF NOT EXISTS idx_ticket_labels_ticket_id ON ticket_labels(ticket_id)')
    db.exec('CREATE INDEX IF NOT EXISTS idx_ticket_labels_label ON ticket_labels(label)')

    // Ticket assignees junction table
    db.exec(`
        CREATE TABLE IF NOT EXISTS ticket_assignees (
            ticket_id TEXT NOT NULL,
            assignee_type TEXT NOT NULL,
            assignee_id TEXT NOT NULL,
            PRIMARY KEY (ticket_id, assignee_type, assignee_id),
            FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
        )
    `)

    // Create indexes on ticket_assignees
    db.exec('CREATE INDEX IF NOT EXISTS idx_ticket_assignees_ticket_id ON ticket_assignees(ticket_id)')
    db.exec('CREATE INDEX IF NOT EXISTS idx_ticket_assignees_assignee ON ticket_assignees(assignee_type, assignee_id)')

    // Label definitions table
    db.exec(`
        CREATE TABLE IF NOT EXISTS label_definitions (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            color TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )
    `)

    // Create index on name for faster lookups
    db.exec('CREATE INDEX IF NOT EXISTS idx_label_definitions_name ON label_definitions(name)')

    // Documentation table
    db.exec(`
        CREATE TABLE IF NOT EXISTS documentation (
            id TEXT PRIMARY KEY,
            path TEXT NOT NULL UNIQUE,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            author_id TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )
    `)

    // Documentation labels junction table (reuses label_definitions)
    db.exec(`
        CREATE TABLE IF NOT EXISTS documentation_labels (
            doc_id TEXT NOT NULL,
            label TEXT NOT NULL,
            PRIMARY KEY (doc_id, label),
            FOREIGN KEY (doc_id) REFERENCES documentation(id) ON DELETE CASCADE,
            FOREIGN KEY (label) REFERENCES label_definitions(name) ON DELETE CASCADE
        )
    `)

    // Indexes for documentation
    db.exec('CREATE INDEX IF NOT EXISTS idx_docs_path ON documentation(path)')
    db.exec('CREATE INDEX IF NOT EXISTS idx_docs_labels_doc ON documentation_labels(doc_id)')
    db.exec('CREATE INDEX IF NOT EXISTS idx_docs_labels_label ON documentation_labels(label)')

    // Documentation chunks metadata table
    db.exec(`
        CREATE TABLE IF NOT EXISTS documentation_chunks (
            id TEXT PRIMARY KEY,
            doc_id TEXT NOT NULL,
            chunk_index INTEGER NOT NULL,
            chunk_text TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            FOREIGN KEY (doc_id) REFERENCES documentation(id) ON DELETE CASCADE
        )
    `)

    db.exec('CREATE INDEX IF NOT EXISTS idx_chunks_doc ON documentation_chunks(doc_id)')

    // Ticket embeddings metadata table
    db.exec(`
        CREATE TABLE IF NOT EXISTS ticket_embeddings (
            id TEXT PRIMARY KEY,
            ticket_id TEXT NOT NULL,
            embedding_text TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
        )
    `)

    db.exec('CREATE INDEX IF NOT EXISTS idx_ticket_embeddings_ticket ON ticket_embeddings(ticket_id)')

    /*
     * Vector search table (vec0 virtual table)
     * Only create if sqlite-vec extension is loaded
     */
    try {
        // Get embedding dimension from config (defaults based on provider)
        const embeddingDim =
            config.embeddings.dimension ||
            (config.embeddings.provider === 'local' ? 384 : config.embeddings.provider === 'openai' ? 1536 : 1024)

        // Check if vec0 table exists with different dimension
        const existingTable = db
            .prepare(`
            SELECT name FROM sqlite_master
            WHERE type='table' AND name='vec_content'
        `)
            .get()

        if (existingTable) {
            /*
             * Table exists - check if we need to recreate it
             * Note: vec0 tables can't be altered, so we'd need to drop and recreate
             * For now, just log a warning if dimension might mismatch
             */
            logger.info(`[Database] vec0 table already exists, using dimension: ${embeddingDim}`)
        } else {
            // Create new table with correct dimension
            db.exec(`
                CREATE VIRTUAL TABLE vec_content USING vec0(
                    embedding float[${embeddingDim}],
                    content_type TEXT NOT NULL,
                    content_id TEXT NOT NULL,
                    chunk_index INTEGER,
                    chunk_text TEXT NOT NULL,
                    metadata TEXT
                )
            `)
            logger.info(`[Database] Created vec0 virtual table for vector search (dimension: ${embeddingDim})`)
        }
    } catch (error) {
        logger.warn('[Database] Failed to create vec0 table (sqlite-vec may not be loaded):', error)
    }

    /*
     * Code embeddings table (vec0 virtual table)
     * Only create if sqlite-vec extension is loaded
     */
    try {
        const embeddingDim =
            config.embeddings.dimension ||
            (config.embeddings.provider === 'local' ? 384 : config.embeddings.provider === 'openai' ? 1536 : 1024)

        // Check if code_embeddings table exists
        const existingCodeTable = db
            .prepare(`
            SELECT name FROM sqlite_master
            WHERE type='table' AND name='code_embeddings'
        `)
            .get()

        if (!existingCodeTable) {
            db.exec(`
                CREATE VIRTUAL TABLE code_embeddings USING vec0(
                    embedding float[${embeddingDim}],
                    repository_id TEXT NOT NULL,
                    file_path TEXT NOT NULL,
                    file_hash TEXT NOT NULL,
                    chunk_index INTEGER NOT NULL,
                    chunk_type TEXT,
                    chunk_name TEXT,
                    chunk_text TEXT NOT NULL,
                    start_line INTEGER,
                    end_line INTEGER,
                    metadata TEXT
                )
            `)
            logger.info(`[Database] Created code_embeddings vec0 table (dimension: ${embeddingDim})`)
        }
    } catch (error) {
        logger.warn('[Database] Failed to create code_embeddings table (sqlite-vec may not be loaded):', error)
    }

    // Indexing jobs table
    db.exec(`
        CREATE TABLE IF NOT EXISTS indexing_jobs (
            id TEXT PRIMARY KEY,
            type TEXT NOT NULL,
            repository_id TEXT,
            file_path TEXT,
            doc_id TEXT,
            ticket_id TEXT,
            status TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            started_at INTEGER,
            completed_at INTEGER,
            error TEXT,
            FOREIGN KEY (repository_id) REFERENCES repositories(id)
        )
    `)

    db.exec('CREATE INDEX IF NOT EXISTS idx_indexing_jobs_repo ON indexing_jobs(repository_id)')
    db.exec('CREATE INDEX IF NOT EXISTS idx_indexing_jobs_status ON indexing_jobs(status)')

    /*
     * Note: code_embeddings is a virtual table (vec0) and cannot have indexes created on it
     * Virtual tables handle their own indexing internally
     */

    // Initialize preset tags
    initializePresetTags()

    // Migrate existing assignee data from tickets table to ticket_assignees
    migrateAssigneeData()

    // Migrate existing labels to label definitions
    migrateLabelsToDefinitions()

    logger.info('[Database] Nonlinear tables initialized')
}

/**
 * Migrate existing assignee data from tickets table to ticket_assignees junction table
 * This maintains backward compatibility while transitioning to multiple assignees
 */
function migrateAssigneeData() {
    if (!db) throw new Error('Database not initialized')

    try {
        // Get all tickets with assignees
        const ticketsWithAssignees = db
            .prepare(`
            SELECT id, assignee_type, assignee_id
            FROM tickets
            WHERE assignee_type IS NOT NULL AND assignee_id IS NOT NULL
        `)
            .all() as Array<{
            assignee_id: string
            assignee_type: string
            id: string
        }>

        const insertStmt = db.prepare(`
            INSERT OR IGNORE INTO ticket_assignees (ticket_id, assignee_type, assignee_id)
            VALUES (?, ?, ?)
        `)

        let migratedCount = 0
        for (const ticket of ticketsWithAssignees) {
            try {
                insertStmt.run(ticket.id, ticket.assignee_type, ticket.assignee_id)
                migratedCount++
            } catch {
                // Already exists, skip
            }
        }

        if (migratedCount > 0) {
            logger.info(`[Database] Migrated ${migratedCount} existing assignees to ticket_assignees table`)
        }
    } catch (error) {
        logger.warn(`[Database] Error migrating assignee data: ${error}`)
        // Don't throw - migration failure shouldn't block initialization
    }
}

/**
 * Migrate existing labels from ticket_labels to label_definitions
 * Creates label definitions for any labels that don't exist yet
 */
function migrateLabelsToDefinitions() {
    if (!db) throw new Error('Database not initialized')

    try {
        // Get all unique labels from ticket_labels
        const existingLabels = db
            .prepare(`
            SELECT DISTINCT label FROM ticket_labels
        `)
            .all() as Array<{label: string}>

        // Default color palette for labels
        const defaultColors = ['var(--info-6)', 'var(--success-6)', 'var(--warning-6)', 'var(--danger-6)', 'var(--primary-6)']

        const insertStmt = db.prepare(`
            INSERT OR IGNORE INTO label_definitions (id, name, color, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?)
        `)

        let migratedCount = 0
        const now = Date.now()
        for (let i = 0; i < existingLabels.length; i++) {
            const label = existingLabels[i].label
            const color = defaultColors[i % defaultColors.length]
            const labelId = `label-${label.toLowerCase().replaceAll(/[^a-z0-9]/g, '-')}`

            try {
                insertStmt.run(labelId, label, color, now, now)
                migratedCount++
            } catch {
                // Already exists, skip
            }
        }

        if (migratedCount > 0) {
            logger.info(`[Database] Migrated ${migratedCount} existing labels to label_definitions table`)
        }
    } catch (error) {
        logger.warn(`[Database] Error migrating labels: ${error}`)
        // Don't throw - migration failure shouldn't block initialization
    }
}

/**
 * Get all labels for a ticket
 */
export function getTicketLabels(ticketId: string): string[] {
    if (!db) throw new Error('Database not initialized')
    const labels = db
        .prepare(`
        SELECT label FROM ticket_labels WHERE ticket_id = ?
    `)
        .all(ticketId) as Array<{label: string}>
    return labels.map((l) => l.label)
}

/**
 * Add a label to a ticket
 */
export function addTicketLabel(ticketId: string, label: string): void {
    if (!db) throw new Error('Database not initialized')
    try {
        db.prepare(`
            INSERT INTO ticket_labels (ticket_id, label)
            VALUES (?, ?)
        `).run(ticketId, label)
    } catch (error) {
        // Label already exists, ignore
        if (!String(error).includes('UNIQUE constraint')) {
            throw error
        }
    }
}

/**
 * Remove a label from a ticket
 */
export function removeTicketLabel(ticketId: string, label: string): void {
    if (!db) throw new Error('Database not initialized')
    db.prepare(`
        DELETE FROM ticket_labels
        WHERE ticket_id = ? AND label = ?
    `).run(ticketId, label)
}

/**
 * Check if a ticket has a specific label
 */
export function hasTicketLabel(ticketId: string, label: string): boolean {
    if (!db) throw new Error('Database not initialized')
    const result = db
        .prepare(`
        SELECT 1 FROM ticket_labels
        WHERE ticket_id = ? AND label = ?
        LIMIT 1
    `)
        .get(ticketId, label) as {1?: number} | undefined
    return !!result
}

/**
 * Get all assignees for a ticket
 */
export function getTicketAssignees(ticketId: string): Array<{assignee_id: string; assignee_type: 'agent' | 'human'}> {
    if (!db) throw new Error('Database not initialized')
    const assignees = db
        .prepare(`
        SELECT assignee_type, assignee_id
        FROM ticket_assignees
        WHERE ticket_id = ?
    `)
        .all(ticketId) as Array<{assignee_id: string; assignee_type: string}>
    return assignees.map((a) => ({
        assignee_id: a.assignee_id,
        assignee_type: a.assignee_type as 'agent' | 'human',
    }))
}

/**
 * Add an assignee to a ticket
 */
export function addTicketAssignee(ticketId: string, assignee_type: 'agent' | 'human', assignee_id: string): void {
    if (!db) throw new Error('Database not initialized')
    try {
        db.prepare(`
            INSERT INTO ticket_assignees (ticket_id, assignee_type, assignee_id)
            VALUES (?, ?, ?)
        `).run(ticketId, assignee_type, assignee_id)
    } catch (error) {
        // Assignee already exists, ignore
        if (!String(error).includes('UNIQUE constraint')) {
            throw error
        }
    }
}

/**
 * Remove an assignee from a ticket
 */
export function removeTicketAssignee(ticketId: string, assignee_type: 'agent' | 'human', assignee_id: string): void {
    if (!db) throw new Error('Database not initialized')
    db.prepare(`
        DELETE FROM ticket_assignees
        WHERE ticket_id = ? AND assignee_type = ? AND assignee_id = ?
    `).run(ticketId, assignee_type, assignee_id)
}

/**
 * Check if a ticket has a specific assignee
 */
export function hasTicketAssignee(ticketId: string, assignee_type: 'agent' | 'human', assignee_id: string): boolean {
    if (!db) throw new Error('Database not initialized')
    const result = db
        .prepare(`
        SELECT 1 FROM ticket_assignees
        WHERE ticket_id = ? AND assignee_type = ? AND assignee_id = ?
        LIMIT 1
    `)
        .get(ticketId, assignee_type, assignee_id) as {1?: number} | undefined
    return !!result
}

/**
 * Get all label definitions
 */
export function getLabelDefinitions(): Array<LabelDefinition> {
    if (!db) throw new Error('Database not initialized')
    return db
        .prepare(`
        SELECT * FROM label_definitions
        ORDER BY name ASC
    `)
        .all() as Array<LabelDefinition>
}

/**
 * Get a label definition by name
 */
export function getLabelDefinition(name: string): LabelDefinition | undefined {
    if (!db) throw new Error('Database not initialized')
    return db
        .prepare(`
        SELECT * FROM label_definitions
        WHERE name = ?
    `)
        .get(name) as LabelDefinition | undefined
}

/**
 * Create or update a label definition
 */
export function upsertLabelDefinition(id: string, name: string, color: string): void {
    if (!db) throw new Error('Database not initialized')
    const now = Date.now()
    db.prepare(`
        INSERT INTO label_definitions (id, name, color, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            color = excluded.color,
            updated_at = excluded.updated_at
    `).run(id, name, color, now, now)
}

/**
 * Delete a label definition
 */
export function deleteLabelDefinition(id: string): void {
    if (!db) throw new Error('Database not initialized')
    db.prepare(`
        DELETE FROM label_definitions
        WHERE id = ?
    `).run(id)
}

/**
 * Initialize preset tags (non-editable)
 * Role tags and essential type tags for documentation
 */
function initializePresetTags() {
    if (!db) throw new Error('Database not initialized')

    const presetTags = [
        // Role tags
        {color: '#3b82f6', name: 'role:product-owner'},
        {color: '#10b981', name: 'role:developer'},
        {color: '#f59e0b', name: 'role:designer'},
        {color: '#8b5cf6', name: 'role:ux'},
        {color: '#ef4444', name: 'role:qa'},
        {color: '#06b6d4', name: 'role:planner'},

        // Essential type tags
        {color: '#ec4899', name: 'type:prioritization'},
        {color: '#8b5cf6', name: 'type:adr'},
        {color: '#f59e0b', name: 'type:rules'},
        {color: '#14b8a6', name: 'type:guide'},
        {color: '#6366f1', name: 'type:api'},
        {color: '#64748b', name: 'type:config'},
        {color: '#ef4444', name: 'type:deployment'},
    ]

    const now = Date.now()
    const insertStmt = db.prepare(`
        INSERT OR IGNORE INTO label_definitions (id, name, color, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
    `)

    for (const tag of presetTags) {
        // Validate tag format (hyphens only)
        if (!/^[a-z0-9:-]+$/.test(tag.name) || tag.name.includes('_')) {
            logger.warn(`[Database] Invalid tag format (must use hyphens): ${tag.name}`)
            continue
        }

        const tagId = `preset-${tag.name.toLowerCase().replaceAll(':', '-')}`
        try {
            insertStmt.run(tagId, tag.name, tag.color, now, now)
        } catch (_error) {
            // Tag already exists, that's fine
        }
    }

    logger.info('[Database] Initialized preset tags')
}

export {db}
