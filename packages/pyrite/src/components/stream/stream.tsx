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
            const updated = {
                ...modelValue,
                settings,
            }
            onUpdate(updated)
        }
    }

    const mountDownstream = async() => {
        const glnStream = sfu.connection?.down[
            modelValue.id
        ]

        if (!glnStream) {
            const streamId = modelValue.id
            const msg = '[Stream] no sfu stream on mounting downstream ' +
                `stream ${streamId}`
            logger.debug(msg)
            return
        }

        glnStreamRef.current = glnStream

        /*
         * Set up media immediately (like original Galène setMedia)
         * The stream will be set by protocol layer when tracks arrive
         */
        const setupMedia = () => {
            if (!mediaRef.current) return

            // Set srcObject if stream is available (like original Galène line 2089-2090)
            if (glnStream.stream && mediaRef.current.srcObject !== glnStream.stream) {
                setStream(glnStream.stream)
                mediaRef.current.srcObject = glnStream.stream
            }
        }

        /*
         * Set up handlers for when tracks arrive (like original Galène ondowntrack line 515-517)
         * Original Galène sets this in gotDownStream and calls setMedia(c)
         * We enhance the handler set by onDownStream (or set it if component mounts first)
         */
        const existingOndowntrack = glnStream.ondowntrack
        glnStream.ondowntrack = (track: MediaStreamTrack, transceiver?: RTCRtpTransceiver, stream?: MediaStream) => {
            // Call existing handler first if it exists (from onDownStream)
            if (existingOndowntrack && existingOndowntrack !== glnStream.ondowntrack) {
                existingOndowntrack.call(glnStream, track, transceiver, stream)
            }

            // Update stream state based on track kind
            if (track.kind === 'audio') {
                if (onUpdate) onUpdate({...modelValue, hasAudio: true})
            } else if (track.kind === 'video') {
                if (onUpdate) onUpdate({...modelValue, hasVideo: true})
            }

            // Setup media when tracks arrive (like original Galène calls setMedia in ondowntrack)
            setupMedia()
        }

        // Setup media immediately if stream already exists
        setupMedia()

        /*
         * Don't overwrite onclose or onstatus - they're set by onDownStream
         * Original Galène sets handlers once in gotDownStream and doesn't overwrite them
         *
         * Instead, monitor ICE connection state directly for UI updates
         */
        const checkConnectionState = () => {
            if (!mediaRef.current || !glnStream.pc) return

            const iceState = glnStream.pc.iceConnectionState
            const isConnected = iceState === 'connected' || iceState === 'completed'

            if (isConnected) {
                setMediaFailed(false)

                // Setup media if stream is available (like original Galène setMediaStatus)
                if (glnStream.stream && mediaRef.current.srcObject !== glnStream.stream) {
                    setStream(glnStream.stream)
                    mediaRef.current.srcObject = glnStream.stream
                }

                // Play if we have a stream
                if (glnStream.stream && mediaRef.current.srcObject) {
                    playStream().catch((error) => {
                        logger.error(`[Stream] failed to play stream: ${error}`)
                        setMediaFailed(true)
                    })
                }

                // Set audio sink if needed
                if (audioEnabled && 'setSinkId' in (mediaRef.current as HTMLVideoElement) && $s.devices.audio.selected.id) {
                    const videoElement = mediaRef.current as HTMLVideoElement & {
                        setSinkId: (id: string) => Promise<void>
                    }
                    videoElement.setSinkId($s.devices.audio.selected.id).catch(() => {
                        // Ignore sink errors
                    })
                }
            } else if (iceState === 'failed') {
                setMediaFailed(true)
            } else {
                setMediaFailed(false)
            }
        }

        /*
         * Monitor ICE connection state changes (don't overwrite onstatus)
         * Use event listener instead of overwriting onstatus handler
         */
        if (glnStream.pc) {
            const handleIceStateChange = () => checkConnectionState()
            glnStream.pc.addEventListener('iceconnectionstatechange', handleIceStateChange)

            // Store cleanup on the stream object for unmount
            glnStream._iceStateCleanup = () => {
                if (glnStream.pc) {
                    glnStream.pc.removeEventListener('iceconnectionstatechange', handleIceStateChange)
                }
            }

            checkConnectionState() // Check immediately
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
            await mediaRef.current.play()
            await loadSettings()
            if (onUpdate) {
                onUpdate({...modelValue, playing: true})
            }
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

    const handleVolumeChange = (sliderValue: {locked?: boolean | null; value: number}) => {
        if (onUpdate) {
            onUpdate({
                ...modelValue,
                volume: {
                    ...modelValue.volume,
                    locked: sliderValue.locked ?? null,
                    value: sliderValue.value,
                },
            })
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

            // Cleanup ICE state listener if it exists
            if (glnStreamRef.current?._iceStateCleanup) {
                glnStreamRef.current._iceStateCleanup()
                delete glnStreamRef.current._iceStateCleanup
            }

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
                                value={{locked: modelValue.volume?.locked ?? null, value: modelValue.volume?.value || 100}}
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
