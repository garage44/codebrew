import {h} from 'preact'
import {registerApp} from '@garage44/common/lib/codebrew-registry'

const Placeholder = ({name}: {name: string}) => (
    <div class="c-codebrew-placeholder" style={{padding: 'var(--spacer-4)'}}>
        <h2>{name}</h2>
        <p>Coming soon in Codebrew</p>
    </div>
)

registerApp({
    defaultRoute: '/pyrite',
    icon: 'video_call',
    id: 'pyrite',
    menuItems: [
        {href: '/pyrite', icon: 'forum', text: 'Channels'},
        {href: '/pyrite/settings', icon: 'settings', text: 'Settings'},
    ],
    name: 'Pyrite',
    routes: [
        {component: () => <Placeholder name="Pyrite" />, default: true, path: '/pyrite'},
        {component: () => <Placeholder name="Pyrite Settings" />, path: '/pyrite/settings'},
    ],
})
