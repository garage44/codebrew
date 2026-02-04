import {
    persistentState as commonPersistantState,
    volatileState as commonVolatileState,
} from '@garage44/common/lib/state'
import {mergeDeep} from '@garage44/common/lib/utils'

// Use const assertions for the state objects
const persistantState = mergeDeep({
    panels: {
        context: {
            collapsed: false,
            width: 600,
        },
    },
}, commonPersistantState)

const volatileState = mergeDeep({
    tickets: [] as Array<{
        id: string
        repository_id: string
        title: string
        description: string | null
        status: 'backlog' | 'todo' | 'in_progress' | 'review' | 'closed'
        priority: number | null
        assignee_type: 'agent' | 'human' | null
        assignee_id: string | null
        assignees: Array<{assignee_type: 'agent' | 'human', assignee_id: string}>
        labels: string[]
        branch_name: string | null
        merge_request_id: string | null
        created_at: number
        updated_at: number
        repository_name: string | null
    }>,
    repositories: [] as Array<{
        id: string
        name: string
        path: string
        platform: 'github' | 'gitlab' | 'local'
        remote_url: string | null
        config: string
        created_at: number
        updated_at: number
    }>,
    agents: [] as Array<{
        id: string
        name: string
        username: string
        displayName: string
        avatar: string
        status: 'idle' | 'working' | 'error' | 'offline'
        type: 'planner' | 'developer' | 'reviewer'
        config: string
        enabled: number
        created_at: number
        isAgent: true
        currentTicketId: string | null
        lastActivity: number
        serviceOnline?: boolean
        stats?: {
            completed: number
            failed: number
            pending: number
            processing: number
        }
    }>,
    labelDefinitions: [] as Array<{
        color: string
        created_at: number
        id: string
        name: string
        updated_at: number
    }>,
    docs: [] as Array<{
        id: string
        path: string
        title: string
        content: string
        author_id: string
        created_at: number
        updated_at: number
        tags?: string[]
        labelDefinitions?: Array<{color: string; name: string}>
    }>,
    selectedDoc: null as string | null,
    selectedRepository: null as string | null,
    selectedTicket: null as string | null,
    selectedLane: null as 'backlog' | 'todo' | 'in_progress' | 'review' | 'closed' | null,
    anthropic: {
        usage: {
            count: 0,
            limit: 1000000,
            // Default limit: 1M tokens per month (typical Anthropic tier)
            loading: false,
        },
    },
}, commonVolatileState)

export {
    persistantState,
    volatileState,
}
