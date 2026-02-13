import {$t} from '@garage44/common/app'
import {Icon} from '@garage44/common/components'
import classnames from 'classnames'
import {useMemo} from 'preact/hooks'

import {$s} from '@/app'

import ContextMenu from '../context-menu/context-menu-users'

export default function UsersContext() {
    const sortedUsers = useMemo(() => {
        // Deduplicate users by ID first (normalize IDs to strings for consistent comparison)
        const seenIds = new Set<string>()
        const uniqueUsers = $s.users.filter((user) => {
            if (!user || !user.id) return false
            const normalizedId = String(user.id).trim()
            if (seenIds.has(normalizedId)) {
                // Duplicate, skip
                return false
            }
            seenIds.add(normalizedId)
            return true
        })

        // Sort deduplicated users
        const users = [...uniqueUsers]
        users.sort(function (a, b) {
            const aUsername = typeof a.username === 'string' ? a.username : ''
            const bUsername = typeof b.username === 'string' ? b.username : ''
            if (!aUsername || !bUsername) return 0
            const aLowerName = aUsername.toLowerCase()
            const bLowerName = bUsername.toLowerCase()
            if (aLowerName < bLowerName) return -1
            else if (aLowerName > bLowerName) return +1
            else if (aUsername < bUsername) return -1
            else if (aUsername > bUsername) return +1
            return 0
        })
        return users
    }, [])

    const className = (user: {
        data?: {availability?: {id: string}; mic?: boolean; raisehand?: boolean}
        id: string
        permissions?: {op?: boolean; present?: boolean}
        username?: string
    }) => {
        const classes: Record<string, boolean> = {}
        if (user.data?.raisehand) {
            classes.hand = true
        }
        if (user.data?.availability) {
            if (user.data.availability.id === 'away') {
                classes.away = true
            } else if (user.data.availability.id === 'busy') {
                classes.busy = true
            }
        }

        return classes
    }

    return (
        <section class='c-users-context presence'>
            {sortedUsers.map((user) => {
                const userObj = user as {
                    data?: {availability?: {id: string}; mic?: boolean; raisehand?: boolean}
                    id: string
                    permissions?: {op?: boolean; present?: boolean}
                    username?: string
                }
                return (
                    <div class='user item' key={userObj.id}>
                        <Icon
                            className={classnames('icon item-icon icon-d', className(userObj))}
                            name={userObj.data?.raisehand ? 'Hand' : 'User'}
                        />

                        <div class='name'>
                            {userObj.username ? (
                                <div class='username'>
                                    {userObj.username === 'RECORDING' ? $t('user.recorder') : userObj.username}
                                </div>
                            ) : (
                                <div class='username'>{$t('user.anonymous')}</div>
                            )}

                            <div class='status'>
                                {userObj.data?.mic ? (
                                    <Icon className='icon icon-s' name='mic' />
                                ) : (
                                    <Icon className='icon icon-s error' name='micmute' />
                                )}
                            </div>

                            <div class='permissions'>
                                {userObj.permissions?.present && (
                                    <span>
                                        <Icon className='icon icon-s' name='present' />
                                    </span>
                                )}
                                {userObj.permissions?.op && (
                                    <span>
                                        <Icon className='icon icon-s' name='operator' />
                                    </span>
                                )}
                            </div>
                        </div>
                        {userObj.username !== 'RECORDING' && (
                            <ContextMenu
                                user={{
                                    data:
                                        userObj.data &&
                                        typeof userObj.data === 'object' &&
                                        'availability' in userObj.data &&
                                        typeof userObj.data.availability === 'object' &&
                                        userObj.data.availability !== null &&
                                        'id' in userObj.data.availability
                                            ? {
                                                  availability: String(userObj.data.availability.id),
                                                  raisehand: Boolean(userObj.data.raisehand),
                                              }
                                            : {
                                                  availability:
                                                      typeof userObj.data?.availability === 'string'
                                                          ? userObj.data.availability
                                                          : undefined,
                                                  raisehand: Boolean(userObj.data?.raisehand),
                                              },
                                    id: userObj.id,
                                    permissions: userObj.permissions,
                                    username: userObj.username || '',
                                }}
                            />
                        )}
                    </div>
                )
            })}
        </section>
    )
}
