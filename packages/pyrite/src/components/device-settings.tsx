import {FieldSelect, Icon, SoundMeter as Soundmeter} from '@garage44/common/components'
import Sound from '@/lib/sound'
import {Stream} from '@/components/stream/stream'
import {useState, useEffect, useRef} from 'preact/hooks'
import {signal, type Signal} from '@preact/signals'
import {effect} from '@preact/signals'
import {$s} from '@/app'
import {$t} from '@garage44/common/app'
import {getUserMedia, queryDevices, localStream} from '@/models/media'
import * as sfu from '@/models/sfu/sfu'

/**
 * Device Settings Component for PanelContext Quick Access
 * Contains only device selection (cam, mic, audio) - no media settings
 */
export function DeviceSettings() {
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
        const newStream = await getUserMedia($s.sfu.profile)
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
            })
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

        return () => {
            if (!$s.sfu.channel.connected) {
                sfu.delLocalMedia()
            }
        }
    }, [])

    // Watch for device changes
    useEffect(() => {
        remountStream()
    }, [$s.devices.cam.resolution, $s.devices.cam.selected, $s.devices.mic.selected])

    return (
        <div class='c-device-settings'>
            <div class='c-device-settings__section'>
                <h3 class='c-device-settings__title'>Camera</h3>
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
                        }
                    }}
                    options={Array.isArray($s.devices.cam.options) ?
                        $s.devices.cam.options as Array<{id: string; name: string}> :
                            []}
                />
                {description && <Stream
                    controls={false}
                    modelValue={{
                        hasAudio: description.hasAudio,
                        id: description.id,
                        src: description.src instanceof MediaStream ? description.src : String(description.src),
                    }}
                />}
                {!description &&
                    <div class='c-device-settings__placeholder'>
                        <Icon name='webcam' />
                    </div>}
            </div>

            <div class='c-device-settings__section'>
                <h3 class='c-device-settings__title'>Microphone</h3>
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
                        }
                    }}
                    options={Array.isArray($s.devices.mic.options) ?
                        $s.devices.mic.options as Array<{id: string; name: string}> :
                            []}
                />
                {streamId && stream && <Soundmeter stream={stream} streamId={streamId} />}
            </div>

            <div class='c-device-settings__section'>
                <h3 class='c-device-settings__title'>Audio Output</h3>
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
                            }
                        }}
                        options={Array.isArray($s.devices.audio.options) ?
                            $s.devices.audio.options as Array<{id: string; name: string}> :
                                []}
                    />}

                {($s.env.isFirefox || !$s.devices.audio.options.length) &&
                    <div class='c-device-settings__audio-test'>
                        <label>{$t('device.select_audio_label')}</label>
                        <button class='btn' disabled={playing} onClick={testSoundAudio}>
                            <Icon className='icon-d' name='play' />
                        </button>
                        <p class='c-device-settings__help'>{$t('device.select_audio_verify_help')}</p>
                    </div>}
            </div>
        </div>
    )
}
