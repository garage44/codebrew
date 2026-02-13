import {userManager} from '@garage44/common/service'
import {z} from 'zod'

import {validateRequest} from '../lib/api/validate.ts'
import {config, saveConfig} from '../lib/config.ts'
import {UpdateConfigRequestSchema, GetConfigResponseSchema} from '../lib/schemas/config.ts'
import {enola, logger, workspaces} from '../service.ts'

export default function apiConfig(router: {
    get: (path: string, handler: () => Promise<Response>) => void
    post: (path: string, handler: (req: Request) => Promise<Response>) => void
}) {
    // HTTP API endpoints using familiar Express-like pattern
    router.get('/api/config', async () => {
        /*
         * For now, assume admin user since we don't have session context here
         * In a real implementation, you'd get the user from the session
         */
        const user = await userManager.getUserByUsername('admin')
        const response = {
            enola: enola.getConfig(user?.permissions.admin || false),
            language_ui: config.language_ui,
            workspaces: workspaces.workspaces.map((workspace) => ({
                source_file: workspace.config.source_file,
                workspace_id: workspace.config.workspace_id,
            })),
        }
        // Validate response matches schema
        validateRequest(GetConfigResponseSchema, response)
        return new Response(JSON.stringify(response), {
            headers: {'Content-Type': 'application/json'},
        })
    })

    router.post('/api/config', async (req) => {
        // For now, assume admin user since we don't have session context here
        const user = await userManager.getUserByUsername('admin')
        if (!user?.permissions.admin) {
            return new Response(JSON.stringify({error: 'Unauthorized'}), {
                headers: {'Content-Type': 'application/json'},
                status: 403,
            })
        }

        try {
            const body = validateRequest(UpdateConfigRequestSchema, await req.json())
            config.enola = body.enola as typeof config.enola

            for (const [engineName, engine] of Object.entries(config.enola.engines)) {
                const engineConfig: {api_key?: string; base_url?: string} = engine
                if (engineConfig.api_key && enola.engines[engineName] && typeof enola.engines[engineName].init === 'function') {
                    // Init requires base_url, so provide a default if missing
                    const initConfig: {api_key: string; base_url: string} = {
                        api_key: engineConfig.api_key,
                        base_url: engineConfig.base_url || '',
                    }
                    await enola.engines[engineName].init(initConfig, logger)
                }
            }

            config.language_ui = body.language_ui

            // Get workspace names from request
            const requestedWorkspaceIds = new Set(body.workspaces.map((w) => w.workspace_id))
            // Find workspaces that need to be removed
            const redundantWorkspaces = workspaces.workspaces.filter(
                (workspace) => !requestedWorkspaceIds.has(workspace.config.workspace_id),
            )

            // Remove redundant workspaces
            for (const workspace of redundantWorkspaces) {
                logger.info(`[api] [settings] removing redundant workspace ${workspace.config.workspace_id}`)
                await workspaces.delete(workspace.config.workspace_id)
            }

            // Add new workspaces
            for (const description of body.workspaces) {
                if (!workspaces.get(description.workspace_id) && description.source_file) {
                    await workspaces.add({source_file: description.source_file, workspace_id: description.workspace_id})
                }
            }

            await saveConfig()

            const response = {
                enola: enola.config,
                language_ui: config.language_ui,
                workspaces: workspaces.workspaces.map((workspace) => ({
                    source_file: workspace.config.source_file,
                    workspace_id: workspace.config.workspace_id,
                })),
            }
            // Validate response matches schema
            validateRequest(GetConfigResponseSchema, response)
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
            throw error
        }
    })
}
