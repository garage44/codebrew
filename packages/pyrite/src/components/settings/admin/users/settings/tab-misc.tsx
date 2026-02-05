import {FieldCheckbox, FieldText} from '@garage44/common/components'
import {$s} from '@/app'
import {$t} from '@garage44/common/app'

export default function TabMisc() {
    return (
        <section class='c-users-settings-misc tab-content active'>
            <FieldText
                label={$t('user.settings.misc.username_label')}
                onChange={(value) => {
                    const user = $s.admin.user as Record<string, unknown>
                    if (user) user.name = value
                }}
                placeholder='...'
                value={typeof $s.admin.user === 'object' && $s.admin.user !== null &&
                    'name' in $s.admin.user ?
                        String($s.admin.user.name || '') :
                    ''}
            />
            <FieldText
                label={$t('user.settings.misc.password_label')}
                onChange={(value) => {
                    const user = $s.admin.user as Record<string, unknown>
                    if (user) user.password = value
                }}
                placeholder='...'
                value={typeof $s.admin.user === 'object' && $s.admin.user !== null &&
                    'password' in $s.admin.user ?
                        String($s.admin.user.password || '') :
                    ''}
            />
            <FieldCheckbox
                help={$t('user.settings.misc.role_admin_help')}
                label={$t('user.settings.misc.role_admin_label')}
                onChange={(value) => {
                    const user = $s.admin.user as Record<string, unknown>
                    if (user) user.admin = value
                }}
                value={typeof $s.admin.user === 'object' && $s.admin.user !== null &&
                    'admin' in $s.admin.user ?
                        Boolean($s.admin.user.admin) :
                    false}
            />
        </section>
    )
}
