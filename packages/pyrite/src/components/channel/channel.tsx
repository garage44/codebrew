import {useEffect} from 'preact/hooks'
import {$s} from '@/app'
import ChannelChat from '../chat/channel-chat'
import {selectChannel, loadChannelHistory} from '@/models/chat'
import {connect as connectSFU} from '@/models/sfu/sfu'
import {logger} from '@garage44/common/app'

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
         * Connect to SFU for video conferencing if not already connected
         * Channel slug directly matches Galene group name (1:1 mapping)
         * Wait for credentials to be available before connecting
         */
        if (!$s.sfu.channel.connected && channelSlug) {
            logger.info(`[Channel] Preparing to connect to SFU for channel: ${channelSlug}`)
            logger.info(
                `[Channel] Credentials check: username=${$s.profile.username ? '***' : '(empty)'}, ` +
                `password=${$s.profile.password ? '***' : '(empty)'}`,
            )
            console.log(`[Channel] SFU connection state: connected=${$s.sfu.channel.connected}, channelSlug=${channelSlug}`)
            console.log(`[Channel] About to call connectSFU()`)

            /*
             * connectSFU will read credentials from $s.profile
             * It will use empty strings if not available, which may cause authentication to fail
             * but that's expected if user hasn't logged in properly
             */
            connectSFU()
                .then(() => {
                    console.log(`[Channel] connectSFU() completed successfully for channel ${channelSlug}`)
                })
                .catch((error) => {
                    console.error(`[Channel] connectSFU() failed for channel ${channelSlug}:`, error)
                    logger.error(`[Channel] Failed to connect to SFU for channel ${channelSlug}:`, error)
                })
        } else {
            console.log(`[Channel] Skipping SFU connection: connected=${$s.sfu.channel.connected}, channelSlug=${channelSlug}`)
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
