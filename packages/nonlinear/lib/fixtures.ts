/**
 * Fixture system for development mode
 * Imports documentation and creates preset tickets when database is empty
 */

import {logger} from '../service.ts'
import {randomId} from '@garage44/common/lib/utils'
import {extractWorkspacePackages} from './workspace.ts'
import {readFileSync, existsSync, readdirSync} from 'fs'
import {join, relative, dirname} from 'path'
import {fileURLToPath} from 'url'
import {queueIndexingJob} from './indexing/queue.ts'
import type {Database} from 'bun:sqlite'

/**
 * Initialize fixtures in development mode when database is empty
 * Creates garage44 workspace, imports fixture docs, creates preset tickets
 */
export async function initializeFixtures(db: Database, _workspaceRoot: string): Promise<void> {
    // Check if already initialized
    const existingWorkspace = db.prepare('SELECT id FROM repositories WHERE name = ?').get('garage44')
    if (existingWorkspace) {
        logger.info('[Fixtures] Workspace already exists, skipping fixture initialization')
        return
    }

    logger.info('[Fixtures] Initializing fixtures...')

    // Always use garage44-agent repo (or NONLINEAR_WORKSPACE_ROOT env var override)
    const finalWorkspaceRoot = process.env.NONLINEAR_WORKSPACE_ROOT || '/home/deck/code/garage44-agent'
    logger.info(`[Fixtures] Using workspace root: ${finalWorkspaceRoot}`)

    // Create garage44 workspace
    const workspaceId = await createGarage44Workspace(db, finalWorkspaceRoot)

    // Create preset tickets first (for early testing)
    await createPresetTickets(db, workspaceId)

    // Import fixture docs (takes longer due to embeddings)
    await importFixtureDocs(db, finalWorkspaceRoot, workspaceId)

    logger.info('[Fixtures] Initialized garage44 workspace with tickets and docs')
}

async function createGarage44Workspace(
    db: Database,
    workspaceRoot: string,
): Promise<string> {
    const workspaceId = randomId()
    const now = Date.now()

    db.prepare(`
        INSERT INTO repositories (id, name, path, platform, remote_url, config, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        workspaceId,
        'garage44',
        workspaceRoot,
        'local',
        null,
        JSON.stringify({}),
        now,
        now,
    )

    logger.info(`[Fixtures] Created garage44 workspace: ${workspaceId}`)
    return workspaceId
}

/**
 * Infer tags from file path
 */
function inferTagsFromPath(pkg: string, filePath: string, workspaceRoot: string): string[] {
    const tags: string[] = []
    const relativePath = relative(workspaceRoot, filePath)

    // Add workspace tag
    tags.push('workspace:garage44')

    // Infer type from path
    if (relativePath.includes('/architecture/') || relativePath.includes('/adr/')) {
        tags.push('type:adr')
    } else if (relativePath.includes('/rules/')) {
        tags.push('type:rules')
    } else if (relativePath.includes('/guides/') || relativePath.includes('/guide/')) {
        tags.push('type:guide')
    } else if (relativePath.includes('/api/')) {
        tags.push('type:api')
    } else if (relativePath.includes('/config/')) {
        tags.push('type:config')
    } else if (relativePath.includes('/deployment/')) {
        tags.push('type:deployment')
    }

    // Add package name as tag if it's a package doc
    if (pkg !== 'workspace') {
        // Replace / with - to comply with tag format (hyphens only)
        tags.push(`workspace:garage44-packages-${pkg}`)
    }

    return tags
}

/**
 * Convert file path to wiki path
 */
function convertToWikiPath(filePath: string, workspaceRoot: string, pkg: string, fixturesDir?: string): string {
    let relativePath = relative(workspaceRoot, filePath)

    // If this is a fixtures file, convert it to look like it came from packages/malkovich/docs/
    if (fixturesDir && filePath.startsWith(fixturesDir)) {
        const fixturesRelativePath = relative(fixturesDir, filePath)
        relativePath = `packages/malkovich/docs/${fixturesRelativePath}`
    }

    // Remove .md/.mdc extension
    let wikiPath = relativePath.replace(/\.(md|mdc)$/, '')

    // Convert packages/expressio/docs/index.md -> workspaces/garage44/packages/expressio/overview
    if (wikiPath.includes('/docs/index')) {
        wikiPath = wikiPath.replace('/docs/index', '/overview')
    }

    /*
     * Convert packages/expressio/docs/architecture/adr-001.md -> workspaces/garage44/packages/expressio/architecture/adr-001
     * Convert docs/architecture/adr-001.md -> workspaces/garage44/architecture/adr-001
     */
    if (pkg === 'workspace') {
        wikiPath = `workspaces/garage44/${wikiPath.replace('docs/', '')}`
    } else {
        wikiPath = `workspaces/garage44/packages/${pkg}/${wikiPath.replace(`packages/${pkg}/docs/`, '')}`
    }

    return wikiPath
}

/**
 * Import docs from a directory
 */
async function importDocsFromDirectory(
    db: Database,
    dirPath: string,
    baseWikiPath: string,
    workspaceId: string,
    pkg: string,
    workspaceRoot: string,
    fixturesDir?: string,
): Promise<void> {
    if (!existsSync(dirPath)) {
        return
    }

    const entries = readdirSync(dirPath, {withFileTypes: true})

    for (const entry of entries) {
        // Skip hidden files
        if (entry.name.startsWith('.')) {
            continue
        }

        const fullPath = join(dirPath, entry.name)

        if (entry.isDirectory()) {
            // Recursively import subdirectories
            await importDocsFromDirectory(
                db,
                fullPath,
                baseWikiPath,
                workspaceId,
                pkg,
                workspaceRoot,
                fixturesDir,
            )
        } else if (entry.isFile() && (entry.name.endsWith('.md') || entry.name.endsWith('.mdc'))) {
            // Skip index files (handled separately)
            if (entry.name === 'index.md' || entry.name === 'index.mdc') {
                continue
            }

            try {
                const content = readFileSync(fullPath, 'utf-8')

                // Extract title from first heading or filename
                let title = entry.name.replace(/\.(md|mdc)$/, '')
                const titleMatch = content.match(/^#+\s+(.+)$/m)
                if (titleMatch) {
                    title = titleMatch[1].trim()
                }

                // Convert to wiki path
                const wikiPath = convertToWikiPath(fullPath, workspaceRoot, pkg, fixturesDir)

                // Infer tags
                const tags = inferTagsFromPath(pkg, fullPath, workspaceRoot)

                // Create doc
                const docId = randomId()
                const now = Date.now()

                // Get admin user ID
                const adminUser = db.prepare('SELECT id FROM users WHERE username = ?').get('admin') as {id: string} | undefined
                const authorId = adminUser?.id || randomId()

                db.prepare(`
                    INSERT INTO documentation (id, path, title, content, author_id, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                `).run(
                    docId,
                    wikiPath,
                    title,
                    content,
                    authorId,
                    now,
                    now,
                )

                // Add tags
                for (const tag of tags) {
                    // Normalize tag before ensuring it exists
                    const normalizedTag = tag
                        .toLowerCase()
                        .replace(/\s+/g, '-')
                        .replace(/\//g, '-')
                        .replace(/[^a-z0-9:-]/g, '')

                    // Ensure tag exists in label_definitions
                    ensureLabelExists(db, normalizedTag)

                    // Add to documentation_labels
                    try {
                        db.prepare(`
                            INSERT INTO documentation_labels (doc_id, label)
                            VALUES (?, ?)
                        `).run(docId, normalizedTag)
                    } catch {
                        // Tag already exists, ignore
                    }
                }

                // Generate embeddings
                try {
                    // Queue indexing job (processed by indexing service)
                    await queueIndexingJob({
                        docId,
                        type: 'doc',
                    })
                } catch(error) {
                    logger.warn(`[Fixtures] Failed to generate embeddings for ${wikiPath}:`, error)
                }

                logger.info(`[Fixtures] Imported doc: ${wikiPath}`)
            } catch(error) {
                logger.warn(`[Fixtures] Failed to import ${fullPath}:`, error)
            }
        }
    }
}

/**
 * Ensure label exists in label_definitions
 */
function ensureLabelExists(db: Database, label: string): void {
    /* Normalize tag: replace spaces and slashes with hyphens, remove invalid chars */
    const normalizedLabel = label
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/\//g, '-')
        .replace(/[^a-z0-9:-]/g, '')

    // Validate tag format (hyphens only, no underscores)
    if (!/^[a-z0-9:-]+$/.test(normalizedLabel) || normalizedLabel.includes('_')) {
        logger.warn(`[Fixtures] Invalid tag format (must use hyphens): ${label} -> ${normalizedLabel}`)
        return
    }

    const existing = db.prepare('SELECT id FROM label_definitions WHERE name = ?').get(normalizedLabel)
    if (!existing) {
        const labelId = `label-${normalizedLabel.toLowerCase().replace(/:/g, '-')}`
        const now = Date.now()
        const defaultColor = '#64748b'

        try {
            db.prepare(`
                INSERT INTO label_definitions (id, name, color, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?)
            `).run(labelId, normalizedLabel, defaultColor, now, now)
        } catch {
            // Label already exists, ignore
        }
    }
}

async function importFixtureDocs(
    db: Database,
    workspaceRoot: string,
    workspaceId: string,
): Promise<void> {
    logger.info('[Fixtures] Importing fixture docs...')

    // Import malkovich docs from local fixtures directory
    const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures')
    if (existsSync(fixturesDir)) {
        await importDocsFromDirectory(
            db,
            fixturesDir,
            'workspaces/garage44/packages/malkovich',
            workspaceId,
            'malkovich',
            workspaceRoot,
            fixturesDir,
        )
    }

    // Scan packages/*/docs/ directories (excluding malkovich)
    const packagesDir = join(workspaceRoot, 'packages')
    if (existsSync(packagesDir)) {
        const packages = extractWorkspacePackages(workspaceRoot)

        for (const pkg of packages) {
            // Skip malkovich since we import it from fixtures directory
            if (pkg === 'malkovich') {
                continue
            }

            const docsPath = join(packagesDir, pkg, 'docs')
            if (existsSync(docsPath)) {
                await importDocsFromDirectory(
                    db,
                    docsPath,
                    `workspaces/garage44/packages/${pkg}`,
                    workspaceId,
                    pkg,
                    workspaceRoot,
                )
            }
        }
    }

    // Import workspace-level docs (if exists)
    const workspaceDocsPath = join(workspaceRoot, 'docs')
    if (existsSync(workspaceDocsPath)) {
        await importDocsFromDirectory(
            db,
            workspaceDocsPath,
            'workspaces/garage44',
            workspaceId,
            'workspace',
            workspaceRoot,
        )
    }

    logger.info('[Fixtures] Finished importing fixture docs')
}

async function createPresetTickets(db: Database, workspaceId: string): Promise<void> {
    logger.info('[Fixtures] Creating preset tickets...')

    const presetTickets = [
        {
            description: 'Add login/logout functionality with session management',
            labels: ['feature', 'auth'],
            priority: null,
            status: 'backlog',
            title: 'Implement user authentication',
        },
        {
            description: 'Improve error handling and reconnection logic for WebSocket connections',
            labels: ['tech-debt', 'websocket'],
            priority: null,
            status: 'backlog',
            title: 'Refactor WebSocket connection handling',
        },
        {
            description: 'Document all API endpoints with examples and error codes',
            labels: ['documentation', 'api'],
            priority: 5,
            status: 'todo',
            title: 'Add documentation for API endpoints',
        },
        {
            description: 'Make error messages more user-friendly and actionable',
            labels: ['ux', 'feature'],
            priority: null,
            status: 'backlog',
            title: 'Improve error messages in UI',
        },
        {
            description: 'Configure automated testing and deployment',
            labels: ['deployment', 'ci'],
            priority: null,
            status: 'backlog',
            title: 'Set up CI/CD pipeline',
        },
        {
            description: 'Add indexes and optimize slow queries',
            labels: ['performance', 'tech-debt'],
            priority: null,
            status: 'backlog',
            title: 'Optimize database queries',
        },
        {
            description: 'Document all reusable components with examples',
            labels: ['documentation', 'components'],
            priority: 3,
            status: 'todo',
            title: 'Create component library documentation',
        },
        {
            description: 'Investigate and fix memory leak causing server crashes',
            labels: ['bug', 'websocket', 'critical'],
            priority: 8,
            status: 'in_progress',
            title: 'Fix memory leak in WebSocket handler',
        },
    ]

    const now = Date.now()

    for (const ticket of presetTickets) {
        const ticketId = randomId()

        // Create ticket
        db.prepare(`
            INSERT INTO tickets (id, repository_id, title, description, status, priority, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            ticketId,
            workspaceId,
            ticket.title,
            ticket.description,
            ticket.status,
            ticket.priority,
            now,
            now,
        )

        // Add labels
        for (const label of ticket.labels) {
            // Ensure label exists
            ensureLabelExists(db, label)

            // Add to ticket_labels
            try {
                db.prepare(`
                    INSERT INTO ticket_labels (ticket_id, label)
                    VALUES (?, ?)
                `).run(ticketId, label)
            } catch {
                // Label already exists, ignore
            }
        }

        // Generate ticket embedding
        try {
            const {generateTicketEmbedding} = await import('./docs/embeddings.ts')
            await generateTicketEmbedding(ticketId, ticket.title, ticket.description)
        } catch(error) {
            logger.warn(`[Fixtures] Failed to generate embedding for ticket ${ticketId}:`, error)
        }
    }

    logger.info(`[Fixtures] Created ${presetTickets.length} preset tickets`)
}
