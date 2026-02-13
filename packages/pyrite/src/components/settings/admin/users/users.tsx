import type {ComponentChildren} from 'preact'

import {logger, $t, api} from '@garage44/common/app'
import {Splash} from '@garage44/common/components'
import {useEffect} from 'preact/hooks'

import {$s} from '@/app'

interface UsersProps {
    children?: ComponentChildren
    userId?: string
}

/**
 * This is a container component that handles keeping
 * track of the current user, so its child components
 * don't have to.
 */
export const Users = ({children, userId}: UsersProps) => {
    const loadUser = async (userId: string) => {
        logger.debug(`load user ${userId}`)
        const user = $s.admin.users.find((i) => {
            const userIdNum = typeof i.id === 'number' ? i.id : Number.parseInt(String(i.id || '0'), 10)
            return userIdNum === Number.parseInt(userId, 10)
        })
        if (user && ((user._unsaved !== undefined && user._unsaved) || (user._delete !== undefined && user._delete))) {
            Object.assign($s.admin.user || {}, user)
            if (!$s.admin.user) {
                $s.admin.user = user as NonNullable<typeof $s.admin.user>
            }
        } else {
            const apiUser = (await api.get(`/api/users/${encodeURIComponent(userId)}`)) as Record<string, unknown>
            Object.assign($s.admin.user || {}, apiUser)
            if (!$s.admin.user) {
                $s.admin.user = apiUser as NonNullable<typeof $s.admin.user>
            }
        }
    }

    const loadUsers = async () => {
        $s.admin.users = await api.get('/api/users')
    }

    // Initial load
    useEffect(() => {
        loadUsers().then(() => {
            if (userId) {
                loadUser(userId)
            }
        })
    }, [])

    // Watch userId changes
    useEffect(() => {
        if (!userId) {
            $s.admin.user = null
            return
        }
        loadUser(userId)
    }, [userId])

    if ($s.admin.user) {
        return <>{children}</>
    }

    return <Splash instruction={$t('user.action.select')} />
}
