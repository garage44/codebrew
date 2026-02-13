import type {Signal} from '@preact/signals'

import {api, notifier, store} from '@garage44/common/app'
import {Button, FieldSelect, FieldText} from '@garage44/common/components'
import {createValidator, required} from '@garage44/common/lib/validation'
import {$t} from '@garage44/expressio'
import {useEffect} from 'preact/hooks'

import {$s, i18n} from '@/app'
import {WorkspaceSelector} from '@/components/elements'
import {loadConfig} from '@/lib/config'

export function Config() {
    const {errors, isValid, validation} = createValidator({
        language_ui: [$s.language_ui.$selection, required('UI language is required')],
        ...Object.fromEntries(
            Object.values($s.enola.engines).flatMap((engine) => {
                const engineConfig = engine as {
                    $api_key?: unknown
                    $base_url?: unknown
                    api_key: string
                    base_url?: string
                    name: string
                }
                const apiKeySignal = engineConfig.$api_key || engineConfig.api_key
                const validations = [
                    [`${engineConfig.name}_key`, [apiKeySignal, required(`${engineConfig.name} API key is required`)]],
                ]

                if ('base_url' in engineConfig && engineConfig.base_url !== undefined) {
                    const baseUrlSignal = engineConfig.$base_url || engineConfig.base_url
                    validations.push([
                        `${engineConfig.name}_base_url`,
                        [baseUrlSignal, required(`${engineConfig.name} base URL is required`)],
                    ])
                }

                return validations
            }),
        ),
    })

    useEffect(() => {
        ;(async () => {
            await loadConfig()
        })()
    }, [])

    return (
        <div class='c-config view'>
            <FieldSelect
                help={$t(i18n.config.help.ui_language)}
                label={$t(i18n.config.label.ui_language)}
                model={$s.language_ui.$selection}
                options={$s.language_ui.options}
                placeholder={$t(i18n.config.placeholder.ui_language)}
                validation={validation?.value.language_ui}
            />

            <WorkspaceSelector workspaces={$s.workspaces} />

            <div className='translators'>
                {Object.values($s.enola.engines).map((engine) => {
                    const engineConfig = engine as {
                        $api_key?: unknown
                        $base_url?: unknown
                        api_key: string
                        base_url?: string
                        name: string
                    }
                    const apiKeySignal = (engineConfig.$api_key || engineConfig.api_key) as Signal<string>
                    return (
                        <div class='section'>
                            {/* $t('config.help.anthropic_base_url') */}
                            {/* $t('config.help.anthropic_key') */}
                            {/* $t('config.help.deepl_base_url') */}
                            {/* $t('config.help.deepl_key') */}
                            {/* $t('config.label.anthropic_base_url') */}
                            {/* $t('config.label.anthropic_key') */}
                            {/* $t('config.label.deepl_key') */}
                            {/* $t('config.label.deepl_base_url') */}
                            <FieldText
                                copyable={true}
                                help={$t(i18n.config.help[`${engineConfig.name}_key` as keyof typeof i18n.config.help])}
                                label={$t(i18n.config.label[`${engineConfig.name}_key` as keyof typeof i18n.config.label])}
                                model={apiKeySignal}
                                type='password'
                                validation={validation?.value[`${engineConfig.name}_key`]}
                            />

                            {'base_url' in engineConfig && engineConfig.base_url !== undefined && (
                                <FieldText
                                    help={$t(i18n.config.help[`${engineConfig.name}_base_url` as keyof typeof i18n.config.help])}
                                    label={$t(
                                        i18n.config.label[`${engineConfig.name}_base_url` as keyof typeof i18n.config.label],
                                    )}
                                    model={(engineConfig.$base_url || engineConfig.base_url) as Signal<string>}
                                    validation={validation?.value[`${engineConfig.name}_base_url`]}
                                />
                            )}
                        </div>
                    )
                })}
            </div>

            <Button
                disabled={!isValid?.value}
                label={$t(i18n.config.label.update_config)}
                onClick={async () => {
                    store.save()
                    await api.post('/api/config', {
                        enola: $s.enola,
                        language_ui: $s.language_ui.selection,
                        workspaces: $s.workspaces,
                    })

                    await loadConfig()
                    notifier.notify({message: $t(i18n.notifications.config_updated), type: 'info'})
                }}
                tip={errors?.value}
                type='info'
            />
        </div>
    )
}
