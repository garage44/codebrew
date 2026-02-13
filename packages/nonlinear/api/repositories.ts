/**
 * Repositories WebSocket API Routes
 */

import type {WebSocketServerManager} from '@garage44/common/lib/ws-server'

import {randomId} from '@garage44/common/lib/utils'
import fs from 'fs-extra'
import path from 'node:path'
import {z} from 'zod'

import {validateRequest} from '../lib/api/validate.ts'
import {getDb} from '../lib/database.ts'
import {getDefaultPlatform} from '../lib/git/index.ts'
import {
    CreateRepositoryRequestSchema,
    DiscoverRepositoriesRequestSchema,
    RepositoryParamsSchema,
    RepositorySchema,
    UpdateRepositoryRequestSchema,
} from '../lib/schemas/repositories.ts'
import {logger} from '../service.ts'

export function registerRepositoriesWebSocketApiRoutes(wsManager: WebSocketServerManager) {
    // Get all repositories
    wsManager.api.get('/api/repositories', async (_ctx, _req) => {
        const repositories = getDb()
            .prepare(`
            SELECT * FROM repositories
            ORDER BY name ASC
        `)
            .all() as {
            config: string
            created_at: number
            id: string
            name: string
            path: string
            platform: 'github' | 'gitlab' | 'local'
            remote_url: string | null
            updated_at: number
        }[]

        // Validate all repositories match schema
        const validatedRepositories = repositories.map((repo) => validateRequest(RepositorySchema, repo))

        return {
            repositories: validatedRepositories,
        }
    })

    // Get repository by ID
    wsManager.api.get('/api/repositories/:id', async (_ctx, req) => {
        const params = validateRequest(RepositoryParamsSchema, req.params)

        const repo = getDb().prepare('SELECT * FROM repositories WHERE id = ?').get(params.id) as
            | {
                  config: string
                  created_at: number
                  id: string
                  name: string
                  path: string
                  platform: 'github' | 'gitlab' | 'local'
                  remote_url: string | null
                  updated_at: number
              }
            | undefined

        if (!repo) {
            throw new Error('Repository not found')
        }

        const validatedRepo = validateRequest(RepositorySchema, repo)

        return {
            repository: validatedRepo,
        }
    })

    // Discover local git repositories
    wsManager.api.post('/api/repositories/discover', async (_ctx, req) => {
        const data = validateRequest(DiscoverRepositoriesRequestSchema, req.data)

        const searchDir = data.searchPath || process.cwd()
        const discovered: {name: string; path: string}[] = []

        // Limit depth to avoid scanning too deep
        async function scanDirectory(dir: string, depth = 0) {
            if (depth > 3) {
                return
            }

            try {
                const entries = await fs.readdir(dir, {withFileTypes: true})

                for (const entry of entries) {
                    const fullPath = path.join(dir, entry.name)

                    // Check if this is a git repository
                    if (entry.isDirectory() && entry.name === '.git') {
                        const repoPath = path.dirname(fullPath)
                        const repoName = path.basename(repoPath)
                        discovered.push({
                            name: repoName,
                            path: repoPath,
                        })
                        continue
                    }

                    // Recursively scan subdirectories (skip node_modules, .git, etc.)
                    if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
                        await scanDirectory(fullPath, depth + 1)
                    }
                }
            } catch (error) {
                // Skip directories we can't read
                logger.debug(`[API] Could not scan directory ${dir}: ${error}`)
            }
        }

        await scanDirectory(searchDir)

        return {
            discovered,
        }
    })

    // Add repository
    wsManager.api.post('/api/repositories', async (_ctx, req) => {
        const data = validateRequest(CreateRepositoryRequestSchema, req.data)

        // Verify path exists and is a git repository
        const gitPath = path.join(data.path, '.git')
        if (!(await fs.pathExists(gitPath))) {
            throw new Error('Path is not a git repository')
        }

        const repoId = randomId()
        const now = Date.now()
        const repoPlatform = data.platform || getDefaultPlatform()

        getDb()
            .prepare(`
            INSERT INTO repositories (
                id, name, path, platform, remote_url, config, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `)
            .run(repoId, data.name, data.path, repoPlatform, data.remote_url || null, JSON.stringify(data.config || {}), now, now)

        const repository = getDb().prepare('SELECT * FROM repositories WHERE id = ?').get(repoId) as {
            config: string
            created_at: number
            id: string
            name: string
            path: string
            platform: 'github' | 'gitlab' | 'local'
            remote_url: string | null
            updated_at: number
        }

        if (!repository) {
            throw new Error('Failed to create repository')
        }

        const validatedRepo = validateRequest(RepositorySchema, repository)

        // Broadcast repository creation
        wsManager.broadcast('/repositories', {
            repository: validatedRepo,
            type: 'repository:created',
        })

        logger.info(`[API] Added repository ${repoId}: ${data.name}`)

        return {
            repository: validatedRepo,
        }
    })

    // Update repository
    wsManager.api.put('/api/repositories/:id', async (_ctx, req) => {
        const params = validateRequest(RepositoryParamsSchema, req.params)
        const updates = validateRequest(UpdateRepositoryRequestSchema, req.data)

        const fields: string[] = []
        const values: unknown[] = []

        if (updates.name !== undefined) {
            fields.push('name = ?')
            values.push(updates.name)
        }
        if (updates.path !== undefined) {
            fields.push('path = ?')
            values.push(updates.path)
        }
        if (updates.platform !== undefined) {
            fields.push('platform = ?')
            values.push(updates.platform)
        }
        if (updates.remote_url !== undefined) {
            fields.push('remote_url = ?')
            values.push(updates.remote_url)
        }
        if (updates.config !== undefined) {
            fields.push('config = ?')
            values.push(JSON.stringify(updates.config))
        }

        if (fields.length === 0) {
            throw new Error('No fields to update')
        }

        fields.push('updated_at = ?')
        values.push(Date.now())
        values.push(params.id)

        getDb()
            .prepare(`
            UPDATE repositories
            SET ${fields.join(', ')}
            WHERE id = ?
        `)
            .run(...(values as (string | number)[]))

        const repository = getDb().prepare('SELECT * FROM repositories WHERE id = ?').get(params.id) as
            | {
                  config: string
                  created_at: number
                  id: string
                  name: string
                  path: string
                  platform: 'github' | 'gitlab' | 'local'
                  remote_url: string | null
                  updated_at: number
              }
            | undefined

        if (!repository) {
            throw new Error('Repository not found')
        }

        const validatedRepo = validateRequest(RepositorySchema, repository)

        // Broadcast repository update
        wsManager.broadcast('/repositories', {
            repository: validatedRepo,
            type: 'repository:updated',
        })

        return {
            repository: validatedRepo,
        }
    })

    // Delete repository
    wsManager.api.delete('/api/repositories/:id', async (_ctx, req) => {
        const params = validateRequest(RepositoryParamsSchema, req.params)

        getDb().prepare('DELETE FROM repositories WHERE id = ?').run(params.id)

        // Broadcast repository deletion
        wsManager.broadcast('/repositories', {
            repositoryId: params.id,
            type: 'repository:deleted',
        })

        logger.info(`[API] Deleted repository ${params.id}`)

        return {
            success: true,
        }
    })

    // Subscribe to repository updates
    wsManager.on('/repositories', (_ws) => {
        logger.debug('[API] Client subscribed to repository updates')
    })
}

export default function apiRepositories(router: unknown) {
    const routerTyped = router as {
        delete: (
            path: string,
            handler: (req: Request, params: Record<string, string>, session: unknown) => Promise<Response>,
        ) => void
        get: (
            path: string,
            handler: (req: Request, params: Record<string, string>, session: unknown) => Promise<Response>,
        ) => void
        post: (
            path: string,
            handler: (req: Request, params: Record<string, string>, session: unknown) => Promise<Response>,
        ) => void
        put: (
            path: string,
            handler: (req: Request, params: Record<string, string>, session: unknown) => Promise<Response>,
        ) => void
    }

    routerTyped.get('/api/repositories', async (_req: Request, _params: Record<string, string>, _session: unknown) => {
        const repositories = getDb()
            .prepare(`
            SELECT * FROM repositories
            ORDER BY name ASC
        `)
            .all() as {
            config: string
            created_at: number
            id: string
            name: string
            path: string
            platform: 'github' | 'gitlab' | 'local'
            remote_url: string | null
            updated_at: number
        }[]

        const validatedRepositories = repositories.map((repo) => validateRequest(RepositorySchema, repo))

        return new Response(JSON.stringify({repositories: validatedRepositories}), {
            headers: {'Content-Type': 'application/json'},
        })
    })

    routerTyped.get('/api/repositories/:id', async (_req: Request, params: Record<string, string>, _session: unknown) => {
        try {
            const validatedParams = validateRequest(RepositoryParamsSchema, params)
            const repo = getDb().prepare('SELECT * FROM repositories WHERE id = ?').get(validatedParams.id) as
                | {
                      config: string
                      created_at: number
                      id: string
                      name: string
                      path: string
                      platform: 'github' | 'gitlab' | 'local'
                      remote_url: string | null
                      updated_at: number
                  }
                | undefined

            if (!repo) {
                return new Response(JSON.stringify({error: 'Repository not found'}), {
                    headers: {'Content-Type': 'application/json'},
                    status: 404,
                })
            }

            const validatedRepo = validateRequest(RepositorySchema, repo)

            return new Response(JSON.stringify({repository: validatedRepo}), {
                headers: {'Content-Type': 'application/json'},
            })
        } catch (error) {
            return new Response(JSON.stringify({error: error instanceof Error ? error.message : 'Invalid request'}), {
                headers: {'Content-Type': 'application/json'},
                status: 400,
            })
        }
    })

    routerTyped.post('/api/repositories', async (req: Request, _params: Record<string, string>, _session: unknown) => {
        try {
            const body = await req.json()
            const data = validateRequest(CreateRepositoryRequestSchema, body)

            // Verify path exists and is a git repository
            const gitPath = path.join(data.path, '.git')
            if (!(await fs.pathExists(gitPath))) {
                return new Response(JSON.stringify({error: 'Path is not a git repository'}), {
                    headers: {'Content-Type': 'application/json'},
                    status: 400,
                })
            }

            const repoId = randomId()
            const now = Date.now()
            const repoPlatform = data.platform || getDefaultPlatform()

            getDb()
                .prepare(`
                INSERT INTO repositories (
                    id, name, path, platform, remote_url, config, created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `)
                .run(
                    repoId,
                    data.name,
                    data.path,
                    repoPlatform,
                    data.remote_url || null,
                    JSON.stringify(data.config || {}),
                    now,
                    now,
                )

            const repository = getDb().prepare('SELECT * FROM repositories WHERE id = ?').get(repoId) as
                | {
                      config: string
                      created_at: number
                      id: string
                      name: string
                      path: string
                      platform: 'github' | 'gitlab' | 'local'
                      remote_url: string | null
                      updated_at: number
                  }
                | undefined

            if (!repository) {
                throw new Error('Failed to create repository')
            }

            const validatedRepo = validateRequest(RepositorySchema, repository)

            logger.info(`[API] Added repository ${repoId}: ${data.name}`)

            return new Response(JSON.stringify({repository: validatedRepo}), {
                headers: {'Content-Type': 'application/json'},
            })
        } catch (error) {
            logger.error(`[API] Error adding repository: ${error}`)
            const errorMessage = error instanceof Error ? error.message : 'Failed to add repository'
            const status = error instanceof z.ZodError ? 400 : 500
            return new Response(JSON.stringify({error: errorMessage}), {
                headers: {'Content-Type': 'application/json'},
                status,
            })
        }
    })

    routerTyped.put('/api/repositories/:id', async (req: Request, params: Record<string, string>, _session: unknown) => {
        try {
            const validatedParams = validateRequest(RepositoryParamsSchema, params)
            const body = await req.json()
            const updates = validateRequest(UpdateRepositoryRequestSchema, body)

            const fields: string[] = []
            const values: unknown[] = []

            if (updates.name !== undefined) {
                fields.push('name = ?')
                values.push(updates.name)
            }
            if (updates.path !== undefined) {
                fields.push('path = ?')
                values.push(updates.path)
            }
            if (updates.platform !== undefined) {
                fields.push('platform = ?')
                values.push(updates.platform)
            }
            if (updates.remote_url !== undefined) {
                fields.push('remote_url = ?')
                values.push(updates.remote_url)
            }
            if (updates.config !== undefined) {
                fields.push('config = ?')
                values.push(JSON.stringify(updates.config))
            }

            if (fields.length === 0) {
                return new Response(JSON.stringify({error: 'No fields to update'}), {
                    headers: {'Content-Type': 'application/json'},
                    status: 400,
                })
            }

            fields.push('updated_at = ?')
            values.push(Date.now())
            values.push(validatedParams.id)

            getDb()
                .prepare(`
                UPDATE repositories
                SET ${fields.join(', ')}
                WHERE id = ?
            `)
                .run(...(values as (string | number)[]))

            const repository = getDb().prepare('SELECT * FROM repositories WHERE id = ?').get(validatedParams.id) as
                | {
                      config: string
                      created_at: number
                      id: string
                      name: string
                      path: string
                      platform: 'github' | 'gitlab' | 'local'
                      remote_url: string | null
                      updated_at: number
                  }
                | undefined

            if (!repository) {
                return new Response(JSON.stringify({error: 'Repository not found'}), {
                    headers: {'Content-Type': 'application/json'},
                    status: 404,
                })
            }

            const validatedRepo = validateRequest(RepositorySchema, repository)

            return new Response(JSON.stringify({repository: validatedRepo}), {
                headers: {'Content-Type': 'application/json'},
            })
        } catch (error) {
            logger.error(`[API] Error updating repository: ${error}`)
            const errorMessage = error instanceof Error ? error.message : 'Failed to update repository'
            const status = error instanceof z.ZodError ? 400 : 500
            return new Response(JSON.stringify({error: errorMessage}), {
                headers: {'Content-Type': 'application/json'},
                status,
            })
        }
    })

    routerTyped.delete('/api/repositories/:id', async (_req: Request, params: Record<string, string>, _session: unknown) => {
        try {
            const validatedParams = validateRequest(RepositoryParamsSchema, params)

            getDb().prepare('DELETE FROM repositories WHERE id = ?').run(validatedParams.id)

            logger.info(`[API] Deleted repository ${validatedParams.id}`)

            return new Response(JSON.stringify({success: true}), {
                headers: {'Content-Type': 'application/json'},
            })
        } catch (error) {
            return new Response(JSON.stringify({error: error instanceof Error ? error.message : 'Invalid request'}), {
                headers: {'Content-Type': 'application/json'},
                status: 400,
            })
        }
    })
}
