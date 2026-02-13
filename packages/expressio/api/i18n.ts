import type {WebSocketServerManager} from '@garage44/common/lib/ws-server'

import {logger} from '@garage44/common/app'
import {pathCreate, pathDelete, pathMove, pathRef, pathToggle} from '@garage44/common/lib/paths.ts'
import {i18nFormat} from '@garage44/expressio/lib/i18n'

import {validateRequest} from '../lib/api/validate.ts'
import {
    WorkspaceIdParamsSchema,
    CreatePathRequestSchema,
    DeletePathRequestSchema,
    MovePathRequestSchema,
    CollapsePathRequestSchema,
    UpdateTagRequestSchema,
    TranslateRequestSchema,
    TranslateResponseSchema,
    GetTranslationsParamsSchema,
} from '../lib/schemas/i18n.ts'
import {translate_path, translate_tag} from '../lib/translate.ts'
import {workspaces} from '../service.ts'

export function registerI18nWebSocketApiRoutes(wsManager: WebSocketServerManager) {
    // WebSocket API routes (unchanged) - these are for real-time features
    const apiWs = wsManager.api

    // oxlint-disable-next-line require-await
    apiWs.post('/api/workspaces/:workspace_id/paths', async (_context, request) => {
        const {workspace_id} = validateRequest(WorkspaceIdParamsSchema, request.params)
        const workspace = workspaces.get(workspace_id)
        const {path, value} = validateRequest(CreatePathRequestSchema, request.data)
        const targetLanguages = workspace.config.languages.target
        pathCreate(
            workspace.i18n,
            path,
            value as {cache?: string; source: string; target: Record<string, string>},
            targetLanguages as unknown as Array<{
                engine: 'anthropic' | 'deepl'
                formality: 'default' | 'more' | 'less'
                id: string
                name: string
            }>,
        )
        workspace.save()
    })

    // oxlint-disable-next-line require-await
    apiWs.delete('/api/workspaces/:workspace_id/paths', async (_context, request) => {
        const {workspace_id} = validateRequest(WorkspaceIdParamsSchema, request.params)
        const workspace = workspaces.get(workspace_id)
        const {path} = validateRequest(DeletePathRequestSchema, request.data)
        const pathArray = Array.isArray(path) ? path : [path]
        pathDelete(workspace.i18n, pathArray)
        workspace.save()
    })

    // oxlint-disable-next-line require-await
    apiWs.put('/api/workspaces/:workspace_id/paths', async (_context, request) => {
        const {workspace_id} = validateRequest(WorkspaceIdParamsSchema, request.params)
        const workspace = workspaces.get(workspace_id)
        const {new_path, old_path} = validateRequest(MovePathRequestSchema, request.data)
        pathMove(workspace.i18n, old_path, new_path)
        workspace.save()
    })
    // oxlint-disable-next-line require-await
    apiWs.post('/api/workspaces/:workspace_id/collapse', async (_context, request) => {
        const {workspace_id} = validateRequest(WorkspaceIdParamsSchema, request.params)
        const {path, tag_modifier, value} = validateRequest(CollapsePathRequestSchema, request.data)
        const workspace = workspaces.get(workspace_id)

        // Determine which mode to use based on the request
        const valueData = value
        const mode = tag_modifier || (valueData && valueData._collapsed === true) ? 'all' : 'groups'

        // Use new pathToggle signature with explicit mode string
        pathToggle(workspace.i18n, path, value as Record<string, unknown>, mode as 'all' | 'groups')

        workspace.save()
    })

    // oxlint-disable-next-line require-await
    apiWs.post('/api/workspaces/:workspace_id/tags', async (_context, request) => {
        const {workspace_id} = validateRequest(WorkspaceIdParamsSchema, request.params)
        const workspace = workspaces.get(workspace_id)
        const {path, source} = validateRequest(UpdateTagRequestSchema, request.data)
        const {id, ref} = pathRef(workspace.i18n, path)
        const refId = ref[id] as {source: string}
        refId.source = source
        workspace.save()
    })

    apiWs.post('/api/workspaces/:workspace_id/translate', async (_context, request) => {
        const {workspace_id} = validateRequest(WorkspaceIdParamsSchema, request.params)
        const workspace = workspaces.get(workspace_id)

        const {ignore_cache, path, value} = validateRequest(TranslateRequestSchema, request.data)

        // Expand the path to ensure it's visible in the UI
        pathToggle(workspace.i18n, path, {_collapsed: false}, 'all' as const)

        if (value) {
            const sourceText = value.source
            const persist = !value._soft

            try {
                const result = await translate_tag(workspace, path, sourceText, persist)
                workspace.save()

                // Return proper translation result for UI feedback
                const response = {
                    cached: [],
                    success: true as const,
                    targets: [result],
                    translations: workspace.config.languages.target.map((lang) => {
                        const resultTag = result.ref[result.id] as {target: Record<string, string>}
                        return resultTag.target[lang.id]
                    }),
                }
                // Validate response matches schema
                validateRequest(TranslateResponseSchema, response)
                return response
            } catch (error) {
                logger.error('Translation error:', error)
                const errorResponse = {
                    cached: [],
                    error: error instanceof Error ? error.message : String(error),
                    success: false as const,
                    targets: [],
                    translations: [],
                }
                // Validate error response matches schema
                validateRequest(TranslateResponseSchema, errorResponse)
                return errorResponse
            }
        } else {
            try {
                const {cached, targets, translations} = await translate_path(workspace, path, ignore_cache)
                workspace.save()
                const response = {cached, success: true as const, targets, translations}
                // Validate response matches schema
                validateRequest(TranslateResponseSchema, response)
                return response
            } catch (error) {
                logger.error('Translation error:', error)
                const errorResponse = {
                    cached: [],
                    error: error instanceof Error ? error.message : String(error),
                    success: false as const,
                    targets: [],
                    translations: [],
                }
                // Validate error response matches schema
                validateRequest(TranslateResponseSchema, errorResponse)
                return errorResponse
            }
        }
    })

    // oxlint-disable-next-line require-await
    apiWs.post('/api/workspaces/:workspace_id/undo', async (_context, request) => {
        const {workspace_id} = validateRequest(WorkspaceIdParamsSchema, request.params)
        const workspace = workspaces.get(workspace_id)
        workspace.undo()
    })

    // oxlint-disable-next-line require-await
    apiWs.post('/api/workspaces/:workspace_id/redo', async (_context, request) => {
        const {workspace_id} = validateRequest(WorkspaceIdParamsSchema, request.params)
        const workspace = workspaces.get(workspace_id)
        workspace.redo()
    })
}

// Default export for backward compatibility
export default function apiI18n(router: {
    get: (path: string, handler: (req: Request, params: Record<string, string>) => Response) => void
}) {
    // HTTP API endpoints using familiar Express-like pattern
    router.get('/api/workspaces/:workspace_id/translations', (req: Request, params: Record<string, string>) => {
        const {param0: workspaceId} = validateRequest(GetTranslationsParamsSchema, params)
        const workspace = workspaces.get(workspaceId)
        const targetLanguages = workspace.config.languages.target
        return new Response(JSON.stringify(i18nFormat(workspace.i18n, targetLanguages)), {
            headers: {'Content-Type': 'application/json'},
        })
    })
}
