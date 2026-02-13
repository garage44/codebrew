import {$t, events, notifier} from '@garage44/common/app'
import {ContextInput, ContextSelect, FieldSelect, FieldText, Icon} from '@garage44/common/components'
import classnames from 'classnames'
import {useState} from 'preact/hooks'

import {$s} from '@/app'
import {connection} from '@/models/sfu/sfu'

interface UsersContextMenuProps {
    user: {
        data?: {availability?: string; raisehand?: boolean}
        id: string
        permissions?: {op?: boolean; present?: boolean}
        username: string
    }
}

export default function UsersContextMenu({user}: UsersContextMenuProps) {
    const [active, setActive] = useState(false)

    const statusOptions = [
        {id: 'available', name: $t('user.action.set_availability.available')},
        {id: 'away', name: $t('user.action.set_availability.away')},
        {id: 'busy', name: $t('user.action.set_availability.busy')},
    ]

    const warning = {icon: 'Megafone', title: $t('user.action.notify')}
    const kick = {icon: 'Kick', title: `${$t('user.action.kick', {username: user.username})}`}

    const activateUserChat = () => {
        events.emit('channel', {
            action: 'switch',
            channel: {
                id: user.id,
                messages: [],
                name: user.username,
                unread: 0,
            },
            channelId: user.id,
        })
        if ($s.panels) {
            $s.panels.context.collapsed = false
        }
        toggleMenu()
    }

    const kickUser = (text: string) => {
        notifier.notify({message: $t('user.action.kicked', {username: user.username}), type: 'info'})
        connection?.userAction('kick', user.id, text)
        toggleMenu()
    }

    const muteUser = () => {
        notifier.notify({message: $t('user.action.mute', {username: user.username}), type: 'info'})
        connection?.userMessage('mute', user.id, null)
        toggleMenu()
    }

    const sendFile = (file: File | null) => {
        if (file) {
            connection?.sendFile(user.id, file)
        } else {
            $s.files.upload = []
        }
    }

    const sendNotification = (message: string) => {
        notifier.notify({message: $t('user.action.notification', {message, username: user.username}), type: 'info'})
        connection?.userMessage('notification', user.id, message)
        toggleMenu()
    }

    const setAvailability = (availability: string) => {
        connection?.userAction('setdata', connection.id, {availability})
    }

    const toggleMenu = (e?: MouseEvent, forceState?: boolean | MouseEvent) => {
        // The click-outside
        if (forceState && typeof forceState === 'object' && !('button' in forceState)) {
            setActive(false)
            return
        }

        setActive((prev) => !prev)
    }

    const toggleOperator = () => {
        let action
        if (user.permissions?.op) action = 'unop'
        else action = 'op'

        notifier.notify({message: $t(`user.action.${action}`, {username: user.username}), type: 'info'})
        connection?.userAction(action, user.id)
        toggleMenu()
    }

    const togglePresenter = () => {
        let action
        if (user.permissions?.present) action = 'unpresent'
        else action = 'present'

        notifier.notify({message: $t(`user.action.${action}`, {username: user.username}), type: 'info'})
        connection?.userAction(action, user.id)
        toggleMenu()
    }

    return (
        <div class={classnames('c-users-context-menu context-menu', {active: active})}>
            <Icon className='icon icon-d' name='menu' onClick={toggleMenu} />
            {active && (
                <div class='context-actions'>
                    {user.id !== $s.profile.id && (
                        <button class='action' onClick={activateUserChat}>
                            <Icon className='icon icon-s' name='chat' />
                            {`${$t('user.action.chat', {username: user.username})}`}
                        </button>
                    )}

                    {user.id !== $s.profile.id && (
                        <button
                            class='action'
                            onClick={() => {
                                const input = document.createElement('input')
                                input.type = 'file'
                                input.accept = '*'
                                input.onchange = (e) => {
                                    const file = (e.target as HTMLInputElement).files?.[0]
                                    if (file) {
                                        sendFile(file)
                                    }
                                }
                                input.click()
                            }}
                        >
                            <Icon className='icon icon-s' name='upload' />
                            {$t('user.action.share_file.send')}
                        </button>
                    )}

                    {$s.permissions.op && user.id !== $s.profile.id && (
                        <ContextInput FieldTextComponent={FieldText} submit={sendNotification} value={warning} />
                    )}

                    {$s.permissions.op && user.id !== $s.profile.id && (
                        <button class='action' onClick={muteUser}>
                            <Icon className='icon icon-s' name='mic' />
                            {$t('user.action.mute_mic')}
                        </button>
                    )}

                    {$s.permissions.op && user.id !== $s.profile.id && (
                        <button class='action' onClick={toggleOperator}>
                            <Icon className='icon icon-s' name='operator' />
                            {user.permissions?.op ? $t('user.action.set_role.op_retract') : $t('user.action.set_role.op_assign')}
                        </button>
                    )}

                    {$s.permissions.op && user.id !== $s.profile.id && (
                        <button class='action' onClick={togglePresenter}>
                            <Icon className='icon icon-s' name='present' />
                            {user.permissions?.present
                                ? $t('user.action.set_role.present_retract')
                                : $t('user.action.set_role.present_assign')}
                        </button>
                    )}

                    {user.id === $s.profile.id && (
                        <ContextSelect
                            FieldSelectComponent={FieldSelect}
                            icon='User'
                            options={statusOptions}
                            submit={setAvailability}
                            title={$t(`user.action.set_availability.${$s.sfu.profile.availability.id}`)}
                            value={$s.sfu.profile.availability}
                        />
                    )}

                    {user.id !== $s.profile.id && $s.permissions.op && (
                        <ContextInput FieldTextComponent={FieldText} required={false} submit={kickUser} value={kick} />
                    )}
                </div>
            )}
        </div>
    )
}
