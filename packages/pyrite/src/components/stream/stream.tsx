import classnames from 'classnames'
import {useEffect, useRef, useState, useMemo} from 'preact/hooks'
import {Button, FieldSlider, SoundMeter, Icon, IconLogo} from '@garage44/common/components'
import {Reports} from './reports'
import {$s} from '@/app'
import {$t, logger} from '@garage44/common/app'
import * as sfu from '@/models/sfu/sfu'

interface StreamProps {
    controls?: boolean
    modelValue: {
        aspectRatio?: number
        direction?: 'down' | 'up'
        enlarged?: boolean
        hasAudio?: boolean
        hasVideo?: boolean
        id: string
        kind?: string
        mirror?: boolean
        playing?: boolean
        settings?: {audio?: Record<string, unknown>; video?: Record<string, unknown>}
        src?: File | string | MediaStream
        username?: string
        volume?: {locked?: boolean; value?: number}
    }
    onUpdate?: (value: unknown) => void
}

export const Stream = ({controls = true, modelValue, onUpdate}: StreamProps) => {
    const rootRef = useRef<HTMLDivElement>(null)
    const mediaRef = useRef<HTMLVideoElement>(null)
    const [bar, setBar] = useState({active: false})
    const [mediaFailed, setMediaFailed] = useState(false)
    const [muted, setMuted] = useState(false)
    const [pip, setPip] = useState({active: false, enabled: false})
    const [stats, setStats] = useState({visible: false})
    const [stream, setStream] = useState<MediaStream | null>(null)
    const glnStreamRef = useRef<{[key: string]: unknown; stream?: MediaStream} | null>(null)

    // Computed values
    const audioEnabled = useMemo(() => {
        return !!(modelValue.hasAudio && stream && stream.getAudioTracks().length)
    }, [modelValue.hasAudio, stream])


    const hasSettings = useMemo(() => {
        if (!modelValue?.settings) return false
        return (
            Object.keys(modelValue.settings.audio || {}).length ||
            Object.keys(modelValue.settings.video || {}).length
        )
    }, [modelValue?.settings])

    // Methods
    const loadSettings = async() => {
        if (!stream) return
        logger.debug('loading stream settings')
        const settings = {audio: {}, video: {}}

        const audioTracks = stream.getAudioTracks()
        if (audioTracks.length) {
            settings.audio = audioTracks[0].getSettings()
        }

        const videoTracks = stream.getVideoTracks()
        if (videoTracks.length) {
            settings.video = videoTracks[0].getSettings()
        }

        if (onUpdate) {
            onUpdate({...modelValue, settings})
        }
    }

    const mountDownstream = async() => {
        const glnStream = sfu.connection?.down[modelValue.id]

        if (!glnStream) {
            logger.debug(`[Stream] no sfu stream on mounting downstream stream ${modelValue.id}`)
            return
        }

        logger.debug(`[Stream] mounting downstream stream ${modelValue.id}`)
        glnStreamRef.current = glnStream

        // If stream already exists, mount it immediately
        if (glnStream.stream && mediaRef.current) {
            logger.debug(`[Stream] downstream stream ${modelValue.id} already has MediaStream, mounting immediately`)
            setStream(glnStream.stream)
            mediaRef.current.srcObject = glnStream.stream
            await playStream()
        } else {
            logger.debug(`[Stream] downstream stream ${modelValue.id} waiting for MediaStream`)
            // Stream will be set via onstatus handler when it becomes available
        }

        // Set up handlers for when tracks arrive
        glnStream.ondowntrack = (track: MediaStreamTrack) => {
            logger.debug(`[Stream] downstream ondowntrack/${glnStream.id}, track kind: ${track.kind}`)

            // Ensure we have the stream set
            if (glnStream.stream && !stream) {
                setStream(glnStream.stream)
                if (mediaRef.current && !mediaRef.current.srcObject) {
                    mediaRef.current.srcObject = glnStream.stream
                }
            }

            // Update stream state based on track kind
            if (track.kind === 'audio') {
                logger.debug(`[Stream] downstream stream ${modelValue.id} - enabling audio controls`)
                if (onUpdate) onUpdate({...modelValue, hasAudio: true})
            } else if (track.kind === 'video') {
                logger.debug(`[Stream] downstream stream ${modelValue.id} - enabling video`)
                if (onUpdate) onUpdate({...modelValue, hasVideo: true})
            }
        }

        glnStream.onclose = () => {
            logger.debug(`[Stream] downstream stream ${glnStream.id} closed`)
            sfu.delMedia(glnStream.id)
        }

        glnStream.onstatus = async(status: string) => {
            logger.debug(`[Stream] downstream stream ${modelValue.id} status: ${status}`)

            if (['connected', 'completed'].includes(status) && mediaRef.current) {
                // Use glnStream.stream directly (it's already set by protocol layer)
                const streamToMount = glnStream.stream || stream

                if (!streamToMount) {
                    logger.warn(`[Stream] downstream stream ${modelValue.id} - no MediaStream available at status ${status}`)
                    return
                }

                logger.debug(`[Stream] downstream stream ${modelValue.id} - mounting MediaStream`)
                setStream(streamToMount)
                mediaRef.current.srcObject = streamToMount

                // Firefox doesn't have a working setSinkId
                if (audioEnabled && 'setSinkId' in (mediaRef.current as HTMLVideoElement) && $s.devices.audio.selected.id) {
                    try {
                        logger.debug(`[Stream] setting stream sink: ${$s.devices.audio.selected.id}`)
                        const videoElement = mediaRef.current as HTMLVideoElement & {
                            setSinkId: (id: string) => Promise<void>
                        }
                        await videoElement.setSinkId($s.devices.audio.selected.id)
                    } catch(error) {
                        logger.warn(`[Stream] failed to set stream sink: ${error}`)
                    }
                }

                await playStream()
            }
        }
    }

    const mountUpstream = async() => {
        // Mute local streams, so people don't hear themselves talk.
        if (!muted) {
            toggleMuteVolume()
        }
        logger.debug(`[Stream] mounting upstream stream ${modelValue.id}`)

        if (!modelValue.src) {
            // Local media stream from a device.
            const glnStream = sfu.connection?.up[modelValue.id]

            if (!glnStream) {
                logger.warn(`[Stream] upstream stream ${modelValue.id} not found in connection.up`)
                return
            }

            if (!glnStream.stream) {
                logger.warn(`[Stream] upstream stream ${modelValue.id} has no MediaStream assigned`)
                return
            }

            logger.debug(`[Stream] upstream stream ${modelValue.id} - mounting MediaStream`)
            glnStreamRef.current = glnStream
            setStream(glnStream.stream)

            if (mediaRef.current) {
                mediaRef.current.srcObject = glnStream.stream
                await playStream()
            } else {
                logger.warn(`[Stream] upstream stream ${modelValue.id} - mediaRef.current is null`)
            }
        } else {
            // Local media stream playing from a file...
            if (modelValue.src instanceof File) {
                const url = URL.createObjectURL(modelValue.src)
                if (mediaRef.current) {
                    mediaRef.current.src = url
                }

                let capturedStream: MediaStream | null = null
                if ('captureStream' in (mediaRef.current as HTMLVideoElement)) {
                    capturedStream = (mediaRef.current as HTMLVideoElement & {captureStream: () => MediaStream}).captureStream()
                } else if ('mozCaptureStream' in (mediaRef.current as HTMLVideoElement)) {
                    const videoElement = mediaRef.current as HTMLVideoElement & {
                        mozCaptureStream: () => MediaStream
                    }
                    capturedStream = videoElement.mozCaptureStream()
                }

                if (capturedStream) {
                    setStream(capturedStream)
                }

                const glnStream = sfu.connection?.up[modelValue.id]
                glnStreamRef.current = glnStream
                if (glnStream) {
                    glnStream.userdata.play = true

                    if (capturedStream) {
                        capturedStream.onaddtrack = (e: MediaStreamTrackEvent) => {
                            const track = e.track

                            if (track.kind === 'audio') {
                                if (onUpdate) onUpdate({...modelValue, hasAudio: true})
                            } else if (track.kind === 'video') {
                                if (onUpdate) onUpdate({...modelValue, hasVideo: true})
                            }

                            glnStream.pc.addTrack(track, capturedStream)
                        }

                        capturedStream.onremovetrack = () => {
                            if (mediaRef.current?.src) {
                                sfu.delUpMedia(glnStream)
                                $s.files.playing = []
                            }
                        }
                    }

                    glnStream.onstatus = async(status: string) => {
                        if (status === 'connected') {
                            await loadSettings()
                        }
                    }
                }
            } else if (modelValue.src instanceof MediaStream) {
                // Local MediaStream (not part of Galene); e.g. Webcam test
                setStream(modelValue.src)
                if (mediaRef.current) {
                    mediaRef.current.srcObject = modelValue.src
                }
                await playStream()
            } else {
                throw new Error('invalid Stream source type')
            }
        }

        // A local stream that's not networked (e.g. cam preview in settings)
        if (!glnStreamRef.current) return

        glnStreamRef.current.stream = stream
    }

    const playStream = async() => {
        if (!mediaRef.current) {
            logger.warn('[Stream] playStream called but mediaRef.current is null')
            return
        }

        try {
            logger.debug(`[Stream] playing stream ${modelValue.id}`)
            await mediaRef.current.play()
            await loadSettings()
            if (onUpdate) onUpdate({...modelValue, playing: true})
            logger.debug(`[Stream] stream ${modelValue.id} playing successfully`)
        } catch(error) {
            logger.error(`[Stream] stream ${modelValue.id} terminated unexpectedly: ${error}`)
            if (glnStreamRef.current) {
                sfu.delMedia(glnStreamRef.current.id)
            }
            setMediaFailed(true)
        }
    }

    const setFullscreen = () => {
        mediaRef.current?.requestFullscreen()
    }

    const setPipMode = () => {
        if (pip.active) {
            document.exitPictureInPicture()
        } else {
            mediaRef.current?.requestPictureInPicture()
        }
    }

    const toggleEnlarge = () => {
        for (const stream of $s.streams) {
            if (stream.id !== modelValue.id) {
                stream.enlarged = false
            }
        }
        if (onUpdate) onUpdate({...modelValue, enlarged: !modelValue.enlarged})
    }

    const toggleMuteVolume = () => {
        setMuted(!muted)
        if (mediaRef.current) {
            mediaRef.current.muted = !muted
        }
    }

    const toggleStats = () => {
        setStats({visible: !stats.visible})
    }

    const toggleStreamBar = (active: boolean) => () => {
        setBar({active})
    }

    const handleVolumeChange = (sliderValue: {value: number; locked?: boolean | null}) => {
        if (onUpdate) {
            onUpdate({...modelValue, volume: {...modelValue.volume, value: sliderValue.value, locked: sliderValue.locked ?? null}})
        }
    }

    // Watch volume changes
    useEffect(() => {
        if (mediaRef.current && modelValue.volume?.value !== undefined) {
            mediaRef.current.volume = modelValue.volume.value / 100
        }
    }, [modelValue.volume?.value])

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            logger.debug(`unmounting ${modelValue.direction} stream ${modelValue.id}`)
            if (mediaRef.current?.src) {
                URL.revokeObjectURL(mediaRef.current.src)
            } else if (mediaRef.current) {
                mediaRef.current.srcObject = null
            }
        }
    }, [])

    // Mount logic
    useEffect(() => {
        if (!rootRef.current || !mediaRef.current) return

        // Directly set the default aspect-ratio
        rootRef.current.style.setProperty('--aspect-ratio', String(modelValue.aspectRatio))

        // Firefox doesn't support this API (yet).
        if ('requestPictureInPicture' in (mediaRef.current as HTMLVideoElement)) {
            const enterPip = () => setPip({...pip, active: true})
            const leavePip = () => setPip({...pip, active: false})

            mediaRef.current.addEventListener('enterpictureinpicture', enterPip)
            mediaRef.current.addEventListener('leavepictureinpicture', leavePip)

            return () => {
                mediaRef.current?.removeEventListener('enterpictureinpicture', enterPip)
                mediaRef.current?.removeEventListener('leavepictureinpicture', leavePip)
            }
        }
    }, [])

    useEffect(() => {
        if (!mediaRef.current) return

        const handleLoadedMetadata = () => {
            if (mediaRef.current && mediaRef.current.videoHeight) {
                const aspectRatio = mediaRef.current.videoWidth / mediaRef.current.videoHeight
                rootRef.current?.style.setProperty('--aspect-ratio', String(aspectRatio))
                if (onUpdate) onUpdate({...modelValue, aspectRatio})
            }
        }

        mediaRef.current.addEventListener('loadedmetadata', handleLoadedMetadata)

        setMuted(mediaRef.current.muted)

        if (modelValue.direction === 'up') mountUpstream()
        else mountDownstream()

        return () => {
            mediaRef.current?.removeEventListener('loadedmetadata', handleLoadedMetadata)
        }
    }, [modelValue.id, modelValue.direction])

    return (
        <div
            class={classnames('c-stream', {
                audio: modelValue.hasAudio && !modelValue.hasVideo,
                enlarged: modelValue.enlarged,
                loading: !modelValue.playing,
            })}
            onMouseOut={toggleStreamBar(false)}
            onMouseOver={toggleStreamBar(true)}
            ref={rootRef}
        >
            <video
                autoplay={true}
                class={classnames('media', {'media-failed': mediaFailed, mirror: modelValue.mirror})}
                muted={modelValue.direction === 'up'}
                onClick={(e) => {
                    e.stopPropagation()
                    toggleEnlarge()
                }}
                playsinline={true}
                ref={mediaRef}
            />

            {!modelValue.playing &&
                <div class='loading-container'>
                    <Icon className='spinner' name='spinner' />
                </div>}

            {modelValue.playing && !modelValue.hasVideo &&
                <div class='media-container'>
                    <svg height='40' viewBox='0 0 24 24' width='40'>
                        <IconLogo />
                    </svg>
                </div>}

            {stats.visible && <Reports description={modelValue} onClick={toggleStats} />}

            {controls && modelValue.playing &&
                <div class='user-info'>
                    {audioEnabled && stream &&
                        <SoundMeter
                            class='soundmeter'
                            orientation='vertical'
                            stream={stream}
                            streamId={stream.id}
                        />}

                    {audioEnabled && modelValue.direction === 'down' &&
                        <div class='volume-slider'>
                            <FieldSlider
                                IconComponent={Icon}
                                onChange={handleVolumeChange}
                                value={{value: modelValue.volume?.value || 100, locked: modelValue.volume?.locked ?? null}}
                            />
                        </div>}

                    <div class={classnames('user', {'has-audio': audioEnabled})}>
                        {modelValue.username}
                    </div>
                </div>}

            <div class={classnames('stream-options', {active: bar.active})}>
                {pip.enabled &&
                    <Button
                        icon='Pip'
                        onClick={setPipMode}
                        size='s'
                        tip={$t('stream.pip')}
                        variant='menu'
                    />}

                <Button
                    icon='Fullscreen'
                    onClick={setFullscreen}
                    size='s'
                    tip={$t('stream.fullscreen')}
                    variant='menu'
                />

                {hasSettings &&
                    <Button
                        active={stats.visible}
                        icon='Info'
                        onClick={toggleStats}
                        size='s'
                        tip={$t('stream.info')}
                        variant='menu'
                    />}
            </div>
        </div>
    )
}
