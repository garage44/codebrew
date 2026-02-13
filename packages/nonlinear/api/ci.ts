/**
 * CI WebSocket API Routes
 */

import type {WebSocketServerManager} from '@garage44/common/lib/ws-server'

import {validateRequest} from '../lib/api/validate.ts'
import {CIRunner} from '../lib/ci/runner.ts'
import {db} from '../lib/database.ts'
import {CIRunIdParamsSchema, CIRunParamsSchema, CIRunSchema, TriggerCIRunRequestSchema} from '../lib/schemas/ci.ts'
import {logger} from '../service.ts'

export function registerCIWebSocketApiRoutes(wsManager: WebSocketServerManager) {
    // Get CI runs for a ticket
    wsManager.api.get('/api/ci/runs/:ticketId', async (_ctx, req) => {
        const params = validateRequest(CIRunParamsSchema, req.params)

        const runs = db
            .prepare(`
            SELECT * FROM ci_runs
            WHERE ticket_id = ?
            ORDER BY started_at DESC
        `)
            .all(params.ticketId) as Array<{
            completed_at: number | null
            fixes_applied: string | null
            id: string
            output: string | null
            started_at: number
            status: 'running' | 'success' | 'failed' | 'fixed'
            ticket_id: string
        }>

        const validatedRuns = runs.map((run) => validateRequest(CIRunSchema, run))

        return {
            runs: validatedRuns,
        }
    })

    // Get CI run by ID
    wsManager.api.get('/api/ci/runs/id/:id', async (_ctx, req) => {
        const params = validateRequest(CIRunIdParamsSchema, req.params)

        const run = db.prepare('SELECT * FROM ci_runs WHERE id = ?').get(params.id) as
            | {
                  completed_at: number | null
                  fixes_applied: string | null
                  id: string
                  output: string | null
                  started_at: number
                  status: 'running' | 'success' | 'failed' | 'fixed'
                  ticket_id: string
              }
            | undefined

        if (!run) {
            throw new Error('CI run not found')
        }

        const validatedRun = validateRequest(CIRunSchema, run)

        return {
            run: validatedRun,
        }
    })

    // Trigger CI run for a ticket
    wsManager.api.post('/api/ci/run', async (_ctx, req) => {
        const data = validateRequest(TriggerCIRunRequestSchema, req.data)

        // Verify ticket exists
        const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(data.ticket_id)
        if (!ticket) {
            throw new Error('Ticket not found')
        }

        logger.info(`[API] Triggering CI run for ticket ${data.ticket_id}`)

        // Run CI asynchronously
        const runner = new CIRunner()
        runner
            .run(data.ticket_id, data.repository_path)
            .then((result) => {
                // Broadcast CI completion
                wsManager.broadcast('/ci', {
                    result,
                    ticketId: data.ticket_id,
                    type: 'ci:completed',
                })

                logger.info(`[API] CI run completed for ticket ${data.ticket_id}: ${result.success ? 'success' : 'failed'}`)
            })
            .catch((error) => {
                // Broadcast CI error
                wsManager.broadcast('/ci', {
                    error: error.message,
                    ticketId: data.ticket_id,
                    type: 'ci:error',
                })

                logger.error(`[API] CI run error for ticket ${data.ticket_id}: ${error}`)
            })

        return {
            message: 'CI run started',
            success: true,
        }
    })

    // Subscribe to CI updates
    wsManager.on('/ci', (_ws) => {
        logger.debug('[API] Client subscribed to CI updates')
    })
}
