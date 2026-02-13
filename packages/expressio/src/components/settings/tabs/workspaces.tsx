import {api, notifier, store} from '@garage44/common/app'
import {Button} from '@garage44/common/components'
import {$t} from '@garage44/expressio'
import {useEffect} from 'preact/hooks'

import {$s, i18n} from '@/app'
import {WorkspaceSelector} from '@/components/elements'
import {loadConfig} from '@/lib/config'

export default function TabWorkspaces() {
    useEffect(() => {
        ;(async () => {
            await loadConfig()
        })()
    }, [])

    return (
        <section class='c-settings-tab-workspaces tab-content active'>
            <WorkspaceSelector workspaces={$s.workspaces} />

            <Button
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
                type='info'
            />
        </section>
    )
}
