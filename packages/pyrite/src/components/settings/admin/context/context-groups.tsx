import {$t, api, notifier} from '@garage44/common/app'
import {Icon} from '@garage44/common/components'
import classnames from 'classnames'
import {Link, route} from 'preact-router'
import {useMemo, useEffect} from 'preact/hooks'

import {$s} from '@/app'
import {saveGroup} from '@/models/group'

interface ContextGroupsProps {
    groupId?: string
    path?: string
}

export default function ContextGroups({groupId, path}: ContextGroupsProps) {
    const deletionGroups = useMemo(() => {
        return $s.admin.groups.filter((i) => i._delete)
    }, [])

    const orderedGroups = useMemo(() => {
        const groups = $s.admin.groups.filter((g) => g.public).concat($s.admin.groups.filter((g) => !g.public))
        return groups.toSorted((a, b) => {
            if (a._name < b._name) return -1
            if (a._name > b._name) return 1
            return 0
        })
    }, [])

    const addGroup = async () => {
        const group = await api.get('/api/groups/template')
        $s.admin.groups.push(group)
        toggleSelection(group._name)
    }

    const deleteGroups = async () => {
        notifier.notify({
            level: 'info',
            message:
                deletionGroups.length === 1
                    ? $t('deleting one group')
                    : $t('deleting {count} groups', {count: deletionGroups.length}),
        })
        const deleteRequests = []
        for (const group of deletionGroups) {
            $s.admin.groups.splice(
                $s.admin.groups.findIndex((i) => i._name === group._name),
                1,
            )
            if (!group._unsaved) {
                deleteRequests.push(fetch(`/api/groups/${group._name}/delete`))
            }
        }

        await Promise.all(deleteRequests)

        if (orderedGroups.length) {
            const groupId = orderedGroups[0]._name
            route(`/settings/groups/${groupId}/misc`)
        }
    }

    const groupLink = (groupId: string) => {
        if ($s.admin.group && $s.admin.group._name == groupId) {
            return path || `/settings/groups/${groupId}/misc`
        }
        return `/settings/groups/${groupId}/misc`
    }

    const saveGroupAction = async () => {
        if (!$s.admin.group) return
        const groupId = $s.admin.group._name
        const group = await saveGroup(groupId, $s.admin.group)

        // Select the next unsaved group to speed up group creation.
        const adminGroup = $s.admin.group as {_name?: string; _unsaved?: boolean} | null
        if (adminGroup && adminGroup._unsaved) {
            const nextGroupIndex = orderedGroups.findIndex((g) => {
                const _groupName = typeof g._name === 'string' ? g._name : String(g._name || '')
                return typeof g._unsaved !== 'undefined' && g._unsaved
            })
            if (nextGroupIndex >= 0) {
                const nextGroup = orderedGroups[nextGroupIndex]
                const nextGroupName = typeof nextGroup._name === 'string' ? nextGroup._name : String(nextGroup._name || '')
                toggleSelection(nextGroupName)
            }
        } else {
            // Reload the group, which may have been renamed.
            const groupName = typeof group._name === 'string' ? group._name : String(group._name || '')
            route(`/admin/groups/${groupName}/misc`)
        }
    }

    const toggleMarkDelete = async () => {
        if (!$s.admin.group) return
        $s.admin.group._delete = !$s.admin.group._delete
        for (let group of $s.admin.groups) {
            if (group._name == $s.admin.group._name) {
                group._delete = $s.admin.group._delete
            }
        }

        const adminGroup = $s.admin.group as {_delete?: boolean} | null
        const similarStateGroups = orderedGroups.filter((i) => {
            const groupDelete = typeof i._delete !== 'undefined' ? Boolean(i._delete) : false
            const adminDelete = adminGroup && typeof adminGroup._delete !== 'undefined' ? Boolean(adminGroup._delete) : false
            return groupDelete !== adminDelete
        })
        if (similarStateGroups.length) {
            const nextGroup = similarStateGroups[0]
            const nextGroupName = typeof nextGroup._name === 'string' ? nextGroup._name : String(nextGroup._name || '')
            toggleSelection(nextGroupName)
        }
    }

    const toggleSelection = (groupId: string) => {
        route(`/admin/groups/${groupId}/misc`)
    }

    useEffect(() => {
        return () => {
            $s.admin.group = null
        }
    }, [])

    if (!($s.admin.authenticated && $s.admin.permission)) return null

    return (
        <section class='c-admin-groups-context presence'>
            <div class='actions'>
                <button class='btn' disabled={!$s.admin.group} onClick={toggleMarkDelete}>
                    <Icon className='item-icon icon-d' name='minus' />
                </button>
                <button class='btn'>
                    <Icon className='item-icon icon-d' name='plus' onClick={addGroup} />
                </button>
                <button class='btn' disabled={!deletionGroups.length} onClick={deleteGroups}>
                    <Icon className='icon-d' name='trash' />
                </button>
                <button class='btn' disabled={!$s.admin.group} onClick={saveGroupAction}>
                    <Icon className='icon-d' name='save' />
                </button>
            </div>

            {orderedGroups.map((group) => {
                const groupName = typeof group._name === 'string' ? group._name : String(group._name || '')
                const isPublic = typeof group.public === 'boolean' ? group.public : Boolean(group.public)
                const isLocked = typeof group.locked === 'boolean' ? group.locked : Boolean(group.locked)
                const isDelete = typeof group._delete === 'boolean' ? group._delete : Boolean(group._delete)
                const isUnsaved = typeof group._unsaved === 'boolean' ? group._unsaved : Boolean(group._unsaved)
                return (
                    <Link
                        {...({
                            class: classnames('group item', {active: groupId === groupName}),
                            href: groupLink(groupName),
                        } as Record<string, unknown>)}
                        key={groupName}
                    >
                        <Icon
                            className={classnames('item-icon icon-d', {
                                delete: isDelete,
                                unsaved: isUnsaved,
                            })}
                            name={isDelete ? 'Trash' : 'Group'}
                        />

                        <div class='flex-column'>
                            <div class='name'>{groupName}</div>
                            <div class='item-properties'>
                                <Icon className='icon-xs' name={isPublic ? 'Eye' : 'EyeClosed'} />
                                <Icon className='icon-xs' name={isLocked ? 'Lock' : 'Unlock'} />
                            </div>
                        </div>
                    </Link>
                )
            })}

            {!orderedGroups.length && (
                <div class='group item no-presence'>
                    <Icon className='item-icon icon-d' name='group' />
                    <div class='name'>{$t('group.no_groups')}</div>
                </div>
            )}
        </section>
    )
}
