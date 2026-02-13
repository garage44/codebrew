import classnames from 'classnames'

import {store} from '@/app'
import {getAvatarUrl} from '@/lib/avatar'

import {ContextMenu} from '../context-menu/context-menu'
import {MenuItem} from '../menu-item/menu-item'

interface UserMenuProps {
    className?: string
    collapsed?: boolean
    onLogout?: () => void
    settingsHref?: string
    user?: {
        id?: string
        profile?: {
            avatar?: string
            displayName?: string
        }
    }
}

/**
 * UserMenu - User menu with avatar icon and context menu
 * Contains theme toggle and logout options
 */
const themes = ['light', 'dark', 'system'] as const

const cycleTheme = () => {
    const currentIndex = themes.indexOf(store.state.theme)
    const nextIndex = (currentIndex + 1) % themes.length
    store.state.theme = themes[nextIndex]
}

const getThemeIcon = () => {
    if (store.state.theme === 'light') {
        return 'sun'
    }
    if (store.state.theme === 'dark') {
        return 'moon'
    }
    return 'system'
}

export const UserMenu = ({className = '', collapsed = false, onLogout, settingsHref, user}: UserMenuProps) => {
    const displayName = user?.profile?.displayName || 'User'

    // Avatar is always set (never null), use avatar URL helper
    const avatar = user?.profile?.avatar || 'placeholder-1.png'
    const avatarUrl = getAvatarUrl(avatar, user?.id)

    const avatarContent = <img alt={displayName} class='avatar-img' src={avatarUrl} />

    return (
        <ContextMenu
            anchor={
                <div class={classnames('c-user-menu', {collapsed}, className)}>
                    {avatarContent}
                    {!collapsed && <span class='name'>{displayName}</span>}
                </div>
            }
            className={className}
            position='top'
        >
            {!collapsed && (
                <div class='menu-header'>
                    <div class='menu-avatar'>{avatarContent}</div>
                    <div class='menu-name'>{displayName}</div>
                </div>
            )}
            {settingsHref && (
                <MenuItem collapsed={collapsed} href={settingsHref} icon='settings' iconType='info' text='Settings' />
            )}
            <MenuItem
                collapsed={collapsed}
                icon={getThemeIcon()}
                iconType='info'
                onClick={cycleTheme}
                text={`Theme: ${store.state.theme}`}
            />
            {onLogout && <MenuItem collapsed={collapsed} icon='logout' iconType='info' onClick={onLogout} text='Logout' />}
        </ContextMenu>
    )
}
