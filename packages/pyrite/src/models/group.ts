import {$s} from '@/app'

import {$t, api, notifier} from '@garage44/common/app'

export function currentGroup(): typeof $s.sfu.channel & {clientCount?: number} {
    /*
     * Use channel slug to find group data from sfu.channels
     * Channel slug maps 1:1 to Galene group name
     */
    const channelSlug = $s.chat.activeChannelSlug || $s.sfu.channel.name
    const channelData = channelSlug ? $s.sfu.channels[channelSlug] : null

    // If channel data exists, merge with channel state
    if (channelData && 'clientCount' in channelData) {
        return {
            ...$s.sfu.channel,
            clientCount: (channelData as {clientCount?: number}).clientCount,
            comment: (channelData as {comment?: string}).comment ?? $s.sfu.channel.comment,
            locked: (channelData as {locked?: boolean}).locked ?? $s.sfu.channel.locked,
        }
    }

    // Assume hidden group; use selected channel fields as placeholders.
    return $s.sfu.channel
}

interface GroupApiResponse {
    _name: string
    _newName: string
}

export async function saveGroup(groupId: string, data: Record<string, unknown>): Promise<typeof $s.admin.groups[number]> {
    const group = (await api.post(`/api/groups/${encodeURIComponent(groupId)}`, data)) as GroupApiResponse &
        typeof $s.admin.groups[number]

    if (group._name === group._newName) {
        notifier.notify({level: 'info', message: $t('group.action.saved', {group: group._name})})
        $s.admin.groups[$s.admin.groups.findIndex((grp): boolean => grp._name === group._name)] = group
    } else {
        notifier.notify({
            level: 'info',
            message: $t('group.action.renamed', {
                newname: group._newName,
                oldname: group._name,
            }),
        })

        const groupIndex = $s.admin.groups.findIndex((grp): boolean => grp._name === group._name)
        group._name = group._newName
        $s.admin.groups[groupIndex] = group
    }

    return group
}
