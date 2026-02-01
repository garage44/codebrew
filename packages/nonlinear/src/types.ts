import type {CommonState} from '@garage44/common/types'

export interface NonlinearState extends CommonState {
    agents: Array<{
        config: string
        created_at: number
        enabled: number
        id: string
        name: string
        type: 'prioritizer' | 'developer' | 'reviewer'
    }>
    labelDefinitions: Array<{
        color: string
        created_at: number
        id: string
        name: string
        updated_at: number
    }>
    repositories: Array<{
        config: string
        created_at: number
        id: string
        name: string
        path: string
        platform: 'github' | 'gitlab' | 'local'
        remote_url: string | null
        updated_at: number
    }>
    docs: Array<{
        id: string
        path: string
        title: string
        content: string
        author_id: string
        created_at: number
        updated_at: number
        tags?: string[]
        labelDefinitions?: Array<{color: string; name: string}>
    }>
    selectedDoc: string | null
    selectedLane: 'backlog' | 'todo' | 'in_progress' | 'review' | 'closed' | null
    selectedRepository: string | null
    selectedTicket: string | null
    tickets: Array<{
        assignee_id: string | null
        assignee_type: 'agent' | 'human' | null
        assignees: Array<{assignee_type: 'agent' | 'human', assignee_id: string}>
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
    }>
}
