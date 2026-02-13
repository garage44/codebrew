import {Icon} from '@garage44/common/components'
import classnames from 'classnames'
import {Link} from 'preact-router'

import {$s} from '@/app'
import {saveUser} from '@/models/user'

import TabMisc from './tab-misc'
import TabPermissions from './tab-permissions'

interface SettingsProps {
    tabId?: string
    userId?: string
}

export default function Settings({tabId = 'misc', userId}: SettingsProps) {
    const routeSettings = (tab: string) => `/settings/users/${$s.admin.user.id}?tab=${tab}`

    const saveUserAction = async (): Promise<void> => {
        if (userId) {
            await saveUser(String(userId), $s.admin.user)
        }
    }

    if (!$s.admin.user) {
        return null
    }

    return (
        <div class='c-admin-user content'>
            <header>
                <div class='notice' />
                <div class='title'>
                    <span>
                        {typeof $s.admin.user === 'object' && $s.admin.user !== null && 'name' in $s.admin.user
                            ? String($s.admin.user.name)
                            : ''}
                    </span>
                    <Icon className='icon icon-regular' name='user' />
                </div>
            </header>

            <ul class='tabs'>
                <Link
                    {...({
                        class: classnames('btn btn-menu', {active: tabId === 'misc'}),
                        href: routeSettings('misc'),
                    } as Record<string, unknown>)}
                >
                    <Icon className='icon-d' name='pirate' />
                </Link>
                <Link
                    {...({
                        class: classnames('btn btn-menu tab', {
                            active: tabId === 'permissions',
                            disabled: $s.admin.groups.length === 0,
                        }),
                        href: $s.admin.groups.length > 0 ? routeSettings('permissions') : '#',
                    } as Record<string, unknown>)}
                >
                    <Icon className='icon-d' name='operator' />
                </Link>
            </ul>

            <div class='tabs-content'>
                {tabId === 'misc' && <TabMisc />}
                {tabId === 'permissions' && <TabPermissions />}

                <div class='actions'>
                    <button class='btn btn-menu' onClick={saveUserAction}>
                        <Icon className='icon-d' name='save' />
                    </button>
                </div>
            </div>
        </div>
    )
}
