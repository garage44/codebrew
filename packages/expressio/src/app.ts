import type {CommonState} from '@garage44/common/types'
import type {DeepSignal} from 'deepsignal'

import {App, api, logger, notifier, store} from '@garage44/common/app'
import {$t, createTypedI18n, i18nFormat} from '@garage44/expressio'
import {h, render} from 'preact'

import workspace from '@/.expressio.json'
import {Main} from '@/components/main/main'

import type {ExpressioState} from './types'

import {persistantState, volatileState} from './lib/state'

const $s = store.state as unknown as DeepSignal<ExpressioState>

store.load(
    persistantState as unknown as CommonState & Record<string, unknown>,
    volatileState as unknown as CommonState & Record<string, unknown>,
)

const app = new App()

app.init(
    Main,
    render as (vnode: unknown, container: HTMLElement) => void,
    h as (...args: unknown[]) => unknown,
    i18nFormat(workspace.i18n, workspace.config.languages.target),
    {
        enableBunchy: process.env.NODE_ENV !== 'production',
    },
)

/*
 * Export typed i18n object for type-safe translation references
 * The type is inferred from the workspace JSON structure
 * This is the i18n for the Expressio UI itself, not the workspace being managed
 */
const i18n = createTypedI18n(workspace)

export {$s, app, api, i18n, logger, notifier, store, $t}
