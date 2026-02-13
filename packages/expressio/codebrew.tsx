import {registerApp} from '@garage44/common/lib/codebrew-registry'
import {h} from 'preact'

const Placeholder = ({name}: {name: string}) => (
    <div class='c-codebrew-placeholder' style={{padding: 'var(--spacer-4)'}}>
        <h2>{name}</h2>
        <p>Coming soon in Codebrew</p>
    </div>
)

registerApp({
    defaultRoute: '/expressio/translations',
    icon: 'translate',
    id: 'expressio',
    menuItems: [
        {href: '/expressio/translations', icon: 'translate', text: 'Translations'},
        {href: '/expressio/config', icon: 'workspace', text: 'Settings'},
    ],
    name: 'Expressio',
    routes: [
        {component: () => <Placeholder name='Expressio' />, default: true, path: '/expressio/translations'},
        {component: () => <Placeholder name='Expressio Settings' />, path: '/expressio/config'},
    ],
})
