import type {CommonState} from '@garage44/common/types'
import type {DeepSignal} from 'deepsignal'

import {App, api, logger, notifier, store, $t} from '@garage44/common/app'
import {h, render} from 'preact'

import {Main} from '@/components/main/main'

import {persistantState, volatileState} from './lib/state'

type CodebrewState = typeof persistantState & typeof volatileState
const $s = store.state as unknown as DeepSignal<CodebrewState>

store.load(
    persistantState as unknown as CommonState & Record<string, unknown>,
    volatileState as unknown as CommonState & Record<string, unknown>,
)

const app = new App()

app.init(Main, render, h, {}, {enableBunchy: process.env.NODE_ENV !== 'production'})

export {$s, app, api, logger, notifier, store, $t}
