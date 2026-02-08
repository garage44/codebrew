import {$s} from '@/app'
import {logger, notifier, $t} from '@garage44/common/app'
import * as sfu from './sfu/sfu.ts'

export let localStream
export let screenStream

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
 * Creates a fake MediaStream with synthetic video and/or audio tracks.
 * Used as a fallback when no real devices are available.
 * @param options.video - Whether to create a fake video track
 * @param options.audio - Whether to create a fake audio track
 * @param options.width - Video width (default: 640)
 * @param options.height - Video height (default: 480)
 * @param options.microphoneStream - Optional real microphone stream to use for pattern oscillation
 */
function createFakeStream(options: {video?: boolean; audio?: boolean; width?: number; height?: number; microphoneStream?: MediaStream}): MediaStream {
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
        const drawFrame = () => {
            if (!fakeVideoContext || !fakeVideoCanvas) return

            // Get audio level if microphone is available
            if (fakeAudioAnalyser && fakeAudioDataArray) {
                fakeAudioAnalyser.getByteFrequencyData(fakeAudioDataArray)
                // Calculate RMS (root mean square) for overall volume
                let sum = 0
                for (let i = 0; i < fakeAudioDataArray.length; i++) {
                    sum += fakeAudioDataArray[i] * fakeAudioDataArray[i]
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
            for (let i = 0; i < 5; i++) {
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

                for (let i = 0; i < barCount; i++) {
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

            frame++
            fakeVideoAnimationFrame = requestAnimationFrame(drawFrame)
        }

        drawFrame()

        // Create video track from canvas stream
        const videoTrack = fakeVideoCanvas.captureStream(30).getVideoTracks()[0]
        if (videoTrack) {
            // Clean up when track stops
            videoTrack.addEventListener('ended', () => {
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
                    audioTrack.addEventListener('ended', () => {
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

export async function getUserMedia(presence) {
    logger.debug(`[media] getUserMedia called, channel.connected=${$s.sfu.channel.connected}`)
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
    const validateDeviceExists = (deviceId: string, deviceType: 'mic' | 'cam') => {
        if (!deviceId) return false
        const availableDevices = $s.devices[deviceType].options
        // Defensive check: ensure options is an array (may not be initialized yet)
        if (!Array.isArray(availableDevices)) {
            logger.warn(`[media] ${deviceType} device options not initialized yet, skipping validation`)
            return false
        }
        const exists = availableDevices.some((d) => d.id === deviceId)
        if (!exists) {
            logger.warn(`[media] selected ${deviceType} device ${deviceId} not found in available devices, clearing selection`)
            $s.devices[deviceType].selected = {id: null, name: ''}
            return false
        }
        return true
    }

    // Check if mic device is selected and valid
    if ($s.devices.mic.selected.id !== null) {
        if (validateDeviceExists($s.devices.mic.selected.id, 'mic')) {
            selectedAudioDevice = {deviceId: $s.devices.mic.selected.id}
            logger.debug(`[media] selected mic device: ${$s.devices.mic.selected.name} (${$s.devices.mic.selected.id})`)
        } else {
            // Invalid device - use browser default if enabled
            if (presence && presence.mic.enabled) {
                selectedAudioDevice = true
                userAction = true
                logger.debug(`[media] invalid mic device cleared, using browser default`)
            }
        }
    } else if (presence && presence.mic.enabled) {
        // Device enabled but not selected - use browser default
        selectedAudioDevice = true
        userAction = true
        logger.debug(`[media] mic enabled but no device selected, using browser default`)
    }

    // Check if cam device is selected and valid
    if ($s.devices.cam.selected.id !== null) {
        if (validateDeviceExists($s.devices.cam.selected.id, 'cam')) {
            selectedVideoDevice = {deviceId: $s.devices.cam.selected.id}
            logger.debug(`[media] selected cam device: ${$s.devices.cam.selected.name} (${$s.devices.cam.selected.id})`)
        } else {
            // Invalid device - use browser default if enabled
            if (presence && presence.cam.enabled) {
                selectedVideoDevice = true
                userAction = true
                logger.debug(`[media] invalid cam device cleared, using browser default`)
            }
        }
    } else if (presence && presence.cam.enabled) {
        // Device enabled but not selected - use browser default
        selectedVideoDevice = true
        userAction = true
        logger.debug(`[media] cam enabled but no device selected, using browser default`)
    }

    // Apply presence settings (enable/disable)
    if (presence) {
        if (!presence.cam.enabled) {
            selectedVideoDevice = false
            userAction = true
            logger.debug(`[media] camera disabled in presence, skipping video`)
        }
        if (!presence.mic.enabled) {
            selectedAudioDevice = false
            userAction = true
            logger.debug(`[media] microphone disabled in presence, skipping audio`)
        }
        // A local stream cannot be initialized with neither audio and video; return early.
        if (!presence.cam.enabled && !presence.mic.enabled) {
            logger.debug(`[media] both camera and mic disabled, cannot create stream`)
            $s.mediaReady = true
            return
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

    const constraints = {
        audio: selectedAudioDevice,
        video: selectedVideoDevice,
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
        return
    }

    logger.debug(`[media] requesting getUserMedia with constraints:`, constraints)

    try {
        localStream = await navigator.mediaDevices.getUserMedia(constraints)
        logger.debug(`[media] getUserMedia successful, tracks: ${localStream.getTracks().map(t => `${t.kind}:${t.id}`).join(', ')}`)
    } catch (error: any) {
        logger.error(`[media] getUserMedia failed: ${error}`)

        // Handle NotFoundError - device ID doesn't exist or is invalid
        if (error.name === 'NotFoundError' || error.name === 'NotReadableError' || error.message?.includes('not be found')) {
            logger.warn(`[media] selected device not found, falling back to browser default`)

            // Retry with browser default (no deviceId specified)
            const fallbackConstraints: {audio: boolean | {deviceId: string} | null; video: boolean | {deviceId: string; width?: {ideal: number; min: number}; height?: {ideal: number; min: number}} | null} = {
                audio: selectedAudioDevice ? (typeof selectedAudioDevice === 'object' ? true : selectedAudioDevice) : false,
                video: selectedVideoDevice ? (typeof selectedVideoDevice === 'object' ? true : selectedVideoDevice) : false,
            }

            // Remove deviceId if it was specified - let browser choose
            if (fallbackConstraints.audio && typeof fallbackConstraints.audio === 'object' && 'deviceId' in fallbackConstraints.audio) {
                fallbackConstraints.audio = true
            }
            if (fallbackConstraints.video && typeof fallbackConstraints.video === 'object' && 'deviceId' in fallbackConstraints.video) {
                fallbackConstraints.video = true
            }

            if (fallbackConstraints.audio || fallbackConstraints.video) {
                logger.debug(`[media] retrying getUserMedia with browser default:`, fallbackConstraints)
                try {
                    localStream = await navigator.mediaDevices.getUserMedia(fallbackConstraints)
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
                } catch (fallbackError) {
                    logger.error(`[media] getUserMedia fallback also failed: ${fallbackError}`)

                    // Check if no devices are available - use fake stream as last resort
                    const hasNoDevices = (!$s.devices.cam.options.length && selectedVideoDevice) ||
                                        (!$s.devices.mic.options.length && selectedAudioDevice)

                    if (hasNoDevices && (selectedVideoDevice || selectedAudioDevice)) {
                        logger.info(`[media] No devices available, creating fake stream as fallback`)
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
                                } catch (micError) {
                                    logger.debug(`[media] Could not get microphone access: ${micError}`)
                                }
                            }

                            localStream = createFakeStream({
                                video: !!selectedVideoDevice,
                                audio: !!selectedAudioDevice,
                                width,
                                height,
                                microphoneStream: microphoneStream || undefined,
                            })

                            notifier.notify({
                                level: 'info',
                                message: microphoneStream ? 'No camera available. Using test pattern with microphone input.' : 'No devices available. Using test pattern stream.',
                            })
                        } catch (fakeError) {
                            logger.error(`[media] Failed to create fake stream: ${fakeError}`)
                            notifier.notify({level: 'error', message: `Failed to access media: ${fallbackError}`})
                            $s.mediaReady = true
                            return
                        }
                    } else {
                        notifier.notify({level: 'error', message: `Failed to access media: ${fallbackError}`})
                        $s.mediaReady = true
                        return
                    }
                }
            } else {
                // Both disabled, can't fallback
                logger.error(`[media] both devices disabled, cannot fallback`)
                notifier.notify({level: 'error', message: String(error)})
                $s.mediaReady = true
                return
            }
        } else {
            // Other errors (permission denied, etc.) - check if we should use fake stream
            const hasNoDevices = (!$s.devices.cam.options.length && selectedVideoDevice) ||
                                (!$s.devices.mic.options.length && selectedAudioDevice)

            if (hasNoDevices && (selectedVideoDevice || selectedAudioDevice)) {
                logger.info(`[media] No devices available (${error.name}), creating fake stream as fallback`)
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
                        } catch (micError) {
                            logger.debug(`[media] Could not get microphone access: ${micError}`)
                        }
                    }

                    localStream = createFakeStream({
                        video: !!selectedVideoDevice,
                        audio: !!selectedAudioDevice,
                        width,
                        height,
                        microphoneStream: microphoneStream || undefined,
                    })

                    notifier.notify({
                        level: 'info',
                        message: microphoneStream ? 'No camera available. Using test pattern with microphone input.' : 'No devices available. Using test pattern stream.',
                    })
                } catch (fakeError) {
                    logger.error(`[media] Failed to create fake stream: ${fakeError}`)
                    notifier.notify({level: 'error', message: String(error)})
                    $s.mediaReady = true
                    return
                }
            } else {
                notifier.notify({level: 'error', message: String(error)})
                $s.mediaReady = true
                return
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

    $s.mediaReady = true
    logger.debug(`[media] getUserMedia complete, mediaReady=true`)
    return localStream
}

export async function queryDevices() {
    logger.info('querying for devices')
    // The device labels stay empty when there is no media permission.
    let devices
    if ($s.env.isFirefox) {
        // The device labels are only available in Firefox while a stream is active.
        const stream = await navigator.mediaDevices.getUserMedia({audio: true, video: true})
        devices = await navigator.mediaDevices.enumerateDevices()
        for (const track of stream.getTracks()) {
            track.stop()
        }
    } else {
        devices = await navigator.mediaDevices.enumerateDevices()
    }

    const labelnr = {audio: 1, cam: 1, mic: 1}
    const added = []

    $s.devices.mic.options = []
    $s.devices.cam.options = []
    $s.devices.audio.options = []

    for (const device of devices) {
        // The same device may end up in the queryList multiple times;
        // Don't add it twice to the options list.
        if (added.includes(device.deviceId)) {
            continue
        }
        let name = device.label

        if (device.kind === 'videoinput') {
            if (!name) name = `Camera ${labelnr.cam}`
            $s.devices.cam.options.push({id: device.deviceId ? device.deviceId : name, name})
            labelnr.cam++
        } else if (device.kind === 'audioinput') {
            if (!name) name = `Microphone ${labelnr.mic}`
            $s.devices.mic.options.push({id: device.deviceId ? device.deviceId : name, name})
            labelnr.mic++
        } else if (device.kind === 'audiooutput') {
            // Firefox doesn't support audio output enumeration and setSinkid
            if (!name) name = `Output ${labelnr.audio}`
            $s.devices.audio.options.push({id: device.deviceId ? device.deviceId : name, name})
            labelnr.audio++
        }

        added.push(device.deviceId)
    }

    logger.debug(`device list updated`)
}

export function removeLocalStream() {
    if (localStream) {
        localStream.getTracks().forEach(track => {
            logger.debug(`stopping track ${track.id}`)
            track.stop()
        })
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

export function setDefaultDevice(useFirstAvailable = true) {
    const invalidDevices = validateDevices()
    const emptyOption = {id: null, name: ''}
    for (const key of Object.keys($s.devices)) {
        if (key === 'audio' && $s.env.isFirefox) continue

        if (invalidDevices[key] || $s.devices[key].selected.id === null) {
            if (useFirstAvailable && $s.devices[key].options.length) {
                $s.devices[key].selected = $s.devices[key].options[0]
            } else {
                $s.devices[key].selected = emptyOption
            }
        }
    }
}

export function setScreenStream(stream) {
    screenStream = stream
}

export function validateDevices() {
    const devices = $s.devices
    return {
        audio: !$s.env.isFirefox && (!devices.audio.options.length || !devices.audio.options.find((i) => i.id === devices.audio.selected.id)),
        cam: !devices.cam.options.length || !devices.cam.options.find((i) => i.id === devices.cam.selected.id),
        mic: !devices.mic.options.length || !devices.mic.options.find((i) => i.id === devices.mic.selected.id),
    }
}

navigator.mediaDevices.ondevicechange = async() => {
    const oldDevices = JSON.parse(JSON.stringify($s.devices))
    await queryDevices()
    let added = [], removed = []
    for (const deviceType of Object.keys($s.devices)) {
        const _added = $s.devices[deviceType].options.filter((i) => !oldDevices[deviceType].options.find((j) => i.id === j.id))
        const _removed = oldDevices[deviceType].options.filter((i) => !$s.devices[deviceType].options.find((j) => i.id === j.id))
        if (_added.length) added = added.concat(_added)
        if (_removed.length) removed = removed.concat(_removed)
    }

    if (added.length) {
        notifier.notify({
            icon: 'Headset',
            level: 'info',
            list: added.map((i) => i.name),
            message: $t('device.added', {count: added.length}),
        })
    }
    if (removed.length) {
        notifier.notify({
            icon: 'Headset',
            level: 'warning',
            list: removed.map((i) => i.name),
            message: $t('device.removed', {count: removed.length}),
        })
    }
    const invalidDevices = validateDevices()

    if ($s.sfu.channel.connected && Object.values(invalidDevices).some((i) => i)) {
        // Note: Routing should be handled by the component, not here
        notifier.notify({
            icon: 'Headset',
            level: 'warning',
            list: Object.entries(invalidDevices)
                .filter(([_, value]) => value)
                .map(([key]) => $t(`device.select_${key}_label`)),
            message: $t('device.action_required', {count: removed.length}),
        })
        // Don't set a default option; it must be clear that an
        // invalid device option is set while being connected.
        setDefaultDevice(false)
    } else {
        setDefaultDevice(true)
    }

}
