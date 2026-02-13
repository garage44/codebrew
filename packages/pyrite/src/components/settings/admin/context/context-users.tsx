import {api, notifier} from '@garage44/common/app'
import {Icon} from '@garage44/common/components'
import classnames from 'classnames'
import {Link, route} from 'preact-router'
import {useMemo, useEffect} from 'preact/hooks'

import {$s} from '@/app'
import {saveUser} from '@/models/user'

interface ContextUsersProps {
    path?: string
    userId?: string
}

export default function ContextUsers({path: _path, userId}: ContextUsersProps) {
    const deletionUsers = useMemo(() => {
        return $s.admin.users.filter((i) => i._delete)
    }, [])

    const orderedUsers = useMemo(() => {
        const users = $s.admin.users.filter((g) => g.admin).concat($s.admin.users.filter((g) => !g.admin))
        return users.toSorted((a, b) => {
            if (a.name < b.name) return -1
            if (a.name > b.name) return 1
            return 0
        })
    }, [])

    const addUser = async () => {
        const user = await api.get('/api/users/template')
        $s.admin.users.push(user)
        toggleSelection(user.id)
    }

    const deleteUsers = async () => {
        notifier.notify({level: 'info', message: `deleting ${deletionUsers.length} users`})
        const deleteRequests = []
        for (const user of deletionUsers) {
            $s.admin.users.splice(
                $s.admin.users.findIndex((i) => i.id === user.id),
                1,
            )
            if (!user._unsaved) {
                deleteRequests.push(fetch(`/api/users/${user.id}/delete`))
            }
        }

        await Promise.all(deleteRequests)

        if (orderedUsers.length) {
            const userId = orderedUsers[0].id
            route(`/settings/users/${userId}/misc`)
        }
    }

    const loadUsers = async () => {
        $s.admin.users = await api.get('/api/users')
    }

    const saveUserAction = async () => {
        if (!$s.admin.user) return
        await saveUser($s.admin.user.id, $s.admin.user)
        // Select the next unsaved user, when this user was unsaved to allow rapid user creation.
        if ($s.admin.user._unsaved) {
            const nextUnsavedUserIndex = orderedUsers.findIndex((i) => i._unsaved)
            if (nextUnsavedUserIndex >= 0) {
                const nextUser = orderedUsers[nextUnsavedUserIndex]
                const nextUserId = typeof nextUser.id === 'number' ? nextUser.id : parseInt(String(nextUser.id || '0'), 10)
                toggleSelection(nextUserId)
            }
        }
    }

    const toggleMarkDelete = async () => {
        if (!$s.admin.user) return
        $s.admin.user._delete = !$s.admin.user._delete
        for (let user of $s.admin.users) {
            if (user.name == $s.admin.user.name) {
                user._delete = $s.admin.user._delete
            }
        }

        const similarStateUsers = orderedUsers.filter((i) => i._delete !== $s.admin.user?._delete)
        if (similarStateUsers.length) {
            const nextUser = similarStateUsers[0]
            const nextUserId = typeof nextUser.id === 'number' ? nextUser.id : parseInt(String(nextUser.id || '0'), 10)
            toggleSelection(nextUserId)
        }
    }

    const toggleSelection = (userId: number) => {
        route(`/admin/users/${userId}/misc`)
    }

    const userLink = (userId: number) => {
        if ($s.admin.user && $s.admin.user.id == userId) {
            return '/settings/users'
        }
        return `/settings/users/${userId}/misc`
    }

    useEffect(() => {
        if ($s.admin.authenticated && $s.admin.permission) {
            loadUsers()
        }
    }, [])

    // Watch for admin authentication changes
    useEffect(() => {
        if ($s.admin.authenticated && $s.admin.permission) {
            loadUsers()
        }
    }, [])

    return (
        <section
            class={classnames('c-admin-users-context presence', {
                collapsed: $s.panels.context.collapsed,
            })}
        >
            <div class='actions'>
                <button class='btn' disabled={!$s.admin.user} onClick={toggleMarkDelete}>
                    <Icon className='item-icon icon-d' name='minus' />
                </button>
                <button class='btn'>
                    <Icon className='item-icon icon-d' name='plus' onClick={addUser} />
                </button>
                <button class='btn' disabled={!deletionUsers.length} onClick={deleteUsers}>
                    <Icon className='icon-d' name='trash' />
                </button>
                <button class='btn' disabled={!$s.admin.user} onClick={saveUserAction}>
                    <Icon className='icon-d' name='save' />
                </button>
            </div>
            {orderedUsers.map((user) => {
                const userIdNum = typeof user.id === 'number' ? user.id : parseInt(String(user.id || '0'), 10)
                return (
                    <Link
                        {...({
                            class: classnames('user item', {
                                active: parseInt(userId || '0', 10) === userIdNum,
                            }),
                            href: userLink(userIdNum),
                        } as Record<string, unknown>)}
                        key={userIdNum}
                    >
                        <Icon
                            className={classnames('item-icon icon-d', {delete: user._delete, unsaved: user._unsaved})}
                            name={user._delete ? 'Trash' : 'User'}
                        />

                        <div class='name'>{typeof user.name === 'string' ? user.name : String(user.name || '')}</div>
                    </Link>
                )
            })}
        </section>
    )
}
