import type {WebSocketServerManager} from '@garage44/common/lib/ws-server'

import fs from 'fs-extra'
import path from 'path'

import {runtime} from '../service.ts'

const acceptedLanguages = ['de', 'en', 'nl', 'fr']

export function registerI18nWebSocketApiRoutes(_wsManager: WebSocketServerManager) {
    // Add any WebSocket-based i18n routes if needed in the future
}

export default async function (router: unknown) {
    const routerTyped = router as {
        get: (
            path: string,
            handler: (req: Request, params: Record<string, string>, session: unknown) => Promise<Response>,
        ) => void
    }
    routerTyped.get('/api/i18n/:language', async (_req: Request, params: Record<string, string>, _session: unknown) => {
        const language = params.param0
        if (acceptedLanguages.includes(language)) {
            const i18nTags = await fs.readFile(path.join(runtime.service_dir, 'i18n', `${language}.json`), 'utf8')
            return new Response(i18nTags, {
                headers: {'Content-Type': 'application/json'},
            })
        }
        return new Response(JSON.stringify({error: 'invalid language'}), {
            headers: {'Content-Type': 'application/json'},
            status: 404,
        })
    })
}
