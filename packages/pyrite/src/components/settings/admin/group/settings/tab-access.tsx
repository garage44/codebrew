import {FieldCheckbox, FieldNumber} from '@garage44/common/components'
import {$s} from '@/app'
import {$t} from '@garage44/common/app'

export default function TabAccess() {
    return (
        <section class='c-admin-group-tab-access tab-content active'>
            <FieldCheckbox
                help={$t('group.settings.access.public_group_help')}
                label={$t('group.settings.access.public_group_label')}
                onChange={(value) => {
                    const group = $s.admin.group as Record<string, unknown>
                    if (group) group.public = value
                }}
                value={typeof $s.admin.group === 'object' && $s.admin.group !== null && 'public' in $s.admin.group ? Boolean($s.admin.group.public) : false}
            />
            <FieldCheckbox
                help={$t('group.settings.access.guest_login_help')}
                label={$t('group.settings.access.guest_login_label')}
                onChange={(value) => {
                    const group = $s.admin.group as Record<string, unknown>
                    if (group) group['public-access'] = value
                }}
                value={typeof $s.admin.group === 'object' && $s.admin.group !== null && 'public-access' in $s.admin.group ? Boolean($s.admin.group['public-access']) : false}
            />
            {typeof $s.admin.group === 'object' && $s.admin.group !== null && 'public-access' in $s.admin.group && $s.admin.group['public-access'] &&
                <FieldCheckbox
                    help={$t('group.settings.access.anonymous_login_help')}
                    label={$t('group.settings.access.anonymous_login_label')}
                    onChange={(value) => {
                        const group = $s.admin.group as Record<string, unknown>
                        if (group) group['allow-anonymous'] = value
                    }}
                    value={typeof $s.admin.group === 'object' && $s.admin.group !== null && 'allow-anonymous' in $s.admin.group ? Boolean($s.admin.group['allow-anonymous']) : false}
                />}

            <FieldCheckbox
                help={$t('group.settings.access.subgroups_help')}
                label={$t('group.settings.access.subgroups_label')}
                onChange={(value) => {
                    const group = $s.admin.group as Record<string, unknown>
                    if (group) group['allow-subgroups'] = value
                }}
                value={typeof $s.admin.group === 'object' && $s.admin.group !== null && 'allow-subgroups' in $s.admin.group ? Boolean($s.admin.group['allow-subgroups']) : false}
            />

            <FieldCheckbox
                help={$t('group.settings.access.autolock_help')}
                label={$t('group.settings.access.autolock_label')}
                onChange={(value) => {
                    const group = $s.admin.group as Record<string, unknown>
                    if (group) group.autolock = value
                }}
                value={typeof $s.admin.group === 'object' && $s.admin.group !== null && 'autolock' in $s.admin.group ? Boolean($s.admin.group.autolock) : false}
            />

            <FieldCheckbox
                help={$t('group.settings.access.autokick_help')}
                label={$t('group.settings.access.autokick_label')}
                onChange={(value) => {
                    const group = $s.admin.group as Record<string, unknown>
                    if (group) group.autokick = value
                }}
                value={typeof $s.admin.group === 'object' && $s.admin.group !== null && 'autokick' in $s.admin.group ? Boolean($s.admin.group.autokick) : false}
            />

            <FieldNumber
                help={$t('group.settings.access.maxclient_help')}
                label={$t('group.settings.access.maxclient_label')}
                onChange={(value) => {
                    const group = $s.admin.group as Record<string, unknown>
                    if (group) group['max-clients'] = value
                }}
                placeholder='...'
                value={typeof $s.admin.group === 'object' && $s.admin.group !== null && 'max-clients' in $s.admin.group ? Number($s.admin.group['max-clients']) : 0}
            />
        </section>
    )
}
