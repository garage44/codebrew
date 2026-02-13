import {App, store, $t, api, notifier, logger, events, ws, i18n} from '@garage44/common/app'
import {type DeepSignal} from 'deepsignal'
import {h, render} from 'preact'

import {Main} from '@/components/main/main'

import type {NonlinearState} from './types'

import {persistantState, volatileState} from './lib/state'

const $s = store.state as unknown as DeepSignal<NonlinearState>

// eslint-disable-next-line @typescript-eslint/no-explicit-any
store.load(persistantState as any, volatileState)

// Expose global variables in development for debugging
if (process.env.NODE_ENV !== 'production' || process.env.BUN_ENV === 'development') {
    if (typeof window !== 'undefined') {
        ;(window as {$s?: typeof $s}).$s = $s
        ;(window as {store?: typeof store}).store = store
    }
    if (typeof globalThis !== 'undefined') {
        ;(globalThis as {$s?: typeof $s}).$s = $s
        ;(globalThis as {store?: typeof store}).store = store
    }
}

const app = new App()

// No i18n for now
app.init(Main, render, h, {}, {enableBunchy: process.env.NODE_ENV !== 'production'})

// Re-export common app exports so @/app resolves correctly for common components
export {$s, app, $t, api, notifier, logger, store, events, ws, i18n}
