import {getAvatarUrl} from '@garage44/common/lib/avatar'

import {$s} from '@/app'

export const PresenceWidget = () => {
    const users = $s.chat?.users ? Object.entries($s.chat.users) : []
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
