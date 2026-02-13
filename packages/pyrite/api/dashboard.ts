import {loadStats} from '../lib/dashboard.ts'

export default function (router: unknown) {
    const routerTyped = router as {
        get: (
            path: string,
            handler: (req: Request, params: Record<string, string>, session: unknown) => Promise<Response>,
        ) => void
    }

    routerTyped.get('/api/dashboard/:groupid', async (_req: Request, params: Record<string, string>, _session: unknown) => {
        const groupId = params.param0
        const stats = await loadStats(groupId)
        return new Response(JSON.stringify(stats), {
            headers: {'Content-Type': 'application/json'},
        })
    })
}
