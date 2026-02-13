import {deleteRecording, loadRecordings, recordingPath} from '../lib/recording.ts'

export default function (router: unknown) {
    const routerTyped = router as {
        get: (
            path: string,
            handler: (req: Request, params: Record<string, string>, session: unknown) => Promise<Response>,
        ) => void
    }

    routerTyped.get('/api/recordings/:groupid', async (_req: Request, params: Record<string, string>, _session: unknown) => {
        const groupId = params.param0
        const recordings = await loadRecordings(groupId)
        return new Response(JSON.stringify(recordings), {
            headers: {'Content-Type': 'application/json'},
        })
    })

    routerTyped.get(
        '/api/recordings/:groupid/:recording',
        async (_req: Request, params: Record<string, string>, _session: unknown) => {
            const groupId = params.param0
            const recording = params.param1
            const recordingTarget = recordingPath(groupId, recording)

            // Serve the recording file
            try {
                const file = Bun.file(recordingTarget)
                if (await file.exists()) {
                    return new Response(file)
                }
                return new Response(JSON.stringify({error: 'recording not found'}), {
                    headers: {'Content-Type': 'application/json'},
                    status: 404,
                })
            } catch {
                return new Response(JSON.stringify({error: 'failed to load recording'}), {
                    headers: {'Content-Type': 'application/json'},
                    status: 500,
                })
            }
        },
    )

    routerTyped.get(
        '/api/recordings/:groupid/:recording/delete',
        async (_req: Request, params: Record<string, string>, _session: unknown) => {
            const groupId = params.param0
            const recording = params.param1

            const recordings = await deleteRecording(groupId, recording)
            return new Response(JSON.stringify(recordings), {
                headers: {'Content-Type': 'application/json'},
            })
        },
    )
}
