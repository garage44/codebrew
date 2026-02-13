import {store, notifier} from '@garage44/common/app'
import {UsersManagement} from '@garage44/common/components'
import {Settings as CommonSettings} from '@garage44/common/components/ui/settings/settings'
import {Profile} from '@garage44/common/components/ui/settings/tabs/profile'
import {$t} from '@garage44/expressio'

import {$s, i18n} from '@/app'
import {Config} from '@/components/pages/config/config'

interface SettingsProps {
    tabId?: string
}

const getRoute = (tabId: string) => {
    return `/settings?tab=${tabId}`
}

export function Settings({tabId}: SettingsProps) {
    /*
     * Extract tab from query params if not provided as prop
     * Use $s.env.url which is reactive and updates when route changes
     * Accessing $s.env.url directly makes this reactive to URL changes
     */
    const url = $s.env.url
    const activeTabId =
        tabId ||
        (() => {
            const match = url.match(/[?&]tab=([^&]+)/)
            return match ? match[1] : undefined
        })()
    const saveSettings = async () => {
        store.save()
        notifier.notify({icon: 'Settings', message: $t(i18n.ui.settings.action.saved), type: 'info'})
    }

    // Determine if admin settings should be shown
    const isAdmin = $s.profile?.admin

    const tabs = [
        {
            component: <Profile />,
            icon: 'Settings',
            id: 'profile',
            label: $t(i18n.ui.settings.profile.name),
            tip: $t(i18n.ui.settings.profile.name),
        },

        /*
         * Admin-only tabs:
         * - Users: user management
         * - Admin: translation engine config, UI language, workspace management
         */
        ...(isAdmin
            ? [
                  {
                      component: <UsersManagement $t={$t} />,
                      icon: 'account',
                      id: 'users',
                      label: $t(i18n.ui.settings.users.name),
                      tip: $t(i18n.ui.settings.users.name),
                  },
                  {
                      component: <Config />,
                      icon: 'Workspace',
                      id: 'admin',
                      label: $t(i18n.ui.settings.workspaces.name),
                      tip: $t(i18n.ui.settings.workspaces.name),
                  },
              ]
            : []),
    ]

    return (
        <CommonSettings
            activeTabId={activeTabId}
            defaultTab='profile'
            getRoute={getRoute}
            icon='settings'
            onSave={saveSettings}
            tabs={tabs}
            title={$t(i18n.ui.settings.name)}
        />
    )
}
