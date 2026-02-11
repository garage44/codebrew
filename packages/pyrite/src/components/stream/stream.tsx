import classnames from 'classnames'
import {useEffect, useRef, useMemo} from 'preact/hooks'
import {deepSignal} from 'deepsignal'
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
    const glnStreamRef = useRef<{[key: string]: unknown; _iceStateCleanup?: () => void; stream?: MediaStream} | null>(null)

    // Per-instance component state using DeepSignal (useRef to prevent recreation on each render)
    const stateRef = useRef(deepSignal({
        autoplayBlocked: false,
        bar: {active: false},
        mediaFailed: false,
        muted: false,
        pip: {active: false, enabled: false},
        stats: {visible: false},
        stream: null as MediaStream | null,
    }))
    const state = stateRef.current

    // Computed values
    const audioEnabled = useMemo(() => {
        return !!(modelValue.hasAudio && state.stream && state.stream.getAudioTracks().length)
    }, [modelValue.hasAudio, state.stream])


    const hasSettings = useMemo(() => {
        if (!modelValue?.settings) return false
        return (
            Object.keys(modelValue.settings.audio || {}).length ||
            Object.keys(modelValue.settings.video || {}).length
        )
    }, [modelValue?.settings])

    // Methods
    const loadSettings = async() => {
        if (!state.stream) return
        logger.debug('loading stream settings')
        const settings = {audio: {}, video: {}}

        const audioTracks = state.stream.getAudioTracks()
        if (audioTracks.length) {
            settings.audio = audioTracks[0].getSettings()
        }

        const videoTracks = state.stream.getVideoTracks()
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
        /*
         * Always check if stream exists in connection.down - component re-renders when it appears
         * This ensures we only mount when the stream is actually available (state-driven)
         */
        const glnStream = sfu.connection?.down[
            modelValue.id
        ]

        if (!glnStream) {
            /*
             * Stream not yet available - component will re-render when stream appears in connection.down
             * This is state-driven: when onDownStream adds stream to connection.down, component re-renders
             */
            logger.debug(`[Stream] Stream ${modelValue.id} not yet in connection.down, waiting for state update`)
            return
        }

        // Stream is available - mount it
        glnStreamRef.current = glnStream

        /*
         * Set up media immediately (like original Galène setMedia line 2053-2111)
         * Original Galène calls setMedia(c) immediately in gotDownStream (line 528)
         * This ensures the media element exists even if tracks haven't arrived yet
         */
        const setupMedia = () => {
            if (!mediaRef.current) {
                logger.debug(`[Stream] setupMedia: mediaRef.current is null for stream ${modelValue.id}`)
                return
            }

            /*
             * Set srcObject if stream is available (like original Galène line 2089-2090)
             * Also handle remount case: if srcObject is null but stream exists, set it up
             */
            const needsUpdate = mediaRef.current.srcObject !== glnStream.stream || !mediaRef.current.srcObject
            if (glnStream.stream && needsUpdate) {
                const trackCount = glnStream.stream.getTracks().length
                logger.debug(`[Stream] Setting srcObject for stream ${modelValue.id}, tracks: ${trackCount}`)
                state.stream = glnStream.stream
                mediaRef.current.srcObject = glnStream.stream

                // For Firefox canvas streams, ensure tracks are active
                const tracks = glnStream.stream.getTracks()
                tracks.forEach((track) => {
                    if (track.readyState === 'live') {
                        logger.debug(`[Stream] Track ${track.kind} is live for stream ${modelValue.id}`)
                    } else {
                        logger.debug(`[Stream] Track ${track.kind} state: ${track.readyState} for stream ${modelValue.id}`)
                    }
                })

                // If ICE is already connected, try to play immediately (handles remount case)
                const iceConnected = glnStream.pc?.iceConnectionState === 'connected' ||
                    glnStream.pc?.iceConnectionState === 'completed'
                if (glnStream.pc && iceConnected) {
                    requestAnimationFrame(() => {
                        if (mediaRef.current && glnStream.stream && mediaRef.current.srcObject) {
                            playStream().catch((error) => {
                                const errorMessage = error instanceof Error ? error.message : String(error)
                                // Don't log autoplay errors - they're expected
                                if (!errorMessage.includes('user didn\'t interact') &&
                                    !errorMessage.includes('autoplay') &&
                                    !errorMessage.includes('user interaction')) {
                                    logger.debug(`[Stream] play failed after setupMedia (will retry): ${error}`)
                                }
                            })
                        }
                    })
                }
            } else if (!glnStream.stream) {
                logger.debug(`[Stream] Stream ${modelValue.id} has no MediaStream yet (tracks may not have arrived)`)
            }
        }

        /*
         * Set up handlers for when tracks arrive (like original Galène ondowntrack line 515-517)
         * Original Galène sets this in gotDownStream and calls setMedia(c)
         * We enhance the handler set by onDownStream (or set it if component mounts first)
         *
         * IMPORTANT: The handler from onDownStream already updates state, so we just need to
         * ensure media is set up when tracks arrive
         *
         * Firefox canvas streams: Ensure stream is properly assigned and tracks are active
         */
        const existingOndowntrack = glnStream.ondowntrack
        glnStream.ondowntrack = (track: MediaStreamTrack, transceiver?: RTCRtpTransceiver, stream?: MediaStream) => {
            // Call existing handler first if it exists (from onDownStream)
            if (existingOndowntrack && existingOndowntrack !== glnStream.ondowntrack) {
                existingOndowntrack.call(glnStream, track, transceiver, stream)
            }

            // Ensure stream is assigned (critical for Firefox canvas streams)
            if (stream && !glnStream.stream) {
                logger.debug(`[Stream] Assigning stream from ondowntrack for ${modelValue.id} (Firefox canvas stream?)`)
                glnStream.stream = stream
            } else if (stream && glnStream.stream !== stream) {
                // Stream changed - ensure all tracks are present
                const existingTracks = glnStream.stream.getTracks()
                const newTracks = stream.getTracks()
                const missingTracks = newTracks.filter((t) => !existingTracks.includes(t))
                if (missingTracks.length > 0) {
                    logger.debug(`[Stream] Adding ${missingTracks.length} tracks to stream ${modelValue.id}`)
                    missingTracks.forEach((t) => glnStream.stream!.addTrack(t))
                }
            }

            // Update stream state based on track kind (component-level update)
            if (track.kind === 'audio') {
                if (onUpdate) onUpdate({...modelValue, hasAudio: true})
            } else if (track.kind === 'video') {
                if (onUpdate) onUpdate({...modelValue, hasVideo: true})
            }

            /*
             * Setup media when tracks arrive (like original Galène calls setMedia in ondowntrack)
             * This is critical - ensure media element is set up immediately when tracks arrive
             */
            setupMedia()

            /*
             * If stream is already available and ICE is connected, try to play immediately
             * Firefox canvas streams may need immediate playback setup
             */
            if (glnStream.stream && glnStream.pc) {
                const iceState = glnStream.pc.iceConnectionState
                if ((iceState === 'connected' || iceState === 'completed') && mediaRef.current) {
                    // Use requestAnimationFrame for Firefox canvas streams
                    requestAnimationFrame(() => {
                        if (mediaRef.current && glnStream.stream) {
                            playStream().catch((error) => {
                                logger.debug(`[Stream] play failed (will retry on ICE state change): ${error}`)
                            })
                        }
                    })
                }
            }
        }

        /*
         * Setup media immediately if stream already exists (like original Galène setMedia line 2089-2090)
         * This ensures the media element is ready even if tracks haven't arrived yet
         */
        setupMedia()

        /*
         * Set onnegotiationcompleted handler (like original Galène gotDownStream line 518-520)
         * Original Galène calls resetMedia(c) to reset frozen frames after negotiation
         */
        const existingOnnegotiationcompleted = glnStream.onnegotiationcompleted
        glnStream.onnegotiationcompleted = () => {
            // Call existing handler first if it exists
            if (existingOnnegotiationcompleted) {
                existingOnnegotiationcompleted.call(glnStream)
            }

            // Reset media to clear frozen frames (like original Galène resetMedia)
            if (mediaRef.current && glnStream.stream) {
                // Reset srcObject to clear frozen frames
                const currentSrc = mediaRef.current.srcObject
                if (currentSrc === glnStream.stream) {
                    mediaRef.current.srcObject = null
                    // Use requestAnimationFrame to ensure reset happens
                    requestAnimationFrame(() => {
                        if (mediaRef.current && glnStream.stream) {
                            mediaRef.current.srcObject = glnStream.stream
                        }
                    })
                }
            }
        }

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
                state.mediaFailed = false

                // Setup media if stream is available (like original Galène setMediaStatus)
                if (glnStream.stream && mediaRef.current.srcObject !== glnStream.stream) {
                    state.stream = glnStream.stream
                    mediaRef.current.srcObject = glnStream.stream
                }

                /*
                 * Play if we have a stream (like original Galène setMediaStatus line 2346-2352)
                 * Use requestAnimationFrame to ensure stream is ready (helps with Firefox streams)
                 */
                if (glnStream.stream && mediaRef.current.srcObject) {
                    requestAnimationFrame(() => {
                        if (mediaRef.current && glnStream.stream && mediaRef.current.srcObject) {
                            // Check if media is already playing or paused (not ended)
                            const isPlaying = !mediaRef.current.paused && mediaRef.current.readyState >= 2
                            if (!isPlaying) {
                                playStream().catch((error) => {
                                    const errorMessage = error instanceof Error ? error.message : String(error)
                                    // Don't log autoplay errors as debug - they're expected
                                    if (!errorMessage.includes('user didn\'t interact') &&
                                        !errorMessage.includes('autoplay') &&
                                        !errorMessage.includes('user interaction')) {
                                        logger.debug(`[Stream] play failed (will retry): ${error}`)
                                    }
                                    // Don't set failed immediately - might be a temporary issue
                                })
                            }
                        }
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
                state.mediaFailed = true
            } else {
                state.mediaFailed = false
            }
        }

        /*
         * Monitor ICE connection state changes (don't overwrite onstatus)
         * Use event listener instead of overwriting onstatus handler
         * Also listen for track events to ensure we catch tracks that arrive after mount
         */
        if (glnStream.pc) {
            const handleIceStateChange = () => {
                checkConnectionState()
                // Also check if tracks have arrived when ICE connects
                const iceConnected = glnStream.pc?.iceConnectionState === 'connected' ||
                    glnStream.pc?.iceConnectionState === 'completed'
                if (glnStream.pc && iceConnected) {
                    if (glnStream.stream && !mediaRef.current?.srcObject) {
                        logger.debug(`[Stream] ICE connected but media not set, setting up now for stream ${modelValue.id}`)
                        setupMedia()
                    }
                }
            }
            glnStream.pc.addEventListener('iceconnectionstatechange', handleIceStateChange)

            // Also listen for track events to catch tracks that arrive late
            const handleTrack = (event: RTCTrackEvent) => {
                logger.debug(`[Stream] Track event received for stream ${modelValue.id}: ${event.track.kind}`)
                if (event.streams && event.streams.length > 0) {
                    // Ensure stream is set up
                    if (!glnStream.stream && event.streams[0]) {
                        glnStream.stream = event.streams[0]
                    }
                    setupMedia()
                    // If ICE is already connected, try to play
                    const iceConnected = glnStream.pc?.iceConnectionState === 'connected' ||
                        glnStream.pc?.iceConnectionState === 'completed'
                    if (glnStream.pc && iceConnected) {
                        requestAnimationFrame(() => {
                            if (mediaRef.current && glnStream.stream) {
                                playStream().catch((error) => {
                                    logger.debug(`[Stream] play failed after track event: ${error}`)
                                })
                            }
                        })
                    }
                }
            }
            glnStream.pc.addEventListener('track', handleTrack)

            // Store cleanup on the stream object for unmount
            glnStream._iceStateCleanup = () => {
                if (glnStream.pc) {
                    glnStream.pc.removeEventListener('iceconnectionstatechange', handleIceStateChange)
                    glnStream.pc.removeEventListener('track', handleTrack)
                }
            }

            // Check immediately
            checkConnectionState()

            /*
             * Also check if tracks are already available (helps with Firefox streams that arrive early)
             * Firefox may assign tracks to the stream before ondowntrack fires, especially for canvas streams
             */
            if (glnStream.pc.getReceivers) {
                try {
                    const receivers = glnStream.pc.getReceivers()
                    if (receivers.length > 0) {
                        logger.debug(`[Stream] Found ${receivers.length} existing receivers for stream ${modelValue.id}`)
                        // Check if we need to create a stream from existing tracks
                        const tracks = receivers.map((r) => r.track).filter((t) => t && t.readyState === 'live')
                        if (tracks.length > 0) {
                            // If stream doesn't exist yet, create it from tracks (Firefox canvas streams)
                            if (!glnStream.stream) {
                                const existingStream = new MediaStream(tracks)
                                glnStream.stream = existingStream
                                const trackCount = tracks.length
                                const logMsg = `[Stream] Created MediaStream from ${trackCount} existing tracks ` +
                                    `for stream ${modelValue.id}`
                                logger.debug(logMsg)
                            } else {
                                // Stream exists but might not have all tracks - check and update
                                const existingTracks = glnStream.stream.getTracks()
                                const missingTracks = tracks.filter((t) => !existingTracks.includes(t))
                                if (missingTracks.length > 0) {
                                    const missingCount = missingTracks.length
                                    logger.debug(`[Stream] Adding ${missingCount} missing tracks to stream ${modelValue.id}`)
                                    missingTracks.forEach((track) => glnStream.stream!.addTrack(track))
                                }
                            }
                            setupMedia()
                            // If ICE is already connected, try to play
                            const iceConnected = glnStream.pc?.iceConnectionState === 'connected' ||
                                glnStream.pc?.iceConnectionState === 'completed'
                            if (glnStream.pc && iceConnected) {
                                requestAnimationFrame(() => {
                                    if (mediaRef.current && glnStream.stream) {
                                        playStream().catch((error) => {
                                            logger.debug(`[Stream] play failed after creating stream from receivers: ${error}`)
                                        })
                                    }
                                })
                            }
                        } else {
                            const receiverCount = receivers.length
                            const logMsg = `[Stream] Found ${receiverCount} receivers but no live tracks yet ` +
                                `for stream ${modelValue.id}`
                            logger.debug(logMsg)
                        }
                    }
                } catch(error) {
                    logger.debug(`[Stream] Error checking receivers: ${error}`)
                }
            }
        }
    }

    const mountUpstream = async() => {
        // Mute local streams, so people don't hear themselves talk.
        if (!state.muted) {
            toggleMuteVolume()
        }
        logger.debug(`[Stream] mounting upstream stream ${modelValue.id}`)

        if (!modelValue.src) {
            /*
             * Local media stream from a device.
             * Retry a few times - stream may not be in connection.up yet (first-load timing)
             */
            let glnStream = sfu.connection?.up[modelValue.id]
            const maxRetries = 5
            const retryDelayMs = 50

            for (let attempt = 0; (!glnStream || !glnStream.stream) && attempt < maxRetries; attempt++) {
                if (attempt > 0) {
                    logger.debug(`[Stream] Upstream ${modelValue.id} not ready, retry ${attempt}/${maxRetries}`)
                    await new Promise((r) => setTimeout(r, retryDelayMs))
                }
                glnStream = sfu.connection?.up[modelValue.id]
            }

            if (!glnStream) {
                logger.warn(`[Stream] upstream stream ${modelValue.id} not found in connection.up after ${maxRetries} retries`)
                logger.debug(`[Stream] Available streams in connection.up: ${Object.keys(sfu.connection?.up || {}).join(', ')}`)
                return
            }

            if (!glnStream.stream) {
                logger.warn(`[Stream] upstream stream ${modelValue.id} has no MediaStream assigned after ${maxRetries} retries`)
                return
            }

            logger.debug(`[Stream] upstream stream ${modelValue.id} - mounting MediaStream`)
            const tracks = glnStream.stream.getTracks()
            logger.debug(`[Stream] Stream tracks: ${tracks.map((t) => `${t.kind}:${t.readyState}`).join(', ')}`)
            glnStreamRef.current = glnStream
            state.stream = glnStream.stream

            if (mediaRef.current) {
                logger.debug(`[Stream] Setting srcObject and playing stream ${modelValue.id}`)
                mediaRef.current.srcObject = glnStream.stream
                logger.debug(`[Stream] srcObject set, calling playStream() for ${modelValue.id}`)
                await playStream()
                logger.debug(`[Stream] playStream() completed for ${modelValue.id}`)
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
                    state.stream = capturedStream
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
                state.stream = modelValue.src
                if (mediaRef.current) {
                    mediaRef.current.srcObject = modelValue.src
                }
                await playStream()
            } else {
                throw new TypeError('invalid Stream source type')
            }
        }

        // A local stream that's not networked (e.g. cam preview in settings)
        if (!glnStreamRef.current) return

        glnStreamRef.current.stream = state.stream
    }

    const playStream = async() => {
        if (!mediaRef.current) {
            logger.warn('[Stream] playStream called but mediaRef.current is null')
            return
        }

        const hasSrcObject = !!mediaRef.current.srcObject
        const paused = mediaRef.current.paused
        const readyState = mediaRef.current.readyState
        logger.debug(
            `[Stream] playStream() ${modelValue.id}, srcObject=${hasSrcObject}, paused=${paused}, readyState=${readyState}`,
        )

        try {
            const el = mediaRef.current
            if (el.readyState < 1 && el.srcObject) {
                await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
            }
            await el.play()
            logger.info(`[Stream] play() succeeded for stream ${modelValue.id}`)
            await loadSettings()
            if (onUpdate) {
                onUpdate({...modelValue, playing: true})
            }
            state.mediaFailed = false
            // Clear autoplay blocked state on successful play
            state.autoplayBlocked = false
        } catch(error) {
            /*
             * Don't remove stream on play() failure - it might be temporary (autoplay policy, Firefox canvas stream timing, etc.)
             * Like original Galène setMediaStatus line 2348-2351, we just log and mark as failed, but don't remove
             */
            const errorMessage = error instanceof Error ? error.message : String(error)
            logger.debug(`[Stream] stream ${modelValue.id} play() failed: ${errorMessage}`)

            // Check if this is a fatal error (stream ended, track ended) vs temporary (autoplay, not ready)
            const streamEnded = mediaRef.current.srcObject &&
                (mediaRef.current.srcObject as MediaStream).getTracks().every((t) => t.readyState === 'ended')
            const isFatal = errorMessage.includes('ended') || errorMessage.includes('terminated') || streamEnded

            if (isFatal) {
                logger.warn(`[Stream] stream ${modelValue.id} has fatal error, will be cleaned up by onclose handler`)
                state.mediaFailed = true
                // Don't call delMedia here - let onclose handler clean it up when stream actually closes
            } else {
                // Temporary error - just mark as failed, stream will retry on next ICE state change or track event
                const isAutoplayError = errorMessage.includes('user didn\'t interact') ||
                    errorMessage.includes('autoplay') ||
                    errorMessage.includes('user interaction')

                if (isAutoplayError) {
                    const logMsg = `[Stream] stream ${modelValue.id} play() blocked by autoplay policy, ` +
                        'will retry on user interaction'
                    logger.debug(logMsg)
                    state.mediaFailed = true
                    state.autoplayBlocked = true
                    // Set up one-time user interaction listener to retry playback
                    const retryOnInteraction = () => {
                        if (mediaRef.current && glnStreamRef.current?.stream && mediaRef.current.srcObject) {
                            logger.debug(`[Stream] User interaction detected, retrying play() for stream ${modelValue.id}`)
                            playStream().catch(() => {
                                // Ignore errors on retry - will retry again on next interaction or ICE change
                            })
                        }
                        // Remove listeners after first interaction
                        document.removeEventListener('click', retryOnInteraction, true)
                        document.removeEventListener('touchstart', retryOnInteraction, true)
                        document.removeEventListener('keydown', retryOnInteraction, true)
                    }
                    // Listen for user interaction (click, touch, keydown) to retry playback
                    document.addEventListener('click', retryOnInteraction, {capture: true, once: true})
                    document.addEventListener('touchstart', retryOnInteraction, {capture: true, once: true})
                    document.addEventListener('keydown', retryOnInteraction, {capture: true, once: true})
                } else {
                    logger.debug(`[Stream] stream ${modelValue.id} play() failed temporarily, will retry`)
                    state.mediaFailed = true
                    // Don't remove - this might be Firefox canvas stream timing issue
                }
            }
        }
    }

    const setFullscreen = () => {
        mediaRef.current?.requestFullscreen()
    }

    const setPipMode = () => {
        if (state.pip.active) {
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
        state.muted = !state.muted
        if (mediaRef.current) {
            mediaRef.current.muted = !state.muted
        }
    }

    const toggleStats = () => {
        state.stats.visible = !state.stats.visible
    }

    const toggleStreamBar = (active: boolean) => () => {
        state.bar.active = active
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
            const enterPip = () => {
                state.pip.active = true
            }
            const leavePip = () => {
                state.pip.active = false
            }

            mediaRef.current.addEventListener('enterpictureinpicture', enterPip)
            mediaRef.current.addEventListener('leavepictureinpicture', leavePip)

            return () => {
                mediaRef.current?.removeEventListener('enterpictureinpicture', enterPip)
                mediaRef.current?.removeEventListener('leavepictureinpicture', leavePip)
            }
        }
    }, [])

    const upMediaCount = modelValue.direction === 'up' ?
        $s.upMedia.camera.length + $s.upMedia.screenshare.length :
        0

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

        state.muted = mediaRef.current.muted

        if (modelValue.direction === 'up') mountUpstream()
        else mountDownstream()

        return () => {
            mediaRef.current?.removeEventListener('loadedmetadata', handleLoadedMetadata)
        }
    }, [modelValue.id, modelValue.direction, sfu.connection?.down?.[modelValue.id], upMediaCount])

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
                class={classnames('media', {'media-failed': state.mediaFailed, mirror: modelValue.mirror})}
                muted={modelValue.direction === 'up'}
                onClick={(e) => {
                    e.stopPropagation()
                    // If autoplay is blocked and stream isn't playing, try to play on click
                    if (state.autoplayBlocked && !modelValue.playing && mediaRef.current && mediaRef.current.srcObject) {
                        playStream().catch(() => {
                            // Ignore errors - user will see the message
                        })
                    } else {
                        // Otherwise, toggle enlarge as normal
                        toggleEnlarge()
                    }
                }}
                playsinline={true}
                ref={mediaRef}
            />

            {!modelValue.playing &&
                <div class='loading-container'>
                    {state.autoplayBlocked ?
                        <div class='autoplay-message'>
                            <Icon className='icon icon-l' name='webcam' />
                            <p>Click to start video</p>
                            <p class='autoplay-hint'>Browser requires user interaction to play media</p>
                        </div> :
                        <>
                            <Icon className='spinner' name='spinner' />
                        </>}
                </div>}

            {modelValue.playing && !modelValue.hasVideo &&
                <div class='media-container'>
                    <svg height='40' viewBox='0 0 24 24' width='40'>
                        <IconLogo />
                    </svg>
                </div>}

            {state.stats.visible && <Reports description={modelValue} onClick={toggleStats} />}

            {controls && modelValue.playing &&
                <div class='user-info'>
                    {audioEnabled && state.stream &&
                        <SoundMeter
                            class='soundmeter'
                            orientation='vertical'
                            stream={state.stream}
                            streamId={state.stream.id}
                        />}

                    <div class={classnames('user', {'has-audio': audioEnabled})}>
                        {modelValue.username}
                    </div>
                </div>}

            <div class={classnames('stream-options', {active: state.bar.active})}>
                    {audioEnabled && modelValue.direction === 'down' &&
                        <div class='volume-slider'>
                        <FieldSlider
                            IconComponent={Icon}
                            onChange={handleVolumeChange}
                            value={{locked: modelValue.volume?.locked ?? null, value: modelValue.volume?.value ?? 100}}
                        />
                        </div>}

                {state.pip.enabled &&
                    <Button
                        icon='pip'
                        onClick={setPipMode}
                        size='s'
                        tip={$t('stream.pip')}
                        variant='toggle'
                    />}

                <Button
                    icon='fullscreen'
                    onClick={setFullscreen}
                    size='s'
                    tip={$t('stream.fullscreen')}
                    variant='toggle'
                />

                {hasSettings &&
                    <Button
                        active={state.stats.visible}
                        icon='info'
                        onClick={toggleStats}
                        size='s'
                        tip={$t('stream.info')}
                        variant='toggle'
                    />}
            </div>
        </div>
    )
}
