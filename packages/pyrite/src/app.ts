import {App, store, api, notifier, logger, $t} from '@garage44/common/app'
import {createTypedI18n, i18nFormat} from '@garage44/expressio'
import {h, render} from 'preact'
import {persistantState, volatileState} from './lib/state'
import type {PyriteState} from './types'
import {Main} from './components/main/main'
import {initWebSocketSubscriptions} from '@/lib/ws-subscriptions'
import {type DeepSignal} from 'deepsignal'
import workspace from '@/.expressio.json'
import type {CommonState} from '@garage44/common/types'

const $s = store.state as unknown as DeepSignal<PyriteState>

store.load(
    persistantState as unknown as CommonState & Record<string, unknown>,
    volatileState as unknown as CommonState & Record<string, unknown>,
)

// Initialize WebSocket subscriptions
initWebSocketSubscriptions()

const app = new App()
app.init(
    Main,
    render,
    h,
    i18nFormat(workspace.i18n, workspace.config.languages.target),
    {enableBunchy: process.env.NODE_ENV !== 'production'},
)

/*
 * Export typed i18n object for type-safe translation references
 * The type is inferred from the workspace JSON structure
 * This is the i18n for the Pyrite UI itself
 */
const i18n = createTypedI18n(workspace)

export {$s, app, i18n, store, api, notifier, logger, $t}
