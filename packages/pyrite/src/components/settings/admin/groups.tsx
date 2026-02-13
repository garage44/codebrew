import {$t, api, logger} from '@garage44/common/app'
import {Splash} from '@garage44/common/components'
import {ComponentChildren} from 'preact'
import {useEffect} from 'preact/hooks'

import {$s} from '@/app'

interface GroupsProps {
    children?: ComponentChildren
    groupId?: string
}

/**
 * This is a container component that handles keeping
 * track of the current group, so its child components
 * don't have to.
 */
export const Groups = ({children, groupId}: GroupsProps) => {
    const loadGroup = async (groupId: string) => {
        logger.debug(`load group ${groupId}`)
        let group = $s.admin.groups.find((i) => {
            const groupName = typeof i._name === 'string' ? i._name : String(i._name || '')
            return groupName === groupId
        })
        if (group && typeof group._unsaved !== 'undefined' && group._unsaved) {
            Object.assign($s.admin.group || {}, group)
            if (!$s.admin.group) {
                $s.admin.group = group as typeof $s.admin.group
            }
        } else {
            const apiGroup = (await api.get(`/api/groups/${encodeURIComponent(groupId)}`)) as Record<string, unknown>
            if (group) {
                // Don't update internal state properties.
                for (const key of Object.keys(group)) {
                    if (!key.startsWith('_')) (group as Record<string, unknown>)[key] = apiGroup[key]
                }
                Object.assign($s.admin.group || {}, group)
                if (!$s.admin.group) {
                    $s.admin.group = group as typeof $s.admin.group
                }
            } else {
                group = apiGroup
                Object.assign($s.admin.group || {}, group)
                if (!$s.admin.group) {
                    $s.admin.group = group as typeof $s.admin.group
                }
            }
        }
    }

    // Initial load
    useEffect(() => {
        if (groupId) {
            loadGroup(groupId)
        }
    }, [])

    // Watch groupId changes
    useEffect(() => {
        if (!groupId) {
            $s.admin.group = null
            return
        }
        loadGroup(groupId)
    }, [groupId])

    if ($s.admin.group) {
        return <>{children}</>
    }

    return <Splash instruction={$t('group.action.select')} />
}
