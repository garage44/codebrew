import type {WebSocketServerManager} from '@garage44/common/lib/ws-server'

import path from 'node:path'

import type {WorkspaceDescription} from '../src/types'

import {logger} from '../service.ts'
import {Workspace} from './workspace'

export class Workspaces {
    private wsManager?: WebSocketServerManager

    workspaces: Workspace[] = []

    setWebSocketManager(wsManager: WebSocketServerManager) {
        this.wsManager = wsManager
    }

    async init(workspaces: string[]) {
        if (workspaces.length) {
            await Promise.all(workspaces.map((source_file) => this.add({source_file})))
        }
    }

    async add(description: WorkspaceDescription) {
        if (!path.isAbsolute(description.source_file)) {
            throw new Error(`[workspaces] no absolute path provided: ${description.source_file}`)
        }

        const workspace = new Workspace()
        await workspace.init(description, true, this.wsManager)
        this.workspaces.push(workspace)

        return workspace
    }

    delete(workspace_id) {
        this.workspaces = this.workspaces.filter((i) => i.config.workspace_id !== workspace_id)
        logger.info(`[workspaces] removed workspace ${workspace_id} from configuration`)
    }

    get(workspace_id: string): Workspace | null {
        const workspace = this.workspaces.find((i) => i.config.workspace_id === workspace_id) as Workspace
        if (!workspace) {
            return null
        }
        return workspace
    }
}
