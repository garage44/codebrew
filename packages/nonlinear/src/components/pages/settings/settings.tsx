import {Settings as CommonSettings} from '@garage44/common/components/ui/settings/settings'
import {Profile} from '@garage44/common/components/ui/settings/tabs/profile'

import {$s} from '@/app'

import {Agents} from './tabs/agents'
import {Labels} from './tabs/labels'
import {Repositories} from './tabs/repositories'

interface SettingsProps {
    tabId?: string
}

const getRoute = (tabId: string) => {
    return `/settings?tab=${tabId}`
}

export function Settings({tabId}: SettingsProps) {
    const url = $s.env.url
    const activeTabId =
        tabId ||
        (() => {
            const match = url.match(/[?&]tab=([^&]+)/)
            return match ? match[1] : undefined
        })()

    const isAdmin = $s.profile?.admin

    const tabs = [
        {
            component: <Profile />,
            icon: 'settings',
            id: 'profile',
            label: 'Profile',
            tip: 'Profile',
        },
        ...(isAdmin
            ? [
                  {
                      component: <Repositories />,
                      icon: 'code',
                      id: 'repositories',
                      label: 'Repositories',
                      tip: 'Repositories',
                  },
                  {
                      component: <Agents />,
                      icon: 'smart_toy',
                      id: 'agents',
                      label: 'Agents',
                      tip: 'AI Agents',
                  },
                  {
                      component: <Labels />,
                      icon: 'label',
                      id: 'labels',
                      label: 'Labels',
                      tip: 'Label Definitions',
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
            showSave={false}
            tabs={tabs}
            title='Settings'
        />
    )
}
