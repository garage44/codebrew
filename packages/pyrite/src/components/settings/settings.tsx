import {$t} from '@garage44/common/app'
import {UsersList, ChannelsList} from '@garage44/common/components'
import {Settings as CommonSettings} from '@garage44/common/components/ui/settings/settings'
import {Profile} from '@garage44/common/components/ui/settings/tabs/profile'
import {getCurrentUrl} from 'preact-router'
import {useMemo} from 'preact/hooks'

import {$s} from '@/app'

import TabDevices from './tabs/devices'
import TabMedia from './tabs/media'

interface SettingsProps {
    tabId?: string
}

export default function Settings({tabId}: SettingsProps) {
    // Detect if we're on a users or channels route and set active tab
    const activeTabId = useMemo(() => {
        if (tabId) return tabId
        const url = getCurrentUrl()
        // If URL is /settings/users/new or /settings/users/:userId, show users tab
        if (url.startsWith('/settings/users')) {
            return 'users'
        }
        // If URL is /settings/channels/new or /settings/channels/:channelId, show channels tab
        if (url.startsWith('/settings/channels')) {
            return 'channels'
        }
        return
    }, [tabId])
    const settingsRoute = useMemo(() => {
        if ($s.sfu.channel.connected) {
            return `/groups/${$s.sfu.channel.name}/settings`
        }
        return '/settings'
    }, [])

    /*
     * saveSettings is kept for potential future use
     * const saveSettings = async() => {
     *     logger.debug(`settings language to ${$s.language.id}`)
     *     store.save()
     *     notifier.notify({icon: 'Settings', level: 'info', message: $t('ui.settings.action.saved')})
     * }
     */

    const getRoute = (tabId: string) => {
        return `${settingsRoute}/${tabId}`
    }

    // Determine if user settings should be shown (admin only)
    const showUserSettings = $s.admin.authenticated && $s.admin.permission

    const tabs = [
        {
            component: <Profile />,
            icon: 'settings',
            id: 'profile',
            label: $t('ui.settings.profile.name') || 'Profile',
            tip: $t('ui.settings.profile.name') || 'Profile',
        },
        ...(showUserSettings
            ? [
                  {
                      component: <UsersList $t={$t} />,
                      icon: 'user',
                      id: 'users',
                      label: $t('ui.settings.users.name') || 'Users',
                      tip: $t('ui.settings.users.name') || 'Users',
                  },
              ]
            : []),
        {
            component: <ChannelsList $t={$t} />,
            icon: 'chat',
            id: 'channels',
            label: $t('ui.settings.channels.name') || 'Channels',
            tip: $t('ui.settings.channels.name') || 'Channels',
        },
        {
            component: <TabDevices />,
            icon: 'webcam',
            id: 'devices',
            label: $t('ui.settings.devices') || 'Devices',
            tip: $t('ui.settings.devices') || 'Devices',
        },
        {
            component: <TabMedia />,
            icon: 'media',
            id: 'media',
            label: $t('ui.settings.media.name') || 'Media',
            tip: $t('ui.settings.media.name') || 'Media',
        },
    ]

    return (
        <CommonSettings
            activeTabId={activeTabId}
            defaultTab='profile'
            getRoute={getRoute}
            icon='settings'
            showSave={false}
            tabs={tabs}
            title={$t('ui.settings.name')}
        />
    )
}
