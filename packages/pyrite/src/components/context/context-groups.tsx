import {$t, api, logger} from '@garage44/common/app'
import {Icon} from '@garage44/common/components'
import classnames from 'classnames'
import {Link, route} from 'preact-router'
import {useEffect, useMemo, useRef} from 'preact/hooks'

import {$s} from '@/app'
import {currentGroup} from '@/models/group'

export default function GroupsContext() {
    const intervalRef = useRef<number | null>(null)

    const currentGroupData = useMemo(() => currentGroup(), [$s.sfu.channel.name, $s.chat.activeChannelSlug, $s.sfu.channels])

    const isListedGroup = useMemo(() => {
        const groupName = $s.sfu.channel.name
        return groupName ? !!$s.sfu.channels[groupName] : false
    }, [$s.sfu.channel.name, $s.sfu.channels])

    const groupLink = (groupId: string) => {
        if ($s.sfu.channel && $s.sfu.channel.name === groupId) {
            return '/'
        } else {
            return `/groups/${groupId}`
        }
    }

    const pollGroups = async () => {
        const groups = await api.get('/api/groups/public')

        // Store groups in sfu.channels (channel slug = group name)
        if (groups && Array.isArray(groups)) {
            for (const group of groups) {
                const channelSlug = group.name
                if (!$s.sfu.channels[channelSlug]) {
                    // Initialize channel entry if it doesn't exist
                    if (!$s.sfu.channels[channelSlug]) {
                        const channelEntry = {
                            audio: false,
                            connected: false,
                            video: false,
                        }
                        // Use Object.assign to update existing entry or create new one
                        const existing = $s.sfu.channels[channelSlug]
                        if (existing) {
                            Object.assign(existing, channelEntry)
                        } else {
                            // Create new entry - TypeScript will infer the correct type
                            ;($s.sfu.channels as Record<string, typeof channelEntry>)[channelSlug] = channelEntry
                        }
                    }
                }

                // Update group metadata in channel entry
                Object.assign($s.sfu.channels[channelSlug], {
                    clientCount: group.clientCount,
                    comment: group.comment,
                    description: group.description,
                    locked: group.locked,
                })

                // Update current group data if this is the active group
                if (group.name === $s.sfu.channel.name && currentGroupData) {
                    currentGroupData.locked = group.locked
                }
            }
        }
    }

    const setAutofocus = () => {
        $s.login.autofocus = true
    }

    const toggleUnlisted = () => {
        if (!$s.sfu.channel.name || isListedGroup) {
            $s.sfu.channel.name = $t('group.unlisted')
        } else if (!isListedGroup) {
            $s.sfu.channel.name = ''
        }
    }

    const updateRoute = () => {
        $s.login.autofocus = false

        if ($s.sfu.channel.name) {
            // Assume unlocked, when there are no public groups
            const channelData = $s.sfu.channels[$s.sfu.channel.name]
            $s.sfu.channel.locked = channelData?.locked || false

            // Update the group route when the user sets the channel name.
            route(`/groups/${$s.sfu.channel.name}`, true)
        } else {
            // By default show the splash page when emptying the channel input.
            route('/', true)
        }
    }

    // Watch channel name changes
    useEffect(() => {
        logger.debug(`updating group route: ${$s.sfu.channel.name}`)
        updateRoute()
    }, [$s.sfu.channel.name])

    // Setup polling
    useEffect(() => {
        intervalRef.current = setInterval(pollGroups, 3000) as unknown as number
        pollGroups()

        return () => {
            if (intervalRef.current !== null) {
                clearInterval(intervalRef.current)
            }
        }
    }, [])

    return (
        <section class={classnames('c-groups-context presence', {collapsed: $s.panels.context.collapsed})}>
            <div class='actions'>
                <div
                    class={classnames('group item unlisted-group', {
                        active: window.location.pathname !== '/' && !isListedGroup,
                    })}
                    onClick={toggleUnlisted}
                >
                    <Icon className='icon item-icon icon-d' name='incognito' />
                    <div class='flex-column'>
                        {isListedGroup || !$s.sfu.channel.name ? (
                            <div class='name'>...</div>
                        ) : (
                            <div class='name'>{$s.sfu.channel.name}</div>
                        )}
                    </div>
                </div>
            </div>
            {Object.entries($s.sfu.channels).map(([channelSlug, channelData]) => {
                // Extract channel data from DeepSignal - access properties directly
                const channel =
                    typeof channelData === 'object' && channelData !== null && 'audio' in channelData
                        ? (channelData as {
                              audio: boolean
                              clientCount?: number
                              comment?: string
                              connected?: boolean
                              description?: string
                              locked?: boolean
                              video: boolean
                          })
                        : {audio: false, video: false}

                /*
                 * Only show channels that have group metadata (from public groups API)
                 * A channel with group metadata has at least one of: description, comment, clientCount defined
                 */
                const hasGroupMetadata =
                    channel.description !== undefined || channel.comment !== undefined || channel.clientCount !== undefined

                if (!hasGroupMetadata) {
                    return null
                }

                return (
                    <Link
                        {...({
                            class: classnames('group item', {active: currentGroupData.name === channelSlug}),
                            href: groupLink(channelSlug),
                            onClick: setAutofocus,
                        } as Record<string, unknown>)}
                        key={channelSlug}
                    >
                        <Icon className='icon item-icon icon-d' name={channel.locked ? 'GroupLocked' : 'Group'} />

                        <div class='flex-column'>
                            <div class='name'>{channelSlug}</div>
                            {channel.description && <div class='item-properties'>{channel.description}</div>}
                        </div>

                        <div class={classnames('stats', {active: (channel.clientCount || 0) > 0})}>
                            {channel.clientCount || 0}
                            <Icon className='icon-d' name='user' />
                        </div>
                    </Link>
                )
            })}

            {Object.keys($s.sfu.channels).length === 0 && (
                <div class='group item no-presence'>
                    <Icon className='item-icon icon-d' name='group' />
                    <div class='name'>{$t('group.no_groups_public')}</div>
                </div>
            )}
        </section>
    )
}
