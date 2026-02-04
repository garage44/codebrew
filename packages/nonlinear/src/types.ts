import type {CommonState} from '@garage44/common/types'
import type {
    EnrichedAgent,
    LabelDefinition,
    EnrichedTicket,
    EnrichedDoc,
    Repository,
} from '../lib/schemas/index.ts'

export interface NonlinearState extends CommonState {
    agents: Array<EnrichedAgent>
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
