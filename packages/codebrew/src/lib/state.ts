import {
    persistentState as commonPersistantState,
    volatileState as commonVolatileState,
} from '@garage44/common/lib/state'
import {mergeDeep} from '@garage44/common/lib/utils'

const persistantState = mergeDeep({
    activeApp: null as 'expressio' | 'nonlinear' | 'pyrite' | null,
}, commonPersistantState)

const volatileState = mergeDeep({
    tickets: [],
    repositories: [],
    agents: [],
    labelDefinitions: [],
    docs: [],
    selectedDoc: null,
    selectedRepository: null,
    selectedTicket: null,
    selectedLane: null,
    anthropic: {usage: {count: 0, limit: 1000000, loading: false}},
}, commonVolatileState)

export {
    persistantState,
    volatileState,
}
