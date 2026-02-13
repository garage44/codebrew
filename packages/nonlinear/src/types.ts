import type {CommonState} from '@garage44/common/types'

import type {EnrichedAgent, LabelDefinition, EnrichedTicket, EnrichedDoc, Repository} from '../lib/schemas/index.ts'

/** Frontend agent shape - uses displayName and includes isAgent, username for UI */
export type FrontendAgent = Omit<EnrichedAgent, 'display_name'> & {
    displayName: string
    display_name?: string
    isAgent: true
    stats: {completed: number; failed: number; pending: number; processing: number}
    username: string
}

export interface NonlinearState extends CommonState {
    agents: Array<FrontendAgent>
    anthropic: {
        usage: {
            count: number
            limit: number
            loading: boolean
        }
    }
    docs: Array<EnrichedDoc>
    labelDefinitions: Array<LabelDefinition>
    repositories: Array<Repository>
    selectedDoc: string | null
    selectedLane: 'backlog' | 'todo' | 'in_progress' | 'review' | 'closed' | null
    selectedRepository: string | null
    selectedTicket: string | null
    tickets: Array<EnrichedTicket>
}
