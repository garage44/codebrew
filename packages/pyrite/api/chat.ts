import type {WebSocketServerManager} from '@garage44/common/lib/ws-server'

import fs from 'fs-extra'
import path from 'path'

import {runtime} from '../service.ts'

export function registerChatWebSocketApiRoutes(wsManager: WebSocketServerManager) {
    const apiWs = wsManager.api

    // WebSocket API for real-time chat messages
    apiWs.post('/api/chat/send', async (context, request) => {
        const {groupId, message, user} = request.data

        // Broadcast message to all clients in the group
        wsManager.broadcast(`/chat/${groupId}`, {
            message,
            timestamp: Date.now(),
            user,
        })

        return {status: 'ok'}
    })
}

export default async function (router: unknown) {
    const emojiPath = path.join(runtime.service_dir, 'lib', 'emoji', 'data-ordered-emoji.json')
    const emoji = await fs.readFile(emojiPath, 'utf8')
    const routerTyped = router as {
        get: (
            path: string,
            handler: (req: Request, params: Record<string, string>, session: unknown) => Promise<Response>,
        ) => void
    }
    routerTyped.get('/api/chat/emoji', async (_req: Request, _params: Record<string, string>, _session: unknown) => {
        return new Response(JSON.stringify(emoji), {
            headers: {'Content-Type': 'application/json'},
        })
    })
}
