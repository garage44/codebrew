import {getAvatarUrl} from '@garage44/common/lib/avatar'
import classnames from 'classnames'

interface UserBadgeProps {
    avatar?: string
    displayName?: string
    size?: 's' | 'd' | 'l'
    userId: string
}

export const UserBadge = ({avatar, displayName, size = 'd', userId}: UserBadgeProps) => {
    const avatarFilename = avatar || 'placeholder-1.png'
    const avatarUrl = getAvatarUrl(avatarFilename, userId)

    return (
        <div class='c-user-badge'>
            <div class={classnames('c-user-avatar', `size-${size}`)}>
                <img alt={displayName || userId} class='avatar' src={avatarUrl} />
            </div>
            <span class='user-name'>{displayName || userId}</span>
        </div>
    )
}
