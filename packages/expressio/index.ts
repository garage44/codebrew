import {Store} from '@garage44/common/lib/store'
import {I18N_PATH_SYMBOL, create$t, i18nFormat} from './lib/i18n'
import {keyMod, keyPath} from '@garage44/common/lib/utils'
import {persistantState, volatileState} from './src/lib/state'
import type {ExpressioState} from './src/types'

// Create Expressio's store instance
const store = new Store<ExpressioState>()
store.load(persistantState, volatileState)

// Create $t function using Expressio's store
const $t = create$t(store)

/**
 * Creates a typed i18n object from a workspace JSON structure.
 * Attaches path symbols to translation objects for type-safe $t() references.
 *
 * @param workspace - Workspace object with i18n property
 * @returns Typed i18n object with path symbols attached
 */
function createTypedI18n<T extends {i18n: Record<string, unknown>}>(workspace: T): T['i18n'] {
    // Create a shallow copy to avoid mutating the original
    const i18n = {...workspace.i18n}

    // Attach path symbols to translation objects
    keyMod(i18n, (_srcRef, _id, refPath) => {
        const sourceRef = keyPath(i18n, refPath)
        if (typeof sourceRef === 'object' && sourceRef !== null && 'source' in sourceRef && refPath.length > 0) {
            const pathString = `i18n.${refPath.join('.')}`;
            (sourceRef as Record<symbol, string>)[I18N_PATH_SYMBOL] = pathString
        }
    })

    return i18n
}

export {
    $t,
    createTypedI18n,
    i18nFormat,
    I18N_PATH_SYMBOL,
}
