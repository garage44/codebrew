import {FieldSelect} from '@garage44/common/components'
import {useEffect, useRef} from 'preact/hooks'
import {signal, type Signal} from '@preact/signals'
import {effect} from '@preact/signals'
import {$s} from '@/app'
import {$t} from '@garage44/common/app'

export default function TabMedia() {
    // Create writable signals for media IDs that sync with DeepSignal
    const acceptIdSignalRef = useRef<ReturnType<typeof signal<string>>>(signal(''))
    const resolutionIdSignalRef = useRef<ReturnType<typeof signal<string>>>(signal(''))
    const upstreamIdSignalRef = useRef<ReturnType<typeof signal<string>>>(signal(''))
    
    useEffect(() => {
        const updateAcceptId = () => {
            const accept = $s.media.accept
            const id = typeof accept === 'object' && accept !== null && 'id' in accept ? String(accept.id || '') : ''
            if (acceptIdSignalRef.current.value !== id) {
                acceptIdSignalRef.current.value = id
            }
        }
        const updateResolutionId = () => {
            const resolution = $s.devices.cam.resolution
            const id = typeof resolution === 'object' && resolution !== null && 'id' in resolution ? String(resolution.id || '') : ''
            if (resolutionIdSignalRef.current.value !== id) {
                resolutionIdSignalRef.current.value = id
            }
        }
        const updateUpstreamId = () => {
            const upstream = $s.media.upstream
            const id = typeof upstream === 'object' && upstream !== null && 'id' in upstream ? String(upstream.id || '') : ''
            if (upstreamIdSignalRef.current.value !== id) {
                upstreamIdSignalRef.current.value = id
            }
        }
        
        const unsubscribeAccept = effect(() => {
            updateAcceptId()
        })
        const unsubscribeResolution = effect(() => {
            updateResolutionId()
        })
        const unsubscribeUpstream = effect(() => {
            updateUpstreamId()
        })
        
        return () => {
            unsubscribeAccept()
            unsubscribeResolution()
            unsubscribeUpstream()
        }
    }, [])
    const acceptOptions = [
        {id: 'nothing', name: $t('ui.settings.media.accept.nothing_label')},
        {id: 'audio', name: $t('ui.settings.media.accept.audio_label')},
        {id: 'screenshare', name: $t('ui.settings.media.accept.screenshare_label')},
        {id: 'everything', name: $t('ui.settings.media.accept.everything_label')},
    ]

    const bandwidthOptions = [
        {id: 'lowest', name: $t('ui.settings.media.bandwidth.lowest_label')},
        {id: 'low', name: $t('ui.settings.media.bandwidth.low_label')},
        {id: 'normal', name: $t('ui.settings.media.bandwidth.normal_label')},
        {
            help: $t('ui.settings.media.bandwidth.unlimited_help'),
            id: 'unlimited',
            name: $t('ui.settings.media.bandwidth.unlimited_label'),
        },
    ]

    const resolutionOptions = [
        {id: 'default', name: $t('ui.settings.media.resolution.default_label')},
        {id: '720p', name: $t('ui.settings.media.resolution.720p_label')},
        {
            help: $t('ui.settings.media.resolution.1080p_help'),
            id: '1080p',
            name: $t('ui.settings.media.resolution.1080p_label'),
        },
    ]

    return (
        <section class='c-tab-media'>
            <FieldSelect
                help={$t('ui.settings.media.accept_help')}
                label={$t('ui.settings.media.accept_label')}
                model={acceptIdSignalRef.current as Signal<string>}
                onChange={(value) => {
                    const selectedOption = acceptOptions.find(opt => opt.id === value)
                    if (selectedOption) {
                        $s.media.accept = selectedOption
                    }
                }}
                options={acceptOptions}
            />

            <FieldSelect
                help={$t('ui.settings.media.resolution_help')}
                label={$t('ui.settings.media.resolution_label')}
                model={resolutionIdSignalRef.current as Signal<string>}
                onChange={(value) => {
                    const selectedOption = resolutionOptions.find(opt => opt.id === value)
                    if (selectedOption) {
                        $s.devices.cam.resolution = selectedOption
                    }
                }}
                options={resolutionOptions}
            />

            <FieldSelect
                help={$t('ui.settings.media.bandwidth_help')}
                label={$t('ui.settings.media.bandwidth_label')}
                model={upstreamIdSignalRef.current as Signal<string>}
                onChange={(value) => {
                    const selectedOption = bandwidthOptions.find(opt => opt.id === value)
                    if (selectedOption) {
                        $s.media.upstream = selectedOption
                    }
                }}
                options={bandwidthOptions}
            />
        </section>
    )
}
