import {logger} from '@garage44/common/app'
import {useEffect} from 'preact/hooks'

import {$s} from '@/app'
import {selectChannel, loadChannelHistory} from '@/models/chat'
import {connect as connectSFU} from '@/models/sfu/sfu'

import ChannelChat from '../chat/channel-chat'

interface ChannelProps {
    channelSlug: string
}

export const Channel = ({channelSlug}: ChannelProps) => {
    /*
     * Set active channel synchronously during render for immediate route update
     * This happens before child components render, eliminating delay
     */
    if ($s.chat.activeChannelSlug !== channelSlug) {
        $s.chat.activeChannelSlug = channelSlug
        $s.chat.channel = channelSlug
    }

    // Load history and connect to SFU when channel becomes active
    useEffect(() => {
        // Use selectChannel to ensure channel is properly initialized
        selectChannel(channelSlug)
        // Load history immediately
        loadChannelHistory(channelSlug)

        /*
         * Connect to SFU for video conferencing
         * Channel slug directly matches Galene group name (1:1 mapping)
         * Original: only connect when !connected
         * Channel switch: when connected to different channel, connect() closes old and creates new
         */
        const shouldConnect = channelSlug && (!$s.sfu.channel.connected || $s.sfu.channel.name !== channelSlug)

        if (shouldConnect) {
            if ($s.sfu.channel.connected && $s.sfu.channel.name !== channelSlug) {
                logger.info(`[Channel] Switching from group ${$s.sfu.channel.name} to channel ${channelSlug}`)
            }
            logger.info(`[Channel] Preparing to connect to SFU for channel: ${channelSlug}`)
            logger.info(
                `[Channel] Credentials check: username=${$s.profile.username ? '***' : '(empty)'}, ` +
                    `password=${$s.profile.password ? '***' : '(empty)'}`,
            )
            connectSFU()
                .then(() => {
                    logger.info(`[Channel] connectSFU() completed successfully for channel ${channelSlug}`)
                })
                .catch((error) => {
                    logger.error(`[Channel] Failed to connect to SFU for channel ${channelSlug}:`, error)
                })
        }
    }, [channelSlug])

    // Find channel by slug for passing to ChannelChat
    const channel = $s.channels.find((c) => c.slug === channelSlug)

    return (
        <div class='c-channel'>
            <ChannelChat channel={channel} channelSlug={channelSlug} />
        </div>
    )
}
