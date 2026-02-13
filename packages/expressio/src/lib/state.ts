import {
    persistentState as commonPersistantState,
    volatileState as commonVolatileState,
} from '@garage44/common/lib/state'
import {mergeDeep} from '@garage44/common/lib/utils'
import type {ExpressioState} from '../types'

// Use const assertions for the state objects
const persistantState = mergeDeep({}, commonPersistantState) as ExpressioState

const volatileState = mergeDeep({
    enola: {
        engines: {},
        languages: {
            source: [],
            target: [],
        },
    },
    filter: '',
    sort: 'asc' as 'asc' | 'desc',
    tags: {
        updated: false,
    },
    workspace: null,
    workspaces: [],
}, commonVolatileState) as Partial<ExpressioState>

export {
    persistantState,
    volatileState,
}
