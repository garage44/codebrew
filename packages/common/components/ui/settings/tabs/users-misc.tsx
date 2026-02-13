import {FieldCheckbox, FieldText} from '@/components'

export interface UsersMiscTabProps {
    /**
     * User object from state
     */
    user?: {
        name?: string
        password?: string
        admin?: boolean
    }
    /**
     * Function to update user name
     */
    onNameChange?: (value: string) => void
    /**
     * Function to update user password
     */
    onPasswordChange?: (value: string) => void
    /**
     * Function to update admin status
     */
    onAdminChange?: (value: boolean) => void
    /**
     * Translation function
     */
    $t?: (key: string) => string
}

/**
 * User Misc Settings Tab Component
 * Contains username, password, and admin checkbox
 */
export function UsersMisc({user, onNameChange, onPasswordChange, onAdminChange, $t = (key: string) => key}: UsersMiscTabProps) {
    return (
        <section class='c-settings-tab-users-misc tab-content active'>
            <FieldText
                value={user?.name || ''}
                onChange={(value) => onNameChange?.(value)}
                label={$t('user.settings.misc.username_label')}
                placeholder='...'
            />
            <FieldText
                value={user?.password || ''}
                onChange={(value) => onPasswordChange?.(value)}
                label={$t('user.settings.misc.password_label')}
                placeholder='...'
                type='password'
            />
            <FieldCheckbox
                value={user?.admin || false}
                onChange={(value) => onAdminChange?.(value)}
                help={$t('user.settings.misc.role_admin_help')}
                label={$t('user.settings.misc.role_admin_label')}
            />
        </section>
    )
}
