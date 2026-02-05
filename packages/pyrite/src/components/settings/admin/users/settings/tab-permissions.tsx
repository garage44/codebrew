import {useEffect} from 'preact/hooks'
import {Icon} from '@garage44/common/components'
import {api, $t} from '@garage44/common/app'
import {$s} from '@/app'

export default function TabPermissions() {
    const categories = ['op', 'presenter', 'other']

    const loadGroups = async() => {
        $s.admin.groups = await api.get('/api/groups')
    }

    const toggleCategory = (category: string) => {
        const adminUser = $s.admin.user as {_permissions?: Record<string, string[]>} | null
        if (!adminUser) return

        if (!adminUser._permissions) adminUser._permissions = {}

        const allSelected = !$s.admin.groups.some((i) => {
            const groupName = typeof i.name === 'string' ? i.name : String(i.name || '')
            return !adminUser._permissions![category]?.includes(groupName)
        })
        if (allSelected) {
            adminUser._permissions[category] = []
        } else {
            adminUser._permissions[category] = $s.admin.groups.map((i) => {
                return typeof i.name === 'string' ? i.name : String(i.name || '')
            })
        }
    }

    const toggleGroup = (groupname: string) => {
        const adminUser = $s.admin.user as {_permissions?: Record<string, string[]>} | null
        if (!adminUser) return

        if (!adminUser._permissions) adminUser._permissions = {}

        const allSelected = categories.every((c) => adminUser._permissions?.[c]?.includes(groupname))
        if (allSelected) {
            for (const category of categories) {
                if (!adminUser._permissions[category]) adminUser._permissions[category] = []
                const groupIndex = adminUser._permissions[category].indexOf(groupname)
                if (groupIndex > -1) {
                    adminUser._permissions[category].splice(groupIndex, 1)
                }
            }
        } else {
            for (const category of categories) {
                if (!adminUser._permissions[category]) adminUser._permissions[category] = []
                if (!adminUser._permissions[category].includes(groupname)) {
                    adminUser._permissions[category].push(groupname)
                }
            }
        }
    }

    const isChecked = (category: string, groupname: string) => {
        const adminUser = $s.admin.user as {_permissions?: Record<string, string[]>} | null
        return adminUser?._permissions?.[category]?.includes(groupname) || false
    }

    const handleCheckboxChange = (category: string, groupname: string, checked: boolean) => {
        const adminUser = $s.admin.user as {_permissions?: Record<string, string[]>} | null
        if (!adminUser) return

        if (!adminUser._permissions) adminUser._permissions = {}
        if (!adminUser._permissions[category]) adminUser._permissions[category] = []

        if (checked) {
            if (!adminUser._permissions[category].includes(groupname)) {
                adminUser._permissions[category].push(groupname)
            }
        } else {
            const index = adminUser._permissions[category].indexOf(groupname)
            if (index > -1) {
                adminUser._permissions[category].splice(index, 1)
            }
        }
    }

    useEffect(() => {
        if ($s.admin.authenticated && $s.admin.permission) {
            loadGroups()
        }
    }, [])

    return (
        <section class='c-users-settings-permissions tab-content permissions active'>
            <div class='permission-group'>
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

            {$s.admin.groups.map((group) => {
                const groupName = typeof group.name === 'string' ? group.name : String(group.name || '')
                return <div class='permission-group item' key={groupName}>
                    <div
                        class='group-name'
                        onClick={() => toggleGroup(groupName)}
                        onKeyPress={(e) => e.key === 'Enter' && toggleGroup(groupName)}
                        role='button'
                        tabIndex={0}
                    >
                        {groupName}
                    </div>

                    <div class='categories'>
                        {categories.map((category) => <div class='category' key={category}>
                                <input
                                    checked={isChecked(category, groupName)}
                                    onChange={(e) => handleCheckboxChange(
                                        category,
                                        groupName,
                                        (e.target as HTMLInputElement).checked,
                                    )}
                                    type='checkbox'
                                />
                        </div>)}
                    </div>
                </div>
            })}
        </section>
    )
}
