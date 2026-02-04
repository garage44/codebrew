// oxlint-disable-next-line consistent-type-specifier-style
import {type DeepSignal, deepSignal} from 'deepsignal'
import {copyObject, mergeDeep} from './utils'
import type {CommonState} from '../types'


export class Store<StateType extends Record<string, unknown> = Record<string, unknown>> {
    state: DeepSignal<StateType>

    persistantState?: StateType

    constructor() {
        this.state = deepSignal({} as StateType)
    }

    load(persistantState: StateType, volatileState: Partial<StateType>) {
        this.persistantState = copyObject(persistantState)

        let restoredState = {}
        try {
            restoredState = JSON.parse(localStorage.getItem('store') || '{}')
        } catch {
            restoredState = {}
        }

        // Check for HMR state (from hot module replacement)
        let hmrState = {}
        if (typeof globalThis !== 'undefined' && globalThis.__HMR_STATE__) {
            try {
                hmrState = globalThis.__HMR_STATE__ as Record<string, unknown>
                // Clear HMR state after reading
                globalThis.__HMR_STATE__ = null
            } catch {
                hmrState = {}
            }
        }

        // Merge order: persistantState + localStorage + HMR state + volatileState
        Object.assign(this.state, mergeDeep(mergeDeep(mergeDeep(persistantState as Record<string, unknown>, restoredState), hmrState), volatileState as Record<string, unknown>))
        if ('beta' in this.state && (this.state as Record<string, unknown>).beta) {
            globalThis.$s = this.state as unknown as DeepSignal<CommonState>
        }
    }

    filterKeys(obj: Record<string, unknown>, blueprint: Record<string, unknown>): Record<string, unknown> {
        const result: Record<string, unknown> = {}
        for (const key in blueprint) {
            if (Object.hasOwn(obj, key)) {
                if (typeof blueprint[key] === 'object' && blueprint[key] !== null) {
                    result[key] = this.filterKeys(obj[key] as Record<string, unknown>, blueprint[key] as Record<string, unknown>)
                } else {
                    result[key] = obj[key]
                }
            }
        }
        return result
    }

    save() {
        if (this.persistantState) {
            localStorage.setItem('store', JSON.stringify(this.filterKeys(this.state as Record<string, unknown>, this.persistantState as Record<string, unknown>)))
        }
    }
}
