import {$s} from '@/app'
import {logger, notifier, $t} from '@garage44/common/app'
import * as sfu from './sfu/sfu.ts'

export let localStream
export let screenStream

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
                    notifier.notify({level: 'error', message: `Failed to access media: ${fallbackError}`})
                    $s.mediaReady = true
                    return
                }
            } else {
                // Both disabled, can't fallback
                logger.error(`[media] both devices disabled, cannot fallback`)
                notifier.notify({level: 'error', message: String(error)})
                $s.mediaReady = true
                return
            }
        } else {
            // Other errors (permission denied, etc.)
            notifier.notify({level: 'error', message: String(error)})
            $s.mediaReady = true
            return
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
    localStream.getTracks().forEach(track => {
        logger.debug(`stopping track ${track.id}`)
        track.stop()
    })

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
