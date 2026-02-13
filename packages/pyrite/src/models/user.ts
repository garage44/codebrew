import {$s} from '@/app'

import {$t, api, events, notifier} from '@garage44/common/app'

export function _events(): void {
    events.on('disconnected', (): void => {
        $s.users = []
    })
}

export async function saveUser(userId: string, data: Record<string, unknown>): Promise<typeof $s.admin.users[number]> {
    const user = await api.post(`/api/users/${userId}`, data)
    $s.admin.users[$s.admin.users.findIndex((i) => i.id === user.id)] = user
    notifier.notify({level: 'info', message: $t('user.action.saved', {username: user.username})})
    return user
}
