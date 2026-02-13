import {$t, logger, store} from '@garage44/common/app'
import {FieldSelect, Icon, SoundMeter as Soundmeter} from '@garage44/common/components'
import {type Signal, effect, signal} from '@preact/signals'
import {useEffect, useRef, useState} from 'preact/hooks'

import {$s} from '@/app'
import {Stream} from '@/components/stream/stream'
import Sound from '@/lib/sound'
import {getUserMedia, localStream, queryDevices} from '@/models/media'
import * as sfu from '@/models/sfu/sfu'

/**
 * Device Settings Component for PanelContext Quick Access
 * Contains only device selection (cam, mic, audio) - no media settings
 */
export function DeviceSettings(): JSX.Element {
    const [description, setDescription] = useState<{
        direction: 'up'
        hasAudio: boolean
        hasVideo: boolean
        id: string
        kind: 'video'
        mirror: boolean
        src: MediaStream
        volume: {locked: boolean; value: number}
    } | null>(null)
    const [stream, setStream] = useState<MediaStream | null>(null)
    const [streamId, setStreamId] = useState<string | null>(null)
    const [soundAudio, setSoundAudio] = useState<Sound | null>(null)

    // Create writable signals for device IDs that sync with DeepSignal
    const camIdSignalRef = useRef<ReturnType<typeof signal<string>>>(signal(''))
    const micIdSignalRef = useRef<ReturnType<typeof signal<string>>>(signal(''))
    const audioIdSignalRef = useRef<ReturnType<typeof signal<string>>>(signal(''))

    useEffect((): (() => void) => {
        const updateCamId = (): void => {
            const {selected} = $s.devices.cam
            const id = typeof selected === 'object' && selected !== null && 'id' in selected ? String(selected.id || '') : ''
            if (camIdSignalRef.current.value !== id) {
                camIdSignalRef.current.value = id
            }
        }
        const updateMicId = (): void => {
            const {selected} = $s.devices.mic
            const id = typeof selected === 'object' && selected !== null && 'id' in selected ? String(selected.id || '') : ''
            if (micIdSignalRef.current.value !== id) {
                micIdSignalRef.current.value = id
                logger.debug(`[DeviceSettings] Updated mic signal to: ${id}`)
            }
        }
        const updateAudioId = (): void => {
            const {selected} = $s.devices.audio
            const id = typeof selected === 'object' && selected !== null && 'id' in selected ? String(selected.id || '') : ''
            if (audioIdSignalRef.current.value !== id) {
                audioIdSignalRef.current.value = id
            }
        }

        // Initial sync - read current values immediately
        updateCamId()
        updateMicId()
        updateAudioId()

        // Watch for changes
        const unsubscribeCam = effect((): void => {
            updateCamId()
        })
        const unsubscribeMic = effect((): void => {
            updateMicId()
        })
        const unsubscribeAudio = effect((): void => {
            updateAudioId()
        })

        return (): void => {
            unsubscribeCam()
            unsubscribeMic()
            unsubscribeAudio()
        }
    }, [])

    const remountStream = async (): Promise<void> => {
        try {
            const newStream = await getUserMedia($s.devices)
            if (newStream) {
                setStream(newStream)
                setStreamId(newStream.id)
                setDescription(null)

                // Give the stream time to unmount first...
                await new Promise<void>((resolve): void => {
                    setTimeout(resolve, 0)
                })

                setDescription({
                    direction: 'up',
                    hasAudio: $s.devices.mic.enabled,
                    hasVideo: $s.devices.cam.enabled,
                    id: newStream.id,
                    kind: 'video',
                    mirror: false,
                    src: newStream,
                    volume: {
                        locked: false,
                        value: 100,
                    },
                })
            }
        } catch (error) {
            logger.error(`[DeviceSettings] Failed to remount stream: ${error}`)
        }
    }

    const testSoundAudio = async (): Promise<void> => {
        if (!soundAudio) {
            return
        }

        // Stop if already playing
        if (soundAudio.description.playing) {
            soundAudio.stop()
            return
        }

        try {
            const sinkId = $s.devices.audio.selected.id || null
            await soundAudio.play({sink: sinkId})

            // Update playing state when sound ends
            const checkPlaying = (): void => {
                if (soundAudio && soundAudio.description.playing) {
                    requestAnimationFrame(checkPlaying)
                }
            }
            checkPlaying()
        } catch (error) {
            logger.error(`[DeviceSettings] Failed to play test sound: ${error}`)
        }
    }

    // Initial mount
    useEffect((): (() => void) => {
        const init = async (): Promise<void> => {
            try {
                await queryDevices()

                /*
                 * After queryDevices completes, ensure signals are synced with restored state
                 * This handles the case where restoration happened during queryDevices
                 */
                const micSelected = $s.devices.mic.selected
                const micId =
                    typeof micSelected === 'object' && micSelected !== null && 'id' in micSelected
                        ? String(micSelected.id || '')
                        : ''
                if (micIdSignalRef.current.value !== micId) {
                    micIdSignalRef.current.value = micId
                    logger.debug(`[DeviceSettings] Synced mic signal after queryDevices: ${micId}`)
                }
            } catch (error) {
                logger.error(`[DeviceSettings] Failed to query devices: ${error}`)
                // Continue anyway - fake stream option will be available
            }
            setSoundAudio(new Sound({file: '/audio/power-on.ogg', playing: false}))

            // Only use existing stream if available
            const currentStream = localStream
            if (currentStream && !$s.sfu.channel.connected) {
                setStream(currentStream)
                setStreamId(currentStream.id)
                setDescription({
                    direction: 'up',
                    hasAudio: $s.devices.mic.enabled,
                    hasVideo: $s.devices.cam.enabled,
                    id: currentStream.id,
                    kind: 'video',
                    mirror: false,
                    src: currentStream,
                    volume: {
                        locked: false,
                        value: 100,
                    },
                })
            }
        }

        init()

        return (): void => {
            if (!$s.sfu.channel.connected) {
                sfu.delLocalMedia()
            }
        }
    }, [])

    // Watch for device changes
    useEffect((): void => {
        remountStream()
    }, [])

    return (
        <div className='c-device-settings'>
            <div className='c-device-settings__section'>
                <h3 className='c-device-settings__title'>Camera</h3>
                <FieldSelect
                    help={$t('device.select_cam_help')}
                    label={$t('device.select_cam_label')}
                    model={camIdSignalRef.current as Signal<string>}
                    onChange={(value): void => {
                        const selectedOption = Array.isArray($s.devices.cam.options)
                            ? $s.devices.cam.options.find((opt: {id: string; name: string}): boolean => opt.id === value)
                            : null
                        if (selectedOption) {
                            $s.devices.cam.selected = selectedOption
                            store.save()
                        }
                    }}
                    options={
                        Array.isArray($s.devices.cam.options) ? ($s.devices.cam.options as {id: string; name: string}[]) : []
                    }
                />
                {description && (
                    <Stream
                        controls={false}
                        modelValue={{
                            hasAudio: description.hasAudio,
                            id: description.id,
                            src: description.src instanceof MediaStream ? description.src : String(description.src),
                        }}
                    />
                )}
                {!description && (
                    <div className='c-device-settings__placeholder'>
                        <Icon name='webcam' />
                    </div>
                )}
            </div>

            <div className='c-device-settings__section'>
                <h3 className='c-device-settings__title'>Microphone</h3>
                <p className='c-device-settings__help c-device-settings__section-intro'>
                    Select a microphone input device. The sound meter below shows audio input levels.
                </p>
                <FieldSelect
                    help='Select which microphone should capture audio input'
                    label='Microphone Input Device'
                    model={micIdSignalRef.current as Signal<string>}
                    onChange={(value): void => {
                        const selectedOption = Array.isArray($s.devices.mic.options)
                            ? $s.devices.mic.options.find((opt: {id: string; name: string}): boolean => opt.id === value)
                            : null
                        if (selectedOption) {
                            $s.devices.mic.selected = selectedOption
                            store.save()
                        }
                    }}
                    options={
                        Array.isArray($s.devices.mic.options) ? ($s.devices.mic.options as {id: string; name: string}[]) : []
                    }
                />
                {streamId && stream && <Soundmeter stream={stream} streamId={streamId} />}
            </div>

            <div className='c-device-settings__section'>
                <h3 className='c-device-settings__title'>Audio Output</h3>
                <p className='c-device-settings__help c-device-settings__section-intro'>
                    Select an audio output device (speaker/headphones) to test where sound will play.
                </p>
                {Array.isArray($s.devices.audio.options) && $s.devices.audio.options.length > 0 && !$s.env.isFirefox && (
                    <FieldSelect
                        help='Select which audio output device (speaker/headphones) should play sound'
                        label='Audio Output Device'
                        model={audioIdSignalRef.current as Signal<string>}
                        onChange={(value): void => {
                            const selectedOption = Array.isArray($s.devices.audio.options)
                                ? $s.devices.audio.options.find((opt: {id: string; name: string}): boolean => opt.id === value)
                                : null
                            if (selectedOption) {
                                $s.devices.audio.selected = selectedOption
                                store.save()
                            }
                        }}
                        options={$s.devices.audio.options as {id: string; name: string}[]}
                    />
                )}

                {($s.env.isFirefox || !Array.isArray($s.devices.audio.options) || $s.devices.audio.options.length === 0) && (
                    <div className='c-device-settings__audio-test'>
                        <label htmlFor='test-audio-output-btn'>Test Audio Output</label>
                        <button
                            className='btn'
                            disabled={!soundAudio}
                            id='test-audio-output-btn'
                            type='button'
                            onClick={testSoundAudio}
                        >
                            <Icon className='icon-d' name={soundAudio?.description.playing ? 'pause' : 'play'} />
                        </button>
                        <p className='c-device-settings__help'>
                            Click play to test which audio output device (speaker/headphones) plays sound.
                            {!Array.isArray($s.devices.audio.options) || $s.devices.audio.options.length === 0
                                ? ' Audio output device selection is not available in this browser.'
                                : ''}
                        </p>
                    </div>
                )}
            </div>
        </div>
    )
}
