import {$t, store, logger} from '@garage44/common/app'
import {Button} from '@garage44/common/components'
import {getCurrentUrl, route} from 'preact-router'

import {$s} from '@/app'
import * as media from '@/models/media'
import * as sfu from '@/models/sfu/sfu'

interface ControlsMainProps {
    onCollapseChange?: (collapsed: boolean) => void
    onFullscreen?: () => void
    path?: string
}

export function ControlsMain({onCollapseChange, onFullscreen, path: _path}: ControlsMainProps) {
    const currentChannelSlug = $s.chat.activeChannelSlug

    // Check if channel is connected
    const isChannelConnected = currentChannelSlug ? $s.sfu.channels[currentChannelSlug]?.connected || false : false

    return (
        <nav class='c-general-controls'>
            <div class='navigational-controls'>
                <Button
                    active={$s.env.url.includes('/devices')}
                    icon='cog_outline'
                    onClick={() => {
                        // Navigate to/from devices route
                        const currentPath = getCurrentUrl()
                        if (currentPath.includes('/devices')) {
                            // Navigate back to channel
                            route(`/channels/${currentChannelSlug}`)
                        } else {
                            // Navigate to devices route
                            route(`/channels/${currentChannelSlug}/devices`)
                        }
                    }}
                    tip={$t('group.settings.name')}
                    variant='toggle'
                />

                {isChannelConnected && currentChannelSlug && (
                    <Button
                        active={$s.devices.cam.enabled}
                        icon='webcam'
                        onClick={(event) => {
                            console.log('[ControlsMain] VIDEO BUTTON CLICKED', event)
                            logger.info('[ControlsMain] ===== VIDEO BUTTON CLICKED =====')

                            if (!currentChannelSlug) {
                                logger.warn('[ControlsMain] No active channel, cannot toggle camera')
                                return
                            }

                            // Initialize channel state if it doesn't exist
                            if (!$s.sfu.channels[currentChannelSlug]) {
                                $s.sfu.channels[currentChannelSlug] = {audio: false, connected: false, video: false}
                            }

                            // Toggle video state based on device state (source of truth)
                            const newVideoState = !$s.devices.cam.enabled
                            $s.devices.cam.enabled = newVideoState
                            $s.sfu.channels[currentChannelSlug].video = newVideoState

                            logger.info(`[ControlsMain] toggleCamera: channel=${currentChannelSlug}, video=${newVideoState}`)
                            console.log('[ControlsMain] About to call getUserMedia with devices:', $s.devices)

                            if (newVideoState) {
                                // Camera enabled - get new media
                                logger.info('[ControlsMain] requesting camera media - calling getUserMedia')
                                media
                                    .getUserMedia($s.devices)
                                    .then(() => {
                                        logger.info('[ControlsMain] camera media obtained successfully')
                                        console.log('[ControlsMain] getUserMedia SUCCESS')
                                    })
                                    .catch((error) => {
                                        logger.error(`[ControlsMain] failed to get camera media: ${error}`)
                                        console.error('[ControlsMain] getUserMedia ERROR:', error)
                                    })
                            } else {
                                // Camera disabled - remove existing camera stream
                                logger.info('[ControlsMain] removing camera stream')
                                sfu.delUpMediaKind('camera')
                            }

                            // Save state
                            store.save()
                        }}
                        tip={$s.devices.cam.enabled ? $t('group.action.cam_off') : $t('group.action.cam_on')}
                        variant='toggle'
                    />
                )}

                {/* Fullscreen toggle (only when not collapsed) */}
                {!$s.panels.context.collapsed && (
                    <Button
                        active={$s.panels.context.expanded}
                        icon='fullscreen'
                        onClick={() => {
                            if (onFullscreen) {
                                onFullscreen()
                            } else {
                                // Fallback: toggle expanded state if handler not provided
                                $s.panels.context.expanded = !$s.panels.context.expanded
                                store.save()
                            }
                        }}
                        tip={$s.panels.context.expanded ? 'Exit fullscreen' : 'Expand video view'}
                        variant='toggle'
                    />
                )}
            </div>

            {/* Collapse button at the bottom */}
            {onCollapseChange && (
                <Button
                    icon={$s.panels.context.collapsed ? 'chevron_left' : 'chevron_right'}
                    onClick={() => onCollapseChange(!$s.panels.context.collapsed)}
                    size='s'
                    tip={$s.panels.context.collapsed ? 'Expand panel' : 'Collapse panel'}
                    type='info'
                    variant='toggle'
                />
            )}
        </nav>
    )
}
