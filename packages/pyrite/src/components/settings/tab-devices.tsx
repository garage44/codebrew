import {$t, store} from '@garage44/common/app'
import {FieldSelect, Icon, SoundMeter as Soundmeter} from '@garage44/common/components'
import {signal, type Signal} from '@preact/signals'
import {effect} from '@preact/signals'
import {useState, useEffect, useRef} from 'preact/hooks'

import {$s} from '@/app'
import {Stream} from '@/components/stream/stream'
import Sound from '@/lib/sound'
import {getUserMedia, queryDevices, localStream} from '@/models/media'
import * as sfu from '@/models/sfu/sfu'

export default function TabDevices() {
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
    const [playing] = useState(false)

    // Create writable signals for device IDs that sync with DeepSignal
    const camIdSignalRef = useRef<ReturnType<typeof signal<string>>>(signal(''))
    const micIdSignalRef = useRef<ReturnType<typeof signal<string>>>(signal(''))
    const audioIdSignalRef = useRef<ReturnType<typeof signal<string>>>(signal(''))

    useEffect(() => {
        const updateCamId = () => {
            const selected = $s.devices.cam.selected
            const id = typeof selected === 'object' && selected !== null && 'id' in selected ? String(selected.id || '') : ''
            if (camIdSignalRef.current.value !== id) {
                camIdSignalRef.current.value = id
            }
        }
        const updateMicId = () => {
            const selected = $s.devices.mic.selected
            const id = typeof selected === 'object' && selected !== null && 'id' in selected ? String(selected.id || '') : ''
            if (micIdSignalRef.current.value !== id) {
                micIdSignalRef.current.value = id
            }
        }
        const updateAudioId = () => {
            const selected = $s.devices.audio.selected
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
        const unsubscribeCam = effect(() => {
            updateCamId()
        })
        const unsubscribeMic = effect(() => {
            updateMicId()
        })
        const unsubscribeAudio = effect(() => {
            updateAudioId()
        })

        return () => {
            unsubscribeCam()
            unsubscribeMic()
            unsubscribeAudio()
        }
    }, [])

    const remountStream = async() => {
        const newStream = await getUserMedia($s.devices)
        if (newStream) {
            setStream(newStream)
            setStreamId(newStream.id)
            setDescription(null)

            // Give the stream time to unmount first...
            await new Promise((resolve) => setTimeout(resolve, 0))

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
            } as typeof description)
        }
    }

    const testSoundAudio = () => {
        if (soundAudio) {
            soundAudio.play()
        }
    }

    // Initial mount
    useEffect(() => {
        const init = async() => {
            await queryDevices()
            // After queryDevices completes, ensure signals are synced with restored state
            const micSelected = $s.devices.mic.selected
            const micId =
                typeof micSelected === 'object' && micSelected !== null && 'id' in micSelected ? String(micSelected.id || '') : ''
            if (micIdSignalRef.current.value !== micId) {
                micIdSignalRef.current.value = micId
            }
            setSoundAudio(new Sound({file: '/audio/power-on.ogg', playing: false}))

            /*
             * Only use existing stream if available - don't auto-start media
             * Media should only start when user explicitly clicks camera/mic buttons
             * This prevents unwanted getUserMedia calls and permission prompts on page load
             */
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
                } as typeof description)
            }
        }

        init()

        return () => {
            if (!$s.sfu.channel.connected) {
                sfu.delLocalMedia()
            }
        }
    }, [])

    // Watch for device changes
    useEffect(() => {
        remountStream()
    }, [$s.devices.cam.selected])

    return (
        <section class='c-tab-devices tab-content active'>
            <div class='camera-field'>
                <FieldSelect
                    help={$t('device.select_cam_help')}
                    label={$t('device.select_cam_label')}
                    model={camIdSignalRef.current as Signal<string>}
                    onChange={(value) => {
                        const selectedOption = Array.isArray($s.devices.cam.options) ?
                                $s.devices.cam.options.find((opt: {id: string; name: string}) => opt.id === value) :
                            undefined
                        if (selectedOption) {
                            $s.devices.cam.selected = selectedOption
                            store.save()
                        }
                    }}
                    options={
                        Array.isArray($s.devices.cam.options) ? ($s.devices.cam.options as Array<{id: string; name: string}>) : []
                    }
                />

                {description &&
                    <Stream
                        controls={false}
                        modelValue={{
                            hasAudio: description.hasAudio,
                            hasVideo: description.hasVideo,
                            id: description.id,
                            src: description.src,
                        }}
                    />}
                {!description &&
                    <div class='webcam-placeholder'>
                        <Icon name='webcam' />
                    </div>}
            </div>

            <FieldSelect
                help={$t('device.select_mic_verify_help')}
                label={$t('device.select_mic_label')}
                model={micIdSignalRef.current as Signal<string>}
                onChange={(value) => {
                    const selectedOption = Array.isArray($s.devices.mic.options) ?
                            $s.devices.mic.options.find((opt: {id: string; name: string}) => opt.id === value) :
                        undefined
                    if (selectedOption) {
                        $s.devices.mic.selected = selectedOption
                        store.save()
                    }
                }}
                options={
                    Array.isArray($s.devices.mic.options) ? ($s.devices.mic.options as Array<{id: string; name: string}>) : []
                }
            />

            <div class='soundmeter'>{streamId && stream && <Soundmeter stream={stream} streamId={streamId} />}</div>

            <div class='output-config'>
                {/* https://bugzilla.mozilla.org/show_bug.cgi?id=1498512 */}
                {/* https://bugzilla.mozilla.org/show_bug.cgi?id=1152401 */}
                {$s.devices.audio.options.length && !$s.env.isFirefox &&
                    <FieldSelect
                        help={$t('device.select_audio_verify_help')}
                        label={$t('device.select_audio_label')}
                        model={audioIdSignalRef.current as Signal<string>}
                        onChange={(value) => {
                            const selectedOption = Array.isArray($s.devices.audio.options) ?
                                    $s.devices.audio.options.find((opt: {id: string; name: string}) => opt.id === value) :
                                undefined
                            if (selectedOption) {
                                $s.devices.audio.selected = selectedOption
                                store.save()
                            }
                        }}
                        options={
                            Array.isArray($s.devices.audio.options) ?
                                    ($s.devices.audio.options as Array<{id: string; name: string}>) :
                                    []
                        }
                    />}

                {($s.env.isFirefox || !$s.devices.audio.options.length) &&
                    <div class='field'>
                        <div class='label-container'>
                            <label class='field-label'>{$t('device.select_audio_label')}</label>
                            <button class='btn' disabled={playing} onClick={testSoundAudio}>
                                <Icon className='icon-d' name='play' />
                            </button>
                        </div>

                        <div class='help'>{$t('device.select_audio_verify_help')}</div>
                    </div>}
            </div>
        </section>
    )
}
