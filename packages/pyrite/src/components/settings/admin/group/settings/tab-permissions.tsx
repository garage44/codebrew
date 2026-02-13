import {api} from '@garage44/common/app'
import {Icon} from '@garage44/common/components'
import {useEffect} from 'preact/hooks'

import {$s} from '@/app'

export default function TabPermissions() {
    const categories = ['op', 'presenter', 'other']

    const loadGroups = async () => {
        $s.admin.groups = await api.get('/api/groups')
    }

    const toggleCategory = (category: string) => {
        const adminGroup = $s.admin.group as {_permissions?: Record<string, string[]>} | null
        if (!adminGroup || !adminGroup._permissions) return

        const allSelected = !$s.admin.users.some((i) => {
            const userName = typeof i.name === 'string' ? i.name : String(i.name || '')
            return !adminGroup._permissions![category]?.includes(userName)
        })
        if (allSelected) {
            adminGroup._permissions[category] = []
        } else {
            adminGroup._permissions[category] = $s.admin.users.map((i) => {
                return typeof i.name === 'string' ? i.name : String(i.name || '')
            })
        }
    }

    const toggleUser = (username: string) => {
        const adminGroup = $s.admin.group as {_permissions?: Record<string, string[]>} | null
        if (!adminGroup || !adminGroup._permissions) return

        const allSelected = categories.every((c) => adminGroup._permissions![c]?.includes(username))
        if (allSelected) {
            for (const category of categories) {
                const userIndex = adminGroup._permissions![category].indexOf(username)
                if (userIndex > -1) {
                    adminGroup._permissions[category].splice(userIndex, 1)
                }
            }
        } else {
            for (const category of categories) {
                if (!adminGroup._permissions[category]) {
                    adminGroup._permissions[category] = []
                }
                if (!adminGroup._permissions[category].includes(username)) {
                    adminGroup._permissions[category].push(username)
                }
            }
        }
    }

    const isChecked = (category: string, username: string) => {
        const adminGroup = $s.admin.group as {_permissions?: Record<string, string[]>} | null
        return adminGroup?._permissions?.[category]?.includes(username) || false
    }

    const handleCheckboxChange = (category: string, username: string, checked: boolean) => {
        const adminGroup = $s.admin.group as {_permissions?: Record<string, string[]>} | null
        if (!adminGroup || !adminGroup._permissions) return

        if (!adminGroup._permissions[category]) {
            adminGroup._permissions[category] = []
        }

        if (checked) {
            if (!adminGroup._permissions[category].includes(username)) {
                adminGroup._permissions[category].push(username)
            }
        } else {
            const index = adminGroup._permissions[category].indexOf(username)
            if (index > -1) {
                adminGroup._permissions[category].splice(index, 1)
            }
        }
    }

    useEffect(() => {
        if ($s.admin.authenticated && $s.admin.permission) {
            loadGroups()
        }
    }, [])

    return (
        <section class='c-admin-group-tab-permissions tab-content permissions active'>
            <div class='permission-group'>
                <div class='group-name' />
                <div class='categories'>
                    <div class='category' onClick={() => toggleCategory('op')}>
                        <Icon className='icon-d' name='operator' />
                    </div>
                    <div class='category' onClick={() => toggleCategory('presenter')}>
                        <Icon className='icon-d' name='present' />
                    </div>
                    <div class='category' onClick={() => toggleCategory('other')}>
                        <Icon className='icon-d' name='otherpermissions' />
                    </div>
                </div>
            </div>

            {$s.admin.users.map((user) => {
                const userName = typeof user.name === 'string' ? user.name : String(user.name || '')
                return (
                    <div class='permission-group item' key={userName}>
                        <div class='group-name' onClick={() => toggleUser(userName)}>
                            {userName}
                        </div>

                        <div class='categories'>
                            {categories.map((category) => (
                                <div class='category' key={category}>
                                    <input
                                        checked={isChecked(category, userName)}
                                        onChange={(e) =>
                                            handleCheckboxChange(category, userName, (e.target as HTMLInputElement).checked)
                                        }
                                        type='checkbox'
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                )
            })}
        </section>
    )
}
