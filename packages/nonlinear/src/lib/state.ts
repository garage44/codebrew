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
}, commonPersistantState) as typeof commonPersistantState & {
    panels: {
        context: {
            collapsed: boolean
            width: number
        }
    }
}

const volatileState = mergeDeep({
    agents: [] as {
        avatar: string
        config: string
        created_at: number
        currentTicketId: string | null
        displayName: string
        enabled: number
        id: string
        isAgent: true
        lastActivity: number
        name: string
        serviceOnline?: boolean
        stats?: {
            completed: number
            failed: number
            pending: number
            processing: number
        }
        status: 'idle' | 'working' | 'error' | 'offline'
        type: 'planner' | 'developer' | 'reviewer'
        username: string
    }[],
    anthropic: {
        usage: {
            count: 0,
            limit: 1_000_000,
            // Default limit: 1M tokens per month (typical Anthropic tier)
            loading: false,
        },
    },
    docs: [] as {
        author_id: string
        content: string
        created_at: number
        id: string
        labelDefinitions?: {color: string; name: string}[]
        path: string
        tags?: string[]
        title: string
        updated_at: number
    }[],
    labelDefinitions: [] as {
        color: string
        created_at: number
        id: string
        name: string
        updated_at: number
    }[],
    repositories: [] as {
        config: string
        created_at: number
        id: string
        name: string
        path: string
        platform: 'github' | 'gitlab' | 'local'
        remote_url: string | null
        updated_at: number
    }[],
    selectedDoc: null as string | null,
    selectedLane: null as 'backlog' | 'todo' | 'in_progress' | 'review' | 'closed' | null,
    selectedRepository: null as string | null,
    selectedTicket: null as string | null,
    tickets: [] as {
        assignee_id: string | null
        assignee_type: 'agent' | 'human' | null
        assignees: {assignee_id: string; assignee_type: 'agent' | 'human'}[]
        branch_name: string | null
        created_at: number
        description: string | null
        id: string
        labels: string[]
        merge_request_id: string | null
        priority: number | null
        repository_id: string
        repository_name: string | null
        status: 'backlog' | 'todo' | 'in_progress' | 'review' | 'closed'
        title: string
        updated_at: number
    }[],
}, commonVolatileState)

export {
    persistantState,
    volatileState,
}
