import {store} from '@garage44/common/app'
import {registerApp} from '@garage44/common/lib/codebrew-registry'
import {getAvatarUrl} from '@garage44/common/lib/avatar'
import {h} from 'preact'

import {registerPresenceWebSocket} from './api/ws-presence'

const PresenceWidget = () => {
    const users = store.state?.chat?.users ? Object.entries(store.state.chat.users) : []
    const onlineCount = users.length

    if (onlineCount === 0) {
        return null
    }

    return (
        <div class='c-presence-widget'>
            <div class='avatars'>
                {users.slice(0, 5).map(([userId, userInfo]) => {
                    const user =
                        typeof userInfo === 'object' && userInfo !== null && 'avatar' in userInfo
                            ? (userInfo as {avatar: string; username?: string})
                            : {avatar: '', username: ''}
                    return (
                        <img
                            alt={user.username || 'User'}
                            class='avatar'
                            key={userId}
                            src={getAvatarUrl(user.avatar, String(userId))}
                            title={user.username}
                        />
                    )
                })}
            </div>
            {onlineCount > 5 && <span class='count'>+{onlineCount - 5}</span>}
        </div>
    )
}

const Placeholder = ({name}: {name: string}) => (
    <div class='c-codebrew-placeholder' style={{padding: 'var(--spacer-4)'}}>
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
    presenceWidget: PresenceWidget,
    routes: [
        {component: () => <Placeholder name='Pyrite' />, default: true, path: '/pyrite'},
        {component: () => <Placeholder name='Pyrite Settings' />, path: '/pyrite/settings'},
    ],
    wsRoutes: (wsManager) => {
        registerPresenceWebSocket(wsManager)
    },
})
