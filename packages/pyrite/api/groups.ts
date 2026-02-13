import type {WebSocketServerManager} from '@garage44/common/lib/ws-server'

import fs from 'fs-extra'
import path from 'node:path'

import type {Router, Session} from '../lib/middleware.ts'

import {validateRequest} from '../lib/api/validate.ts'
import {getSfuPath} from '../lib/config.ts'
import {groupTemplate, loadGroup, loadGroups, saveGroup, syncGroup} from '../lib/group.ts'
import {GroupIdPathSchema, GroupSyncRequestSchema, GroupDataSchema} from '../lib/schemas/groups.ts'
import {syncUsers} from '../lib/sync.ts'

export function registerGroupsWebSocketApiRoutes(wsManager: WebSocketServerManager) {
    const apiWs = wsManager.api

    // WebSocket API for group state synchronization
    apiWs.post('/api/groups/:groupid/sync', async (context, request) => {
        const {param0: groupid} = validateRequest(GroupIdPathSchema, {param0: request.params.groupid})
        const {state} = validateRequest(GroupSyncRequestSchema, request.data)

        // Broadcast group state changes to all clients
        wsManager.broadcast(`/group/${groupid}/state`, {
            state,
            timestamp: Date.now(),
        })

        return {status: 'ok'}
    })
}

export default function (router: Router) {
    router.get('/api/groups', async (_req: Request, _params: Record<string, string>, _session?: Session) => {
        const {groupsData} = await loadGroups()
        return new Response(JSON.stringify(groupsData), {
            headers: {'Content-Type': 'application/json'},
        })
    })

    router.get('/api/groups/public', async (_req: Request, _params: Record<string, string>, _session?: Session) => {
        const {groupsData} = await loadGroups(true)
        return new Response(JSON.stringify(groupsData), {
            headers: {'Content-Type': 'application/json'},
        })
    })

    router.get(
        '/api/groups/template',
        async (_req: Request, _params: Record<string, string>, _session?: Session) =>
            new Response(JSON.stringify(groupTemplate()), {
                headers: {'Content-Type': 'application/json'},
            }),
    )

    router.get('/api/groups/:groupid', async (_req: Request, params: Record<string, string>, _session?: Session) => {
        const {param0: groupId} = validateRequest(GroupIdPathSchema, params)
        // Basic path traversal protection
        if (groupId.match(/\.\.\//g) !== null) {
            return new Response(JSON.stringify({error: 'invalid group id'}), {
                headers: {'Content-Type': 'application/json'},
                status: 400,
            })
        }

        const groupData = await loadGroup(groupId)
        if (!groupData) {
            return new Response(JSON.stringify(groupTemplate(groupId)), {
                headers: {'Content-Type': 'application/json'},
            })
        }

        return new Response(JSON.stringify(groupData), {
            headers: {'Content-Type': 'application/json'},
        })
    })

    router.post('/api/groups/:groupid', async (req: Request, params: Record<string, string>, _session?: Session) => {
        const {param0: groupIdParam} = validateRequest(GroupIdPathSchema, params)
        const body = validateRequest(GroupDataSchema, await req.json())
        const {data, groupId} = await saveGroup(groupIdParam, body as Parameters<typeof saveGroup>[1])
        await syncGroup(groupId, data)
        await syncUsers()

        const group = await loadGroup(groupId)
        if (group) {
            group._name = params.param0
            group._newName = groupId
        }
        return new Response(JSON.stringify(group), {
            headers: {'Content-Type': 'application/json'},
        })
    })

    router.get('/api/groups/:groupid/delete', async (_req: Request, params: Record<string, string>, _session?: Session) => {
        const {param0: groupId} = validateRequest(GroupIdPathSchema, params)
        const groupFile = path.join(getSfuPath(), 'groups', `${groupId}.json`)
        await fs.remove(groupFile)
        const {groupNames} = await loadGroups()
        await syncUsers()
        return new Response(JSON.stringify(groupNames), {
            headers: {'Content-Type': 'application/json'},
        })
    })
}
