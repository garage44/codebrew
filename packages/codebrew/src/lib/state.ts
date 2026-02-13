import {persistentState as commonPersistantState, volatileState as commonVolatileState} from '@garage44/common/lib/state'
import {mergeDeep} from '@garage44/common/lib/utils'

const persistantState = mergeDeep({...commonPersistantState} as Record<string, unknown>, {
    activeApp: null as 'expressio' | 'nonlinear' | 'pyrite' | null,
}) as typeof commonPersistantState & {activeApp: 'expressio' | 'nonlinear' | 'pyrite' | null}

const volatileState = mergeDeep(
    {
        agents: [],
        anthropic: {usage: {count: 0, limit: 1_000_000, loading: false}},
        docs: [],
        labelDefinitions: [],
        repositories: [],
        selectedDoc: null,
        selectedLane: null,
        selectedRepository: null,
        selectedTicket: null,
        tickets: [],
    },
    commonVolatileState,
)

export {persistantState, volatileState}
