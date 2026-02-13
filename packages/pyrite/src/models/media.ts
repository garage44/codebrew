import {$s} from '@/app'
import {$t, logger, notifier} from '@garage44/common/app'
import * as sfu from './sfu/sfu.ts'

export let localStream: MediaStream | null | undefined = null
export let screenStream: MediaStream | null | undefined = null

// Fake stream resources (cleaned up when stream stops)
let fakeVideoCanvas: HTMLCanvasElement | null = null
let fakeVideoContext: CanvasRenderingContext2D | null = null
let fakeVideoAnimationFrame: number | null = null
let fakeAudioContext: AudioContext | null = null
let fakeAudioOscillator: OscillatorNode | null = null
let fakeAudioGain: GainNode | null = null
let fakeAudioAnalyser: AnalyserNode | null = null
let fakeAudioDataArray: Uint8Array | null = null
let fakeAudioSource: MediaStreamAudioSourceNode | null = null

/**
 * Helper function to create fake stream fallback when no devices are available
 */
async function createFakeStreamFallback(selectedVideoDevice: unknown, selectedAudioDevice: unknown): Promise<void> {
    logger.info(`[media] No devices available, creating fake stream as fallback`)
    try {
        const width = (selectedVideoDevice && typeof selectedVideoDevice === 'object' && 'width' in selectedVideoDevice && typeof selectedVideoDevice.width === 'object' && selectedVideoDevice.width !== null && 'ideal' in selectedVideoDevice.width ? selectedVideoDevice.width.ideal : 640) as number
        const height = (selectedVideoDevice && typeof selectedVideoDevice === 'object' && 'height' in selectedVideoDevice && typeof selectedVideoDevice.height === 'object' && selectedVideoDevice.height !== null && 'ideal' in selectedVideoDevice.height ? selectedVideoDevice.height.ideal : 480) as number

        // Try to get microphone access if audio is enabled and video is fake
        // This allows the pattern to oscillate with microphone input
        let microphoneStream: MediaStream | null = null
        if (selectedVideoDevice && selectedAudioDevice) {
            // Video is fake, but try to get real microphone for pattern oscillation
            try {
                microphoneStream = await navigator.mediaDevices.getUserMedia({audio: true, video: false})
                logger.debug(`[media] Got microphone access for pattern oscillation`)
            } catch (error) {
                logger.debug(`[media] Could not get microphone access: ${error}`)
            }
        }

        localStream = createFakeStream({
            audio: Boolean(selectedAudioDevice),
            height,
            microphoneStream: microphoneStream || null,
            video: Boolean(selectedVideoDevice),
            width,
        })

        notifier.notify({
            level: 'info',
            message: microphoneStream ? 'No camera available. Using test pattern with microphone input.' : 'No devices available. Using test pattern stream.',
        })
    } catch (error) {
        logger.error(`[media] Failed to create fake stream: ${error}`)
    }
}

/**
 * Creates a fake MediaStream with synthetic video and/or audio tracks.
 * Used as a fallback when no real devices are available.
 * @param options.video - Whether to create a fake video track
 * @param options.audio - Whether to create a fake audio track
 * @param options.width - Video width (default: 640)
 * @param options.height - Video height (default: 480)
 * @param options.microphoneStream - Optional real microphone stream to use for pattern oscillation
 */
function createFakeStream(options: {
    video?: boolean
    audio?: boolean
    width?: number
    height?: number
    microphoneStream?: MediaStream | null
}): MediaStream {
    // Force 4:3 aspect ratio for fake stream (consistent across all browsers)
    const {video = false, audio = false, microphoneStream = null} = options
    const width = 640  // Always use 4:3 aspect ratio
    const height = 480 // Always use 4:3 aspect ratio
    const stream = new MediaStream()

    // Set up audio analysis if microphone stream is provided
    let audioLevel = 0.1 // Default audio level (0-1)
    if (microphoneStream && microphoneStream.getAudioTracks().length > 0) {
        try {
            fakeAudioContext = new AudioContext()
            fakeAudioSource = fakeAudioContext.createMediaStreamSource(microphoneStream)
            fakeAudioAnalyser = fakeAudioContext.createAnalyser()
            fakeAudioAnalyser.fftSize = 256
            fakeAudioDataArray = new Uint8Array(fakeAudioAnalyser.frequencyBinCount)
            fakeAudioSource.connect(fakeAudioAnalyser)
            logger.debug(`[media] Set up audio analysis for pattern oscillation`)
        } catch (error) {
            logger.warn(`[media] Failed to set up audio analysis: ${error}`)
        }
    }

    // Create fake video track from Canvas
    if (video) {
        fakeVideoCanvas = document.createElement('canvas')
        fakeVideoCanvas.width = width
        fakeVideoCanvas.height = height
        fakeVideoContext = fakeVideoCanvas.getContext('2d')

        if (!fakeVideoContext) {
            throw new Error('Failed to create canvas context for fake video')
        }

        let frame = 0
        const drawFrame = (): void => {
            if (!fakeVideoContext || !fakeVideoCanvas) {return}

            // Get audio level if microphone is available
            if (fakeAudioAnalyser && fakeAudioDataArray) {
                fakeAudioAnalyser.getByteFrequencyData(fakeAudioDataArray as Uint8Array<ArrayBuffer>)
                // Calculate RMS (root mean square) for overall volume
                let sum = 0
                for (const value of fakeAudioDataArray) {
                    sum += value * value
                }
                const rms = Math.sqrt(sum / fakeAudioDataArray.length) / 255
                // Smooth the audio level with exponential averaging
                audioLevel = Math.max(rms, audioLevel * 0.9)
            }

            const ctx = fakeVideoContext
            const w = fakeVideoCanvas.width
            const h = fakeVideoCanvas.height

            // Clear canvas with theme-matching dark blue background
            // Matches --surface-1: oklch(0.16 0.020 230) ≈ #1e2332
            ctx.fillStyle = '#1e2332' // Dark blue-grey matching theme surface-1
            ctx.fillRect(0, 0, w, h)

            // Draw animated pattern with audio-driven oscillation
            const time = frame * 0.05
            const centerX = w / 2
            const centerY = h / 2

            // Scale circles based on canvas size to fit any aspect ratio
            // Use the smaller dimension as reference to ensure circles fit
            const minDimension = Math.min(w, h)
            const scaleFactor = minDimension / 480 // Normalize to 480px reference

            // Maximum radius ensuring circles fit with padding
            // Account for: stroke line width (max ~6px), gradient extension (10%), and padding
            const maxLineWidth = 2.5 + 3.5 // Maximum line width (base + audio max)
            // Use 35% of min dimension, leaving room for stroke (lineWidth/2) and gradient extension
            const maxRadius = Math.min(w, h) * 0.35 - maxLineWidth / 2

            // Audio-driven amplitude multiplier (0.5x to 3x based on audio level)
            const audioAmplitude = 0.5 + audioLevel * 2.5

            // Draw concentric circles with blue-tinted gradients
            for (let i = 0; i < 5; i += 1) {
                // Base radius scaled to canvas size, ensuring circles fit
                const baseRadius = (50 + i * 40) * scaleFactor
                const audioPulse = audioLevel * 30 * scaleFactor * (1 + Math.sin(time * 2 + i))
                const timeOscillation = Math.sin(time + i) * 20 * scaleFactor
                const radius = baseRadius + audioPulse + timeOscillation

                // Calculate line width first (needed for proper clamping)
                const lineWidth = 2.5 + audioLevel * 3.5 // Thicker lines with more audio

                // Clamp radius accounting for stroke width (stroke extends lineWidth/2 beyond radius)
                // Also account for gradient extension (10% beyond radius)
                const maxEffectiveRadius = maxRadius - lineWidth / 2
                const clampedRadius = Math.min(radius, maxEffectiveRadius)

                // Theme-matching blue color scheme (hue 230 matches --h-primary)
                // Shift hue slightly per circle for subtle variation
                const baseHue = 230 + i * 5 // Start at theme primary blue (230), subtle shift per circle
                const hueVariation = Math.sin(time * 0.5 + i) * 10 // Subtle hue animation
                const hue = (baseHue + hueVariation + audioLevel * 15) % 360

                // Saturation and lightness matching theme primary colors
                // Theme uses chroma 0.06-0.08 and lightness 0.4-0.6 for primary colors
                const saturation = 55 + audioLevel * 30 // 55-85% saturation (matches theme chroma)
                const lightness = 50 + audioLevel * 20 // 50-70% lightness (matches theme lightness)

                // Create radial gradient for each circle
                // Gradient goes from brighter center to darker edges
                // Ensure gradient outer edge doesn't exceed maxEffectiveRadius
                const gradientOuterRadius = Math.min(clampedRadius * 1.1, maxEffectiveRadius)
                const gradient = ctx.createRadialGradient(
                    centerX, centerY, clampedRadius * 0.7, // Inner circle (gradient start)
                    centerX, centerY, gradientOuterRadius    // Outer circle (gradient end, clamped)
                )

                // Inner color (brighter, more saturated)
                const innerHue = (hue + 10) % 360
                gradient.addColorStop(0, `hsl(${innerHue}, ${saturation}%, ${lightness + 10}%)`)

                // Middle color (main color)
                gradient.addColorStop(0.5, `hsl(${hue}, ${saturation}%, ${lightness}%)`)

                // Outer color (darker, less saturated)
                const outerHue = (hue - 10 + 360) % 360
                gradient.addColorStop(1, `hsl(${outerHue}, ${saturation * 0.6}%, ${lightness - 15}%)`)

                ctx.strokeStyle = gradient
                ctx.lineWidth = lineWidth
                ctx.beginPath()
                ctx.arc(centerX, centerY, clampedRadius, 0, Math.PI * 2)
                ctx.stroke()
            }

            // Draw audio visualization bars with blue-tinted gradients
            if (fakeAudioAnalyser && fakeAudioDataArray) {
                const barCount = 20
                const barWidth = w / (barCount + 1)
                const maxBarHeight = h * 0.3

                for (let i = 0; i < barCount; i += 1) {
                    const dataIndex = Math.floor((i / barCount) * fakeAudioDataArray.length)
                    const barHeight = (fakeAudioDataArray[dataIndex] / 255) * maxBarHeight
                    const x = (i + 1) * barWidth
                    const y = h - barHeight

                    // Theme-matching blue gradient for each bar
                    const barGradient = ctx.createLinearGradient(x - barWidth / 2, y, x - barWidth / 2, h)
                    const barHue = (230 + (i / barCount) * 20 + time * 5) % 360 // Theme primary blue range (230-250)
                    barGradient.addColorStop(0, `hsl(${barHue}, 70%, 55%)`) // Top: brighter
                    barGradient.addColorStop(1, `hsl(${barHue}, 55%, 40%)`) // Bottom: darker

                    ctx.fillStyle = barGradient
                    ctx.fillRect(x - barWidth / 2, y, barWidth * 0.8, barHeight)
                }
            }

            // Draw "No Camera" text
            ctx.fillStyle = '#ffffff'
            ctx.font = 'bold 32px sans-serif'
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            ctx.fillText('No Camera Available', centerX, centerY - 60)
            ctx.font = '20px sans-serif'
            const statusText = microphoneStream ? 'Using microphone input' : 'Using test pattern'
            ctx.fillText(statusText, centerX, centerY + 20)

            frame += 1
            fakeVideoAnimationFrame = requestAnimationFrame(drawFrame)
        }

        drawFrame()

        // Create video track from canvas stream
        const videoTrack = fakeVideoCanvas.captureStream(30).getVideoTracks()[0]
        if (videoTrack) {
            // Clean up when track stops
            videoTrack.addEventListener('ended', (): void => {
                if (fakeVideoAnimationFrame !== null) {
                    cancelAnimationFrame(fakeVideoAnimationFrame)
                    fakeVideoAnimationFrame = null
                }
                if (fakeAudioSource) {
                    fakeAudioSource.disconnect()
                    fakeAudioSource = null
                }
                if (fakeAudioAnalyser) {
                    fakeAudioAnalyser.disconnect()
                    fakeAudioAnalyser = null
                }
                fakeAudioDataArray = null
                fakeVideoCanvas = null
                fakeVideoContext = null
            })
            stream.addTrack(videoTrack)
        }
    }

    // Create fake audio track or use real microphone stream
    if (audio) {
        if (microphoneStream && microphoneStream.getAudioTracks().length > 0) {
            // Use real microphone audio track
            const audioTrack = microphoneStream.getAudioTracks()[0]
            stream.addTrack(audioTrack.clone())
            logger.debug(`[media] Using real microphone audio track for fake stream`)
        } else {
            // Create silent fake audio track
            try {
                if (!fakeAudioContext) {
                    fakeAudioContext = new AudioContext()
                }
                fakeAudioOscillator = fakeAudioContext.createOscillator()
                fakeAudioGain = fakeAudioContext.createGain()

                // Set gain to 0 (silent) - we just need a track, not actual sound
                fakeAudioGain.gain.value = 0
                fakeAudioOscillator.connect(fakeAudioGain)

                // Create a MediaStreamAudioDestinationNode to get a track
                const destination = fakeAudioContext.createMediaStreamDestination()
                fakeAudioGain.connect(destination)

                // Start oscillator (silent)
                fakeAudioOscillator.start()

                const audioTrack = destination.stream.getAudioTracks()[0]
                if (audioTrack) {
                    // Clean up when track stops
                    audioTrack.addEventListener('ended', (): void => {
                        if (fakeAudioOscillator) {
                            fakeAudioOscillator.stop()
                            fakeAudioOscillator = null
                        }
                        if (fakeAudioGain) {
                            fakeAudioGain.disconnect()
                            fakeAudioGain = null
                        }
                        if (fakeAudioContext && !fakeAudioAnalyser) {
                            // Only close if not using for audio analysis
                            fakeAudioContext.close()
                            fakeAudioContext = null
                        }
                    })
                    stream.addTrack(audioTrack)
                }
            } catch (error) {
                logger.warn(`[media] Failed to create fake audio track: ${error}`)
            }
        }
    }

    logger.info(`[media] Created fake MediaStream with video=${video}, audio=${audio}`)
    return stream
}

export async function getUserMedia(presence: unknown): Promise<MediaStream | null> {
    logger.info(`[media] getUserMedia called, channel.connected=${$s.sfu.channel.connected}`)
    $s.mediaReady = false

    // Cleanup the old networked stream first:
    if (localStream) {
        logger.debug(`[media] cleaning up existing localStream`)
        if ($s.sfu.channel.connected) {
            logger.debug(`[media] removing old camera stream from SFU`)
            sfu.delUpMediaKind('camera')
        } else {
            logger.debug(`[media] removing local stream (not connected)`)
            sfu.delLocalMedia()
        }
    }

    let selectedAudioDevice: boolean | {deviceId: string} = false
    let selectedVideoDevice: boolean | {deviceId: string; width?: {ideal: number; min: number}; height?: {ideal: number; min: number}} = false
    let userAction = false // Track if this was triggered by user action

    // Validate and check if devices are selected
    const FAKE_STREAM_ID = '__fake_stream__'
    const validateDeviceExists = (deviceId: string, deviceType: 'mic' | 'cam'): boolean => {
        if (!deviceId) {return false}
        // Fake stream is always valid
        if (deviceId === FAKE_STREAM_ID) {return true}
        const availableDevices = $s.devices[deviceType].options
        // Defensive check: ensure options is an array (may not be initialized yet)
        if (!Array.isArray(availableDevices)) {
            logger.warn(`[media] ${deviceType} device options not initialized yet, skipping validation`)
            return false
        }
        const exists = availableDevices.some((d): boolean => d.id === deviceId)
        if (!exists) {
            logger.warn(`[media] selected ${deviceType} device ${deviceId} not found in available devices, clearing selection`)
            $s.devices[deviceType].selected = {id: null, name: ''}
            return false
        }
        return true
    }

    // Check for fake stream selection (special ID)
    const isFakeCamSelected = $s.devices.cam.selected.id === FAKE_STREAM_ID
    const isFakeMicSelected = $s.devices.mic.selected.id === FAKE_STREAM_ID

    // Clear fake stream if somehow selected as microphone (shouldn't be possible, but defensive)
    if (isFakeMicSelected) {
        logger.warn(`[media] Fake stream was selected as microphone, clearing selection`)
        $s.devices.mic.selected = {id: null, name: ''}
    }

    // Check if mic device is selected and valid
    if ($s.devices.mic.selected.id !== null && !isFakeMicSelected) {
        if (validateDeviceExists($s.devices.mic.selected.id, 'mic')) {
            selectedAudioDevice = {deviceId: $s.devices.mic.selected.id}
            logger.debug(`[media] selected mic device: ${$s.devices.mic.selected.name} (${$s.devices.mic.selected.id})`)
        } else if ($s.devices.mic.enabled) {
            // Invalid device - use browser default if enabled
            selectedAudioDevice = true
            userAction = true
            logger.debug(`[media] invalid mic device cleared, using browser default`)
        }
    } else if ($s.devices.mic.enabled && !isFakeMicSelected) {
        // Device enabled but not selected - use browser default
        selectedAudioDevice = true
        userAction = true
        logger.debug(`[media] mic enabled but no device selected, using browser default`)
    }

    // Check if cam device is selected and valid
    if ($s.devices.cam.selected.id !== null && !isFakeCamSelected) {
        if (validateDeviceExists($s.devices.cam.selected.id, 'cam')) {
            selectedVideoDevice = {deviceId: $s.devices.cam.selected.id}
            logger.debug(`[media] selected cam device: ${$s.devices.cam.selected.name} (${$s.devices.cam.selected.id})`)
        } else if ($s.devices.cam.enabled) {
            // Invalid device - use browser default if enabled
            selectedVideoDevice = true
            userAction = true
            logger.debug(`[media] invalid cam device cleared, using browser default`)
        }
    } else if ($s.devices.cam.enabled && !isFakeCamSelected) {
        // Device enabled but not selected - use browser default
        selectedVideoDevice = true
        userAction = true
        logger.debug(`[media] cam enabled but no device selected, using browser default`)
    }

    // Apply device enabled settings (enable/disable)
    // Use $s.devices.cam.enabled as the source of truth for button state
    if (!$s.devices.cam.enabled) {
        selectedVideoDevice = false
        userAction = true
        logger.debug(`[media] camera disabled, skipping video`)
    }
    if (!$s.devices.mic.enabled) {
        selectedAudioDevice = false
        userAction = true
        logger.debug(`[media] microphone disabled, skipping audio`)
    }
    // A local stream cannot be initialized with neither audio and video; return early.
    if (!$s.devices.cam.enabled && !$s.devices.mic.enabled) {
        logger.debug(`[media] both camera and mic disabled, cannot create stream`)
        $s.mediaReady = true
        return null
    }

    // Handle fake stream selection
    if (isFakeCamSelected || isFakeMicSelected) {
        logger.info(`[media] Fake stream selected, creating fake stream`)
        try {
            let width = 640
            if ($s.devices.cam.resolution.id === '1080p') {
                width = 1920
            } else if ($s.devices.cam.resolution.id === '720p') {
                width = 1280
            }
            let height = 480
            if ($s.devices.cam.resolution.id === '1080p') {
                height = 1080
            } else if ($s.devices.cam.resolution.id === '720p') {
                height = 720
            }

            // Try to get microphone access if audio is enabled and video is fake
            // This allows the pattern to oscillate with microphone input
            let microphoneStream: MediaStream | null = null
            if (isFakeCamSelected && !isFakeMicSelected && $s.devices.mic.enabled) {
                // Video is fake, but try to get real microphone for pattern oscillation
                try {
                    microphoneStream = await navigator.mediaDevices.getUserMedia({audio: true, video: false})
                    logger.debug(`[media] Got microphone access for pattern oscillation`)
                } catch (error) {
                    logger.debug(`[media] Could not get microphone access: ${error}`)
                }
            }

            localStream = createFakeStream({
                audio: isFakeMicSelected || $s.devices.mic.enabled,
                height,
                microphoneStream: microphoneStream || null,
                video: isFakeCamSelected || $s.devices.cam.enabled,
                width,
            })

            notifier.notify({
                level: 'info',
                message: microphoneStream ? 'Using test pattern with microphone input.' : 'Using test pattern stream.',
            })

            // Add local stream to Galène; handle peer connection logic.
            if ($s.sfu.channel.connected) {
                logger.debug(`[media] group is connected, adding user media to SFU`)
                try {
                    await sfu.addUserMedia()
                    logger.debug(`[media] addUserMedia completed`)
                } catch (error) {
                    logger.error(`[media] addUserMedia failed: ${error}`)
                    throw error
                }
            } else {
                logger.debug(`[media] group not connected, skipping addUserMedia`)
            }

            // Ensure device enabled state matches what we actually got
            if (isFakeCamSelected || $s.devices.cam.enabled) {
                $s.devices.cam.enabled = true
                logger.info(`[media] Fake video track obtained, setting cam.enabled=true`)
            }
            if (isFakeMicSelected || $s.devices.mic.enabled) {
                $s.devices.mic.enabled = true
                logger.info(`[media] Fake audio track obtained, setting mic.enabled=true`)
            }

            $s.mediaReady = true
            logger.info(`[media] getUserMedia complete with fake stream, mediaReady=true`)
            return localStream
        } catch (error) {
            logger.error(`[media] Failed to create fake stream: ${error}`)
            notifier.notify({level: 'error', message: `Failed to create fake stream: ${error}`})
            $s.mediaReady = true
            return null
        }
    }

    // Verify whether the local mediastream is using the proper device setup.
    logger.debug(`[media] using cam ${$s.devices.cam.selected.name}`)
    logger.debug(`[media] using mic ${$s.devices.mic.selected.name}`)

    if (selectedVideoDevice && typeof selectedVideoDevice === 'object') {
        if ($s.devices.cam.resolution.id === '720p') {
            logger.debug(`[media] using 720p resolution`)
            selectedVideoDevice.width = {ideal: 1280, min: 640}
            selectedVideoDevice.height = {ideal: 720, min: 400}
        } else if ($s.devices.cam.resolution.id === '1080p') {
            logger.debug(`[media] using 1080p resolution`)
            selectedVideoDevice.width = {ideal: 1920, min: 640}
            selectedVideoDevice.height = {ideal: 1080, min: 400}
        }
    }

    const constraints: MediaStreamConstraints = {
        audio: selectedAudioDevice ?? false,
        video: selectedVideoDevice ?? false,
    }

    // Validate constraints before calling getUserMedia
    if (!selectedAudioDevice && !selectedVideoDevice) {
        logger.debug(`[media] both audio and video are disabled/not available, cannot create stream`)
        // Only show warning if this was triggered by user action (button click)
        // Don't show warning for automatic calls (on page refresh before devices initialized)
        if (userAction) {
            // User intentionally clicked button but both ended up disabled
            logger.warn(`[media] user action triggered but both devices disabled`)
            notifier.notify({level: 'warning', message: 'Cannot create stream: both audio and video are disabled'})
        } else {
            // Automatic call with both disabled - just log, don't notify
            logger.debug(`[media] automatic call with both disabled, skipping silently`)
        }
        $s.mediaReady = true
        return null
    }

    logger.debug(`[media] requesting getUserMedia with constraints:`, constraints)

    try {
        localStream = await navigator.mediaDevices.getUserMedia(constraints)
        logger.debug(`[media] getUserMedia successful, tracks: ${localStream.getTracks().map((t): string => `${t.kind}:${t.id}`).join(', ')}`)
    } catch (error: unknown) {
        logger.error(`[media] getUserMedia failed: ${error}`)

        // Handle NotFoundError - device ID doesn't exist or is invalid
        const errorObj = error instanceof Error ? error : {message: String(error), name: ''}
        if (errorObj.name === 'NotFoundError' || errorObj.name === 'NotReadableError' || (typeof errorObj.message === 'string' && errorObj.message.includes('not be found'))) {
            logger.warn(`[media] selected device not found, falling back to browser default`)

            // Retry with browser default (no deviceId specified)
            let audioValue: boolean | {deviceId: string} | null = false
            if (selectedAudioDevice) {
                audioValue = typeof selectedAudioDevice === 'object' ? true : selectedAudioDevice
            }
            let videoValue: boolean | {deviceId: string; width?: {ideal: number; min: number}; height?: {ideal: number; min: number}} | null = false
            if (selectedVideoDevice) {
                videoValue = typeof selectedVideoDevice === 'object' ? true : selectedVideoDevice
            }
            const fallbackConstraints: {audio: boolean | {deviceId: string} | null; video: boolean | {deviceId: string; width?: {ideal: number; min: number}; height?: {ideal: number; min: number}} | null} = {
                audio: audioValue,
                video: videoValue,
            }

            // Remove deviceId if it was specified - let browser choose
            if (fallbackConstraints.audio && typeof fallbackConstraints.audio === 'object' && 'deviceId' in fallbackConstraints.audio) {
                fallbackConstraints.audio = true
            }
            if (fallbackConstraints.video && typeof fallbackConstraints.video === 'object' && 'deviceId' in fallbackConstraints.video) {
                fallbackConstraints.video = true
            }

            if (fallbackConstraints.audio || fallbackConstraints.video) {
                const validConstraints: MediaStreamConstraints = {
                    audio: fallbackConstraints.audio ?? false,
                    video: fallbackConstraints.video ?? false,
                }
                logger.debug(`[media] retrying getUserMedia with browser default:`, validConstraints)
                try {
                    localStream = await navigator.mediaDevices.getUserMedia(validConstraints)
                    logger.debug(`[media] getUserMedia with browser default successful`)

                    // Clear invalid device selection - browser will use default
                    if (constraints.audio && typeof constraints.audio === 'object' && 'deviceId' in constraints.audio && constraints.audio.deviceId) {
                        logger.debug(`[media] clearing invalid mic device selection`)
                        $s.devices.mic.selected = {id: null, name: ''}
                    }
                    if (constraints.video && typeof constraints.video === 'object' && 'deviceId' in constraints.video && constraints.video.deviceId) {
                        logger.debug(`[media] clearing invalid cam device selection`)
                        $s.devices.cam.selected = {id: null, name: ''}
                    }

                    notifier.notify({
                        level: 'warning',
                        message: 'Selected device not found, using browser default. Please select a device in settings.',
                    })
                } catch (error) {
                    logger.error(`[media] getUserMedia fallback also failed: ${error}`)

                    // Check if no devices are available - use fake stream as last resort
                    const hasNoDevices = (!$s.devices.cam.options.length && selectedVideoDevice) ||
                                        (!$s.devices.mic.options.length && selectedAudioDevice)

                    if (hasNoDevices && (selectedVideoDevice || selectedAudioDevice)) {
                        await createFakeStreamFallback(selectedVideoDevice, selectedAudioDevice)
                        notifier.notify({level: 'error', message: `Failed to access media: ${error}`})
                        $s.mediaReady = true
                        return null
                    }
                    notifier.notify({level: 'error', message: `Failed to access media: ${error}`})
                    $s.mediaReady = true
                    return null
                }
            } else {
                // Both disabled, can't fallback
                logger.error(`[media] both devices disabled, cannot fallback`)
                notifier.notify({level: 'error', message: String(error)})
                $s.mediaReady = true
                return null
            }
        } else {
            // Other errors (permission denied, etc.) - check if we should use fake stream
            const hasNoDevices = (!$s.devices.cam.options.length && selectedVideoDevice) ||
                                (!$s.devices.mic.options.length && selectedAudioDevice)

            if (hasNoDevices && (selectedVideoDevice || selectedAudioDevice)) {
                const errorObj = error instanceof Error ? error : {name: String(error)}
                logger.info(`[media] No devices available (${errorObj.name}), creating fake stream as fallback`)
                try {
                    const width = selectedVideoDevice && typeof selectedVideoDevice === 'object' && selectedVideoDevice.width?.ideal || 640
                    const height = selectedVideoDevice && typeof selectedVideoDevice === 'object' && selectedVideoDevice.height?.ideal || 480

                    // Try to get microphone access if audio is enabled and video is fake
                    // This allows the pattern to oscillate with microphone input
                    let microphoneStream: MediaStream | null = null
                    if (selectedVideoDevice && selectedAudioDevice) {
                        // Video is fake, but try to get real microphone for pattern oscillation
                        try {
                            microphoneStream = await navigator.mediaDevices.getUserMedia({audio: true, video: false})
                            logger.debug(`[media] Got microphone access for pattern oscillation`)
                        } catch (error) {
                            logger.debug(`[media] Could not get microphone access: ${error}`)
                        }
                    }

                    localStream = createFakeStream({
                        audio: Boolean(selectedAudioDevice),
                        height,
                        microphoneStream: microphoneStream || null,
                        video: Boolean(selectedVideoDevice),
                        width,
                    })

                    notifier.notify({
                        level: 'info',
                        message: microphoneStream ? 'No camera available. Using test pattern with microphone input.' : 'No devices available. Using test pattern stream.',
                    })
                } catch (error) {
                    logger.error(`[media] Failed to create fake stream: ${error}`)
                    notifier.notify({level: 'error', message: String(error)})
                    $s.mediaReady = true
                    return null
                }
            } else {
                notifier.notify({level: 'error', message: String(error)})
                $s.mediaReady = true
                return null
            }
        }
    }

    // Add local stream to Galène; handle peer connection logic.
    if ($s.sfu.channel.connected) {
        logger.debug(`[media] group is connected, adding user media to SFU`)
        try {
            await sfu.addUserMedia()
            logger.debug(`[media] addUserMedia completed`)
        } catch (error) {
            logger.error(`[media] addUserMedia failed: ${error}`)
            throw error
        }
    } else {
        logger.debug(`[media] group not connected, skipping addUserMedia`)
    }

    // Ensure device enabled state matches what we actually got
    // If video was requested and we got it, keep cam.enabled = true
    if (selectedVideoDevice && localStream.getVideoTracks().length > 0) {
        $s.devices.cam.enabled = true
        logger.info(`[media] Video track obtained, setting cam.enabled=true`)
    }
    // If audio was requested and we got it, keep mic.enabled = true
    if (selectedAudioDevice && localStream.getAudioTracks().length > 0) {
        $s.devices.mic.enabled = true
        logger.info(`[media] Audio track obtained, setting mic.enabled=true`)
    }

    $s.mediaReady = true
    logger.info(`[media] getUserMedia complete, mediaReady=true, cam.enabled=${$s.devices.cam.enabled}, mic.enabled=${$s.devices.mic.enabled}`)
    return localStream
}

export async function queryDevices(): Promise<void> {
    logger.info('querying for devices')

    // Initialize options arrays
    $s.devices.mic.options = []
    $s.devices.cam.options = []
    $s.devices.audio.options = []

    // Add fake stream option to camera only (not microphone - fake stream uses real mic if available)
    const FAKE_STREAM_ID = '__fake_stream__'
    $s.devices.cam.options.push({id: FAKE_STREAM_ID, name: 'Fake Stream (Test Pattern)'})

    // The device labels stay empty when there is no media permission.
    // We need to request permission first to get device labels (especially for microphones)
    let devices: MediaDeviceInfo[] = []
    let permissionStream: MediaStream | null = null
    try {
        // Request microphone and camera permissions to get device labels
        // This is required in most browsers to see device names
        try {
            permissionStream = await navigator.mediaDevices.getUserMedia({audio: true, video: true})
            logger.debug(`[media] Got media permissions, enumerating devices`)
        } catch {
            // Permission denied or not available - try audio-only for microphone enumeration
            logger.debug(`[media] Full media permission denied, trying audio-only for microphone enumeration`)
            try {
                permissionStream = await navigator.mediaDevices.getUserMedia({audio: true, video: false})
                logger.debug(`[media] Got audio permission for microphone enumeration`)
            } catch (error) {
                logger.warn(`[media] Could not get media permissions: ${error}`)
                // Continue anyway - devices will be enumerated but without labels
            }
        }

        devices = await navigator.mediaDevices.enumerateDevices()
        logger.debug(`[media] Enumerated ${devices.length} devices`)

        // Stop the permission stream immediately after enumeration
        if (permissionStream) {
            for (const track of permissionStream.getTracks()) {
                track.stop()
            }
            permissionStream = null
        }
    } catch (error) {
        logger.warn(`[media] Failed to enumerate devices: ${error}`)
        // Clean up permission stream if it exists
        if (permissionStream) {
            for (const track of permissionStream.getTracks()) {
                track.stop()
            }
        }
        // Don't return early - still show fake stream option for camera
        // Microphone devices will be empty, which is better than showing fake stream as a mic option
        logger.debug(`device list updated (enumeration failed, fake stream available for camera only)`)
    }

    const labelnr = {audio: 1, cam: 1, mic: 1}
    const added: string[] = []

    for (const device of devices) {
        // Skip devices without deviceId (invalid devices)
        if (device.deviceId && !added.includes(device.deviceId)) {
            let name = device.label

            if (device.kind === 'videoinput') {
                if (!name) {name = `Camera ${labelnr.cam}`}
                $s.devices.cam.options.push({id: device.deviceId ? device.deviceId : name, name})
                labelnr.cam += 1
            } else if (device.kind === 'audioinput') {
            // Provide fallback name if label is empty (happens when permissions not granted)
            if (!name || name.trim() === '') {
                name = `Microphone ${labelnr.mic}`
                logger.debug(`[media] Microphone device has no label, using fallback name: ${name}`)
            }
                $s.devices.mic.options.push({id: device.deviceId, name})
                logger.debug(`[media] Added microphone device: ${name} (${device.deviceId})`)
                labelnr.mic += 1
            } else if (device.kind === 'audiooutput') {
                // Firefox doesn't support audio output enumeration and setSinkid
                if (!name) {name = `Output ${labelnr.audio}`}
                $s.devices.audio.options.push({id: device.deviceId ? device.deviceId : name, name})
                labelnr.audio += 1
            }

            added.push(device.deviceId)
        } else if (!device.deviceId) {
            logger.debug(`[media] Skipping device without deviceId: kind=${device.kind}`)
        }
    }

    const micCount = $s.devices.mic.options.length
    const camCount = $s.devices.cam.options.length
    const audioCount = $s.devices.audio.options.length

    logger.info(`[media] Device list updated: ${camCount} cameras, ${micCount} microphones, ${audioCount} audio outputs`)

    // Warn if no microphone devices found (likely permissions issue)
    if (micCount === 0 && devices.length > 0) {
        const audioInputDevices = devices.filter((d): boolean => d.kind === 'audioinput')
        if (audioInputDevices.length > 0) {
            logger.warn(`[media] Found ${audioInputDevices.length} audio input device(s) but none were added. This may indicate missing deviceIds or permission issues.`)
            logger.debug(`[media] Audio input devices found:`, audioInputDevices.map((d): {deviceId: string | null; kind: string; label: string} => ({deviceId: d.deviceId, kind: d.kind, label: d.label})))
        }
    }

    // Notify user if no microphones found but system likely has them
    if (micCount === 0) {
        logger.warn(`[media] No microphone devices found. If your system has microphones, please grant microphone permissions and refresh.`)
    }
}

export function removeLocalStream(): void {
    if (localStream) {
        const tracks = localStream.getTracks()
        for (const track of tracks) {
            logger.debug(`stopping track ${track.id}`)
            track.stop()
        }
    }

    // Clean up fake stream resources
    if (fakeVideoAnimationFrame !== null) {
        cancelAnimationFrame(fakeVideoAnimationFrame)
        fakeVideoAnimationFrame = null
    }
    if (fakeAudioSource) {
        fakeAudioSource.disconnect()
        fakeAudioSource = null
    }
    if (fakeAudioAnalyser) {
        fakeAudioAnalyser.disconnect()
        fakeAudioAnalyser = null
    }
    fakeAudioDataArray = null
    if (fakeAudioOscillator) {
        fakeAudioOscillator.stop()
        fakeAudioOscillator = null
    }
    if (fakeAudioGain) {
        fakeAudioGain.disconnect()
        fakeAudioGain = null
    }
    if (fakeAudioContext) {
        fakeAudioContext.close()
        fakeAudioContext = null
    }
    fakeVideoCanvas = null
    fakeVideoContext = null

    localStream = null
}

export function setDefaultDevice(useFirstAvailable = true): void {
    const invalidDevices = validateDevices()
    const emptyOption = {id: null, name: ''}
    const deviceKeys = ['audio', 'cam', 'mic'] as const
    for (const key of deviceKeys) {
        if ((key !== 'audio' || !$s.env.isFirefox) && (invalidDevices[key] || $s.devices[key].selected.id === null)) {
            if (useFirstAvailable && $s.devices[key].options.length) {
                $s.devices[key].selected = $s.devices[key].options[0]
            } else {
                $s.devices[key].selected = emptyOption
            }
        }
    }
}

export function setScreenStream(stream: MediaStream | null): void {
    screenStream = stream
}

export function validateDevices(): {audio: boolean; cam: boolean; mic: boolean} {
    const {devices} = $s
    const result: {audio: boolean; cam: boolean; mic: boolean} = {
        audio: false,
        cam: false,
        mic: false,
    }
    result.audio =
        !$s.env.isFirefox &&
        (!devices.audio.options.length || !devices.audio.options.some((i): boolean => i.id === devices.audio.selected.id))
    result.cam =
        !devices.cam.options.length || !devices.cam.options.some((i): boolean => i.id === devices.cam.selected.id)
    result.mic =
        !devices.mic.options.length || !devices.mic.options.some((i): boolean => i.id === devices.mic.selected.id)
    return result
}

navigator.mediaDevices.ondevicechange = async(): Promise<void> => {
    const oldDevices = JSON.parse(JSON.stringify($s.devices))
    await queryDevices()
    let added: {id: string | null; name: string}[] = []
    let removed: {id: string | null; name: string}[] = []
    for (const deviceType of Object.keys($s.devices)) {
        const deviceKey = deviceType as 'audio' | 'cam' | 'mic'
        const currentDevice = $s.devices[deviceKey]
        const deviceOptions = Array.isArray(currentDevice.options) ? currentDevice.options as {id: string | null; name: string}[] : []
        const oldDevice = oldDevices[deviceKey]
        const oldDeviceOptions = Array.isArray(oldDevice?.options) ? oldDevice.options as {id: string | null; name: string}[] : []
        const _added = deviceOptions.filter((i): boolean => !oldDeviceOptions.some((j): boolean => i.id === j.id))
        const _removed = oldDeviceOptions.filter((i): boolean => !deviceOptions.some((j): boolean => i.id === j.id))
        if (_added.length) {added = [...added, ..._added]}
        if (_removed.length) {removed = [...removed, ..._removed]}
    }

    if (added.length) {
        notifier.notify({
            icon: 'Headset',
            level: 'info',
            list: added.map((i): string => i.name),
            message: $t('device.added', {count: added.length}),
        })
    }
    if (removed.length) {
        notifier.notify({
            icon: 'Headset',
            level: 'warning',
            list: removed.map((i): string => i.name),
            message: $t('device.removed', {count: removed.length}),
        })
    }
    const invalidDevices = validateDevices()

    if ($s.sfu.channel.connected && Object.values(invalidDevices).some(Boolean)) {
        // Note: Routing should be handled by the component, not here
        notifier.notify({
            icon: 'Headset',
            level: 'warning',
            list: Object.entries(invalidDevices)
                .filter(([_, value]): boolean => value)
                .map(([key]): string => $t(`device.select_${key}_label`)),
            message: $t('device.action_required', {count: removed.length}),
        })
        // Don't set a default option; it must be clear that an
        // Invalid device option is set while being connected.
        setDefaultDevice(false)
    } else {
        setDefaultDevice(true)
    }

}
