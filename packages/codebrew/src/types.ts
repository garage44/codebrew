import type {Notification} from '@garage44/common/lib/notifier'
import type {CommonState} from '@garage44/common/types'

/** Extended state for Codebrew - includes all app-specific state (nonlinear, pyrite, expressio) */
export interface CodebrewState extends CommonState {
    activeApp: 'expressio' | 'nonlinear' | 'pyrite' | null
    agents?: unknown[]
    labelDefinitions?: unknown[]
    notifications: Notification[]
    panels: {
        context: {collapsed: boolean; width?: number}
        menu: {collapsed: boolean; width?: number}
    }
    repositories?: unknown[]
    selectedDoc?: unknown
    selectedLane?: string | null
    selectedRepository?: unknown
    selectedTicket?: unknown
    tickets?: unknown[]
}
