import {$s, i18n} from '@/app'
import {api, notifier, store} from '@garage44/common/app'
import {$t} from '@garage44/expressio'
import {Button, FieldCheckbox, FieldSelect, FieldText} from '@garage44/common/components'
import {createValidator, required} from '@garage44/common/lib/validation'
import classnames from 'classnames'
import {deepSignal} from 'deepsignal'
import {useEffect} from 'preact/hooks'

const state = deepSignal({
    formality: [
        {id: 'less', name: 'Less formal'},
        {id: 'more', name: 'More formal'},
    ],
    target_languages: [],
})

export function WorkspaceSettings() {
    useEffect(() => {
        if (!$s.workspace) {
            return
        }
        state.target_languages.splice(0, state.target_languages.length, ...$s.enola.languages.target.map((language) => {
            const selected = $s.workspace.config.languages.target.find((i) => i.id === language.id)

            /*
             * formality_supported should be an array of engine names that support formality
             * If language.formality is true, use all available engine names
             * Note: This is a simplification - ideally we'd check which specific engines support formality for each language
             */
            const availableEngineNames = Object.values($s.enola.engines).map((engine) => {
                const engineConfig = engine as {name: string}
                return engineConfig.name
            })
            const formalitySupported = language.formality ? availableEngineNames : []
            return {
                engine: selected ? selected.engine : '',
                engines: availableEngineNames,
                formality: selected ? selected.formality : 'less',
                formality_supported: formalitySupported,
                id: language.id,
                name: language.name,
                selected: !!selected,
                transcription: null,
            }
        }))
    }, [])

    if (!$s.workspace) {
        return null
    }
    // Updated validator usage
    const {errors, isValid, validation} = createValidator({
        source: [
            $s.workspace.config.languages.$source,
            required('Source language is required'),
        ],
        ...Object.fromEntries(state.target_languages.flatMap((language) => [
            [`target_${language.id}_engine`, [
                language.$engine,
                {
                    message: `Translation engine required for ${language.name}`,
                    test: (v) => !language.selected || (language.selected && !!v),
                },
            ]],
            [`target_${language.id}_formality`, [
                language.$formality,
                {
                    message: `Formality setting required for ${language.name}`,
                    test: (v) => !language.selected ||
                        !language.formality_supported.includes(language.engine) ||
                        (language.selected && language.formality_supported.includes(language.engine) && !!v),
                },
            ]],
        ])),
    })

    return (
        <div class='c-workspace-settings view'>
            {/* Language Configuration */}
            <div class='section'>
                <div class='section-title'>Languages</div>
                <div class='section-content'>
                    <FieldSelect
                        help={$t(i18n.settings.help.source_language)}
                        label={$t(i18n.settings.label.source_language)}
                        model={$s.workspace.config.languages.$source}
                        options={$s.enola.languages.source}
                        placeholder={`${$t(i18n.settings.placeholder.source_language)}...`}
                        validation={validation.value.source}
                    />

                    <div class='languages'>
                        <div class='label'>
                            {$t(i18n.settings.label.target_languages)}
                        </div>
                        <div className='options'>
                            {state.target_languages
                                .toSorted((a, b) => a.name.localeCompare(b.name))
                                .map((language) => {
                                    return (
                                        <div
                                            class={classnames('option', {
                                                'is-invalid':
                                                    !validation.value[`target_${language.id}_engine`].isValid ||
                                                    !validation.value[`target_${language.id}_formality`].isValid,
                                                'is-touched':
                                                    validation.value[`target_${language.id}_engine`].isTouched ||
                                                    validation.value[`target_${language.id}_formality`].isTouched,
                                            })}
                                            key={language.id}
                                        >
                                            <div class='field-wrapper'>
                                                <FieldCheckbox
                                                    label={language.name}
                                                    model={language.$selected}
                                                    onInput={(value) => {
                                                        if (!value) {
                                                            language.$engine.value = ''
                                                        }
                                                    }}
                                                />
                                                <FieldSelect
                                                    disabled={!language.selected}
                                                    model={language.$engine}
                                                    options={Object.values($s.enola.engines).map((engine) => ({
                                                        id: engine.name,
                                                        name: engine.name,
                                                    }))}
                                                    placeholder={$t(i18n.settings.placeholder.translation)}
                                                />
                                            </div>
                                            {language.formality_supported.includes(language.engine) &&
                                                <div class='language-options'>
                                                    <FieldSelect
                                                        disabled={!language.selected}
                                                        label={$t(i18n.settings.label.formality)}
                                                        model={language.$formality}
                                                        options={state.formality}
                                                        placeholder={$t(i18n.settings.placeholder.formality)}
                                                    />
                                                </div>}
                                            {(!validation.value[`target_${language.id}_engine`].isValid ||
                                                !validation.value[`target_${language.id}_formality`].isValid) &&
                                                <div class='validation'>
                                                    {validation.value[`target_${language.id}_engine`].errors.join(', ')}
                                                    {validation.value[`target_${language.id}_formality`].errors.join(', ')}
                                                </div>}
                                        </div>
                                    )
                                })}
                        </div>
                        <div class='help'>
                            {$t(i18n.settings.help.target_languages)}
                        </div>
                    </div>
                </div>
            </div>

            {/* Workspace Sync */}
            <div class='section'>
                <div class='section-title'>Workspace Sync</div>
                <div class='section-content sync-settings'>
                    <FieldCheckbox
                        help={$t(i18n.settings.help.sync_enabled)}
                        label={$t(i18n.settings.label.sync_enabled)}
                        model={$s.workspace.config.sync.$enabled}
                    />
                    {$s.workspace.config.sync.enabled &&
                        <>
                            <FieldText
                                help={$t(i18n.settings.help.sync_dir)}
                                label={$t(i18n.settings.label.sync_dir)}
                                model={$s.workspace.config.sync.$dir}
                            />
                            <FieldCheckbox
                                help={$t(i18n.settings.help.sync_suggestions)}
                                label={$t(i18n.settings.label.sync_suggestions)}
                                model={$s.workspace.config.sync.$suggestions}
                            />
                        </>}
                </div>
            </div>

            {/* Actions */}
            <div class='actions'>
                <Button
                    disabled={!isValid.value}
                    label={$t(i18n.settings.label.update_settings)}
                    onClick={async() => {
                        if (!isValid.value) {
                            notifier.notify({message: 'Please fix validation errors', type: 'error'})
                            return
                        }
                        store.save()
                        const selectedLanguages = state.target_languages
                            .filter((language) => language.selected)
                            .map((language) => {
                                return {
                                    engine: language.engine,
                                    formality: language.formality,
                                    id: language.id,
                                }
                            })
                        // Merge the selected languages state back to the workspace config.
                        $s.workspace.config.languages.target.splice(
                            0,
                            $s.workspace.config.languages.target.length,
                            ...selectedLanguages,
                        )
                        await api.post(`/api/workspaces/${$s.workspace.config.workspace_id}`, {
                            workspace: $s.workspace,
                        })
                        notifier.notify({message: $t(i18n.notifications.settings_updated), type: 'info'})
                    }}
                    tip={errors.value}
                    type='info'
                />
            </div>
        </div>
    )
}
