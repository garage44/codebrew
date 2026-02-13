import {useEffect} from 'preact/hooks'

import {api} from '@/app'
import {Icon} from '@/components'

export interface UsersPermissionsTabProps {
    /**
     * User object from state
     */
    user?: {
        _permissions?: {
            [category: string]: string[]
        }
    }
    /**
     * Groups array
     */
    groups?: {name: string}[]
    /**
     * Function to load groups
     */
    loadGroups?: () => Promise<void>
    /**
     * Function to update user permissions
     */
    onPermissionsChange?: (permissions: {[category: string]: string[]}) => void
    /**
     * Translation function
     */
    $t?: (key: string) => string
    /**
     * Whether user is authenticated and has permission
     */
    authenticated?: boolean
    /**
     * Whether user has permission
     */
    hasPermission?: boolean
}

/**
 * User Permissions Settings Tab Component
 * Contains permission management for groups
 */
export function UsersPermissions({
    user,
    groups = [],
    loadGroups,
    onPermissionsChange,
    $t = (key: string) => key,
    authenticated = false,
    hasPermission = false,
}: UsersPermissionsTabProps) {
    const categories = ['op', 'presenter', 'other']

    const handleLoadGroups = async () => {
        if (loadGroups) {
            await loadGroups()
        }
    }

    const toggleCategory = (category: string) => {
        if (!user || !groups) {
            return
        }

        const allSelected = !groups.some((i) => !user._permissions?.[category]?.includes(i.name))
        const newPermissions = {...user._permissions}

        if (allSelected) {
            newPermissions[category] = []
        } else {
            newPermissions[category] = groups.map((i) => i.name)
        }

        onPermissionsChange?.(newPermissions)
    }

    const toggleGroup = (groupname: string) => {
        if (!user || !groups) {
            return
        }

        const allSelected = categories.every((c) => user._permissions?.[c]?.includes(groupname))
        const newPermissions = {...user._permissions}

        if (allSelected) {
            for (const category of categories) {
                if (!newPermissions[category]) {
                    newPermissions[category] = []
                }
                const groupIndex = newPermissions[category].indexOf(groupname)
                if (groupIndex !== -1) {
                    newPermissions[category].splice(groupIndex, 1)
                }
            }
        } else {
            for (const category of categories) {
                if (!newPermissions[category]) {
                    newPermissions[category] = []
                }
                if (!newPermissions[category].includes(groupname)) {
                    newPermissions[category].push(groupname)
                }
            }
        }

        onPermissionsChange?.(newPermissions)
    }

    const isChecked = (category: string, groupname: string) => user?._permissions?.[category]?.includes(groupname) || false

    const handleCheckboxChange = (category: string, groupname: string, checked: boolean) => {
        if (!user) {
            return
        }

        const newPermissions = {...user._permissions}
        if (!newPermissions[category]) {
            newPermissions[category] = []
        }

        if (checked) {
            if (!newPermissions[category].includes(groupname)) {
                newPermissions[category].push(groupname)
            }
        } else {
            const index = newPermissions[category].indexOf(groupname)
            if (index !== -1) {
                newPermissions[category].splice(index, 1)
            }
        }

        onPermissionsChange?.(newPermissions)
    }

    useEffect(() => {
        if (authenticated && hasPermission) {
            handleLoadGroups()
        }
    }, [authenticated, hasPermission])

    return (
        <section class='c-users-permissions-tab'>
            <div class='group'>
                <div class='group-name' />
                <div class='categories'>
                    <div
                        class='category'
                        onClick={() => toggleCategory('op')}
                        onKeyPress={(e) => e.key === 'Enter' && toggleCategory('op')}
                        role='button'
                        tabIndex={0}
                    >
                        <Icon className='icon-d' name='operator' tip={$t('group.settings.permission.operator')} />
                    </div>
                    <div
                        class='category'
                        onClick={() => toggleCategory('presenter')}
                        onKeyPress={(e) => e.key === 'Enter' && toggleCategory('presenter')}
                        role='button'
                        tabIndex={0}
                    >
                        <Icon className='icon-d' name='present' tip={$t('group.settings.permission.presenter')} />
                    </div>
                    <div
                        class='category'
                        onClick={() => toggleCategory('other')}
                        onKeyPress={(e) => e.key === 'Enter' && toggleCategory('other')}
                        role='button'
                        tabIndex={0}
                    >
                        <Icon className='icon-d' name='otherpermissions' tip={$t('group.settings.permission.misc')} />
                    </div>
                </div>
            </div>

            {groups.map((group) => (
                <div key={group.name} class='group item'>
                    <div
                        class='group-name'
                        onClick={() => toggleGroup(group.name)}
                        onKeyPress={(e) => e.key === 'Enter' && toggleGroup(group.name)}
                        role='button'
                        tabIndex={0}
                    >
                        {group.name}
                    </div>

                    <div class='categories'>
                        {categories.map((category) => (
                            <div key={category} class='category'>
                                <input
                                    type='checkbox'
                                    checked={isChecked(category, group.name)}
                                    onChange={(e) =>
                                        handleCheckboxChange(category, group.name, (e.target as HTMLInputElement).checked)
                                    }
                                />
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </section>
    )
}
