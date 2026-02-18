import type {VNode} from 'preact'

/** @jsxImportSource preact */
import {registerApp} from '@garage44/common/lib/codebrew-registry'
import {h} from 'preact'

export function Placeholder({name}: {name: string}): VNode {
    return (
        <div class='c-codebrew-placeholder' style={{padding: 'var(--spacer-4)'}}>
            <h2>{name}</h2>
            <p>Coming soon in Codebrew</p>
        </div>
    )
}

registerApp({
    defaultRoute: '/pyrite',
    description: 'Team communication and collaboration',
    icon: 'video_call',
    id: 'pyrite',
    menuItems: [
        {href: '/pyrite', icon: 'forum', text: 'Channels'},
        {href: '/pyrite/settings', icon: 'settings', text: 'Settings'},
    ],
    name: 'Pyrite',
    routes: [
        {component: (): VNode => <Placeholder name='Pyrite' />, default: true, path: '/pyrite'},
        {component: (): VNode => <Placeholder name='Pyrite Settings' />, path: '/pyrite/settings'},
    ],
})
