import {App, store} from '@garage44/common/app'
import {h, render} from 'preact'
import {persistantState, volatileState} from './lib/state'
import type {NonlinearState} from './types'
import {Main} from '@/components/main/main'
import {type DeepSignal} from 'deepsignal'

const $s = store.state as unknown as DeepSignal<NonlinearState>

store.load(persistantState, volatileState)

// Expose global variables in development for debugging
if (process.env.NODE_ENV !== 'production' || process.env.BUN_ENV === 'development') {
    if (typeof window !== 'undefined') {
        (window as {$s?: typeof $s}).$s = $s;
        (window as {store?: typeof store}).store = store
    }
    if (typeof globalThis !== 'undefined') {
        (globalThis as {$s?: typeof $s}).$s = $s;
        (globalThis as {store?: typeof store}).store = store
    }
}

const app = new App()

// No i18n for now
app.init(
    Main,
    render,
    h,
    {},
    {enableBunchy: process.env.NODE_ENV !== 'production'},
)

export {$s, app}
