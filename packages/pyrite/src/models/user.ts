import {$s} from '@/app'
import {notifier} from '@garage44/common/app'
import {$t, api, events} from '@garage44/common/app'

export function _events() {
    events.on('disconnected', () => {
        $s.users = []
    })
}

export async function saveUser(userId, data) {
    const user = await api.post(`/api/users/${userId}`, data)
    $s.admin.users[$s.admin.users.findIndex((i) => i.id === user.id)] = user
    notifier.notify({level: 'info', message: $t('user.action.saved', {username: user.username})})
    return user
}
