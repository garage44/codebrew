import {$t, logger, store} from '@garage44/common/app'
import {Button, FieldSlider, Icon} from '@garage44/common/components'
import {useEffect, useState, useMemo} from 'preact/hooks'

import {$s} from '@/app'
import {unreadMessages} from '@/models/chat'
import * as media from '@/models/media'
import * as sfu from '@/models/sfu/sfu'

export const GroupControls = () => {
    const [volume, setVolume] = useState({locked: null, value: 100})

    const fileMediaAccept = useMemo(() => {
        if ($s.env.isFirefox) {
            return '.mp4'
        }
        // Chromium supports at least these 3 formats:
        return '.mp4,.mkv,.webm'
    }, [])

    const filePlayTooltip = useMemo(() => {
        if ($s.files.playing.length) {
            return $t('file.streaming')
        }
        let formats = []
        if ($s.env.isFirefox) {
            formats.push('.mp4')
        } else {
            formats.push('.mp4', 'webm', 'mkv')
        }
        return $t('file.stream', {formats: formats.join(',')})
    }, [])

    const unreadCount = useMemo(() => unreadMessages(), [])

    const toggleCam = (event?: MouseEvent) => {
        console.log('[GroupControls] toggleCam CLICKED', event)
        logger.info('[GroupControls] ===== VIDEO BUTTON CLICKED =====')

        const newState = !$s.devices.cam.enabled
        $s.devices.cam.enabled = newState
        logger.info(`[GroupControls] toggleCam: ${newState ? 'enabling' : 'disabling'} camera`)
        logger.info(`[GroupControls] cam.enabled=${newState}, mic.enabled=${$s.devices.mic.enabled}, mediaReady=${$s.mediaReady}`)

        // Sync channel state if channel is connected
        const currentChannelSlug = $s.chat.activeChannelSlug
        logger.info(`[GroupControls] currentChannelSlug=${currentChannelSlug}, connected=${$s.sfu.channel.connected}`)

        if (currentChannelSlug && $s.sfu.channels[currentChannelSlug]) {
            $s.sfu.channels[currentChannelSlug].video = newState
        }

        if (!newState) {
            // Camera disabled - remove existing camera stream
            logger.info('[GroupControls] removing camera stream')
            sfu.delUpMediaKind('camera')
        } else {
            // Camera enabled - get new media
            logger.info('[GroupControls] requesting camera media - calling getUserMedia')
            console.log('[GroupControls] About to call getUserMedia with devices:', $s.devices)
            media
                .getUserMedia($s.devices)
                .then(() => {
                    logger.info('[GroupControls] camera media obtained successfully')
                    console.log('[GroupControls] getUserMedia SUCCESS')
                })
                .catch((error) => {
                    logger.error(`[GroupControls] failed to get camera media: ${error}`)
                    console.error('[GroupControls] getUserMedia ERROR:', error)
                })
        }
    }

    const toggleChat = async () => {
        /*
         * Don't do a collapse animation while emoji is active; this is
         * too heavy due to the 1800+ items grid layout.
         */
        $s.chat.emoji.active = false
        // Wait a tick for state to update
        await new Promise((resolve) => setTimeout(resolve, 0))
        $s.panels.chat.collapsed = !$s.panels.chat.collapsed
        store.save()
    }

    const toggleMicrophone = () => {
        const currentMicState = $s.devices.mic.enabled
        const shouldRestartStream = !$s.devices.cam.enabled

        logger.debug(`[GroupControls] toggleMicrophone: current=${currentMicState}, shouldRestart=${shouldRestartStream}`)

        // Mute/unmute the microphone in existing stream
        sfu.muteMicrophone(currentMicState)

        if (shouldRestartStream) {
            /*
             * When both the camera is off, toggling the microphone should also restart the stream.
             * Otherwise, we would either continue to stream empty data (when both camera and mic are
             * off), or we would not send our audio stream altogether.
             */
            logger.debug('[GroupControls] camera is off, restarting stream for mic toggle')
            media.getUserMedia($s.devices)
        } else {
            logger.debug('[GroupControls] camera is on, mic toggle handled by muteMicrophone')
        }
    }

    const togglePlayFile = (file: File | null) => {
        if (file) {
            sfu.addFileMedia(file)
        } else {
            $s.files.playing = []
            sfu.delUpMediaKind('video')
        }
    }

    const toggleRaiseHand = () => {
        sfu.connection?.userAction('setdata', sfu.connection.id, {raisehand: !$s.sfu.profile.raisehand})
        if (!$s.sfu.profile.raisehand) {
            sfu.connection?.userMessage('raisehand')
        }
    }

    const toggleScreenshare = async () => {
        if ($s.upMedia.screenshare.length) {
            logger.debug('turn screenshare stream off')
            sfu.delUpMedia(media.screenStream)
        } else {
            logger.debug('turn screenshare stream on')
            const stream = await sfu.addShareMedia()
            media.setScreenStream(stream)
        }
    }

    // Watch mic enabled
    useEffect(() => {
        if (sfu.connection) {
            sfu.connection.userAction('setdata', sfu.connection.id, {mic: $s.devices.mic.enabled})
        }
    }, [])

    /*
     * Note: Removed automatic getUserMedia call on permissions.present
     * Media should only start when user explicitly clicks camera/mic buttons
     * The default enabled=true in state doesn't mean user wants media - it's just default state
     */

    // Watch volume changes
    useEffect(() => {
        for (const description of $s.streams) {
            // Only downstreams have volume control:
            const stream = description as {direction?: string; volume?: {locked?: boolean | null; value?: number}}
            if (stream.direction === 'down' && stream.volume && !stream.volume.locked) {
                stream.volume = volume
            }
        }
    }, [volume])

    return (
        <div class='c-group-controls'>
            <Button
                active={!$s.panels.chat.collapsed}
                icon='Chat'
                icon-props={{unread: unreadCount}}
                onClick={toggleChat}
                tip={$s.panels.chat.collapsed ? $t('ui.panel_chat.expand') : $t('ui.panel_chat.collapse')}
                variant='toggle'
            />

            {$s.permissions.present && (
                <>
                    <Button
                        active={$s.devices.mic.enabled ? $s.devices.mic.enabled : null}
                        icon={$s.devices.mic.enabled ? 'Mic' : 'MicMute'}
                        onClick={toggleMicrophone}
                        tip={$s.devices.mic.enabled ? $t('group.action.mic_off') : $t('group.action.mic_on')}
                        variant='toggle'
                    />

                    <Button
                        active={$s.devices.cam.enabled}
                        icon='Webcam'
                        onClick={(event) => {
                            console.log('[GroupControls] Button onClick wrapper called', event)
                            console.log('[GroupControls] toggleCam function:', toggleCam)
                            toggleCam(event)
                        }}
                        tip={$s.devices.cam.enabled ? $t('group.action.cam_off') : $t('group.action.cam_on')}
                        variant='toggle'
                    />

                    <Button
                        active={!!$s.upMedia.screenshare.length}
                        icon='ScreenShare'
                        onClick={toggleScreenshare}
                        tip={
                            $s.upMedia.screenshare.length ? $t('group.action.screenshare_off') : $t('group.action.screenshare_on')
                        }
                        variant='toggle'
                    />

                    <Button
                        active={!!$s.upMedia.video.length}
                        onClick={() => {
                            const input = document.createElement('input')
                            input.type = 'file'
                            input.accept = fileMediaAccept
                            input.onchange = (e) => {
                                const file = (e.target as HTMLInputElement).files?.[0]
                                togglePlayFile(file || null)
                            }
                            input.click()
                        }}
                        tip={filePlayTooltip}
                        variant='toggle'
                    >
                        <Icon name='upload' />
                    </Button>
                </>
            )}

            {$s.sfu.channel.connected && (
                <Button
                    active={$s.sfu.profile.raisehand}
                    icon='Hand'
                    onClick={toggleRaiseHand}
                    tip={$s.sfu.profile.raisehand ? $t('group.action.raisehand_active') : $t('group.action.raisehand')}
                    variant='toggle'
                />
            )}

            <Button class='no-feedback' tip={`${volume.value}% ${$t('group.audio_volume')}`} variant='unset'>
                <FieldSlider
                    IconComponent={Icon}
                    onChange={(v) => setVolume({locked: v.locked ?? null, value: v.value})}
                    value={volume}
                />
            </Button>
        </div>
    )
}
