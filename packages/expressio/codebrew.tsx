/** @jsxImportSource preact */
import type {VNode} from 'preact'
import {h} from 'preact'

import {registerApp} from '@garage44/common/lib/codebrew-registry'

import {logger} from './service'

export function Placeholder({name}: {name: string}): VNode {
    return (
        <div class='c-codebrew-placeholder' style={{padding: 'var(--spacer-4)'}}>
            <h2>{name}</h2>
            <p>Coming soon in Codebrew</p>
        </div>
    )
}

registerApp({
    defaultRoute: '/expressio/translations',
    description: 'Internationalization and translation management',
    icon: 'translate',
    id: 'expressio',
    menuItems: [
        {href: '/expressio/translations', icon: 'translate', text: 'Translations'},
        {href: '/expressio/config', icon: 'workspace', text: 'Settings'},
    ],
    name: 'Expressio',
    onInit: () => logger.info('initialized'),
    routes: [
        {component: (): VNode => <Placeholder name='Expressio' />, default: true, path: '/expressio/translations'},
        {component: (): VNode => <Placeholder name='Expressio Settings' />, path: '/expressio/config'},
    ],
})
