import type {CommonState} from '@garage44/common/types'
import type {DeepSignal} from 'deepsignal'

import {App, api, logger, notifier, store, $t} from '@garage44/common/app'
import {h, render, type ComponentChild} from 'preact'

import {Main} from '@/components/main/main'

import type {CodebrewState} from './types'

import {persistantState, volatileState} from './lib/state'

const $s = store.state as unknown as DeepSignal<CodebrewState>

store.load(
    persistantState as unknown as CommonState & Record<string, unknown>,
    volatileState as unknown as CommonState & Record<string, unknown>,
)

const app = new App()

app.init(
    Main,
    (vnode: unknown, container: HTMLElement): void => {
        render(vnode as ComponentChild, container)
    },
    h as (...args: unknown[]) => unknown,
    {},
    {enableBunchy: process.env.NODE_ENV !== 'production'},
)

export {$s, app, api, logger, notifier, store, $t}
