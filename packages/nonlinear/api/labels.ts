/**
 * Label Definitions WebSocket API Routes
 */

import type {WebSocketServerManager} from '@garage44/common/lib/ws-server'
import {
    deleteLabelDefinition,
    getLabelDefinition,
    getLabelDefinitions,
    upsertLabelDefinition,
} from '../lib/database.ts'
import {logger} from '../service.ts'
import {randomId} from '@garage44/common/lib/utils'
import {
    CreateLabelRequestSchema,
    LabelNameParamsSchema,
    LabelParamsSchema,
    UpdateLabelRequestSchema,
} from '../lib/schemas/labels.ts'
import {validateRequest} from '../lib/api/validate.ts'

export function registerLabelsWebSocketApiRoutes(wsManager: WebSocketServerManager) {
    // Get all label definitions
    wsManager.api.get('/api/labels', async(_ctx, _req) => {
        const labels = getLabelDefinitions()

        return {
            labels,
        }
    })

    // Get label definition by name
    wsManager.api.get('/api/labels/:name', async(_ctx, req) => {
        const params = validateRequest(LabelNameParamsSchema, req.params)
        const label = getLabelDefinition(params.name)

        if (!label) {
            throw new Error('Label not found')
        }

        return {
            label,
        }
    })

    // Create or update label definition
    wsManager.api.post('/api/labels', async(_ctx, req) => {
        const data = validateRequest(CreateLabelRequestSchema, req.data)

        const labelId = data.id || `label-${data.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Date.now()}`
        upsertLabelDefinition(labelId, data.name, data.color)

        const label = getLabelDefinition(data.name)

        if (!label) {
            throw new Error('Failed to create label')
        }

        // Broadcast label update
        wsManager.broadcast('/labels', {
            label,
            type: 'label:updated',
        })

        logger.info(`[API] Created/updated label definition: ${data.name}`)

        return {
            label,
        }
    })

    // Update label definition
    wsManager.api.put('/api/labels/:id', async(_ctx, req) => {
        const params = validateRequest(LabelParamsSchema, req.params)
        const data = validateRequest(UpdateLabelRequestSchema, req.data)

        const existing = getLabelDefinitions().find((l) => l.id === params.id)
        if (!existing) {
            throw new Error('Label not found')
        }

        const updatedName = data.name || existing.name
        const updatedColor = data.color || existing.color

        upsertLabelDefinition(params.id, updatedName, updatedColor)

        const label = getLabelDefinition(updatedName)

        if (!label) {
            throw new Error('Failed to update label')
        }

        // Broadcast label update
        wsManager.broadcast('/labels', {
            label,
            type: 'label:updated',
        })

        logger.info(`[API] Updated label definition: ${params.id}`)

        return {
            label,
        }
    })

    // Delete label definition
    wsManager.api.delete('/api/labels/:id', async(_ctx, req) => {
        const params = validateRequest(LabelParamsSchema, req.params)

        const existing = getLabelDefinitions().find((l) => l.id === params.id)
        if (!existing) {
            throw new Error('Label not found')
        }

        deleteLabelDefinition(params.id)

        // Broadcast label deletion
        wsManager.broadcast('/labels', {
            labelId: params.id,
            type: 'label:deleted',
        })

        logger.info(`[API] Deleted label definition: ${params.id}`)

        return {
            success: true,
        }
    })
}
