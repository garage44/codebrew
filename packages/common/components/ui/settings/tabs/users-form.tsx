import {useEffect} from 'preact/hooks'
import {route} from 'preact-router'
import {FieldText, FieldCheckbox, Button} from '@/components'
import {useCollectionManager} from '@/lib/collection-manager'
import {api} from '@/app'
import type {User} from './users-management'

export interface UsersFormProps {
    /**
     * Translation function
     */
    $t?: (key: string) => string
    /**
     * User ID for editing (undefined for creating new)
     */
    userId?: string
}

/**
 * Users Form Component - Create or edit a user
 */
export function UsersForm({
    $t = (key: string) => key,
    userId,
}: UsersFormProps) {
    const manager = useCollectionManager<User, {username: string; password: string; admin: boolean}>({
        listEndpoint: '/api/users',
        createEndpoint: (data) => `/api/users/${data.username}`,
        updateEndpoint: (id) => `/api/users/${id}`,
        updateMethod: 'POST',
        deleteEndpoint: (id) => `/api/users/${id}/delete`,
        getId: (user) => user.id,
        initialFormData: {username: '', password: '', admin: false},
        transformCreateData: (data) => ({
            username: data.username,
            password: data.password ? {
                key: data.password,
                type: 'plaintext',
            } : undefined,
            permissions: {
                admin: data.admin,
            },
            profile: {
                displayName: '',
            },
        }),
        transformUpdateData: (data) => ({
            username: data.username,
            ...(data.password && data.password.trim() !== '' ? {
                password: {
                    key: data.password,
                    type: 'plaintext',
                },
            } : {}),
            permissions: {
                admin: data.admin,
            },
        }),
        populateFormData: (user) => ({
            username: user.username,
            password: '', // Don't show actual password
            admin: user.permissions?.admin || false,
        }),
        messages: {
            loadFailed: $t('user.management.error.load_failed') || 'Failed to load users',
            createSuccess: $t('user.management.success.created') || 'User created',
            createFailed: $t('user.management.error.create_failed') || 'Failed to create user',
            updateSuccess: $t('user.management.success.updated') || 'User updated',
            updateFailed: $t('user.management.error.save_failed') || 'Failed to update user',
            deleteSuccess: $t('user.management.success.deleted') || 'User deleted',
            deleteFailed: $t('user.management.error.delete_failed') || 'Failed to delete user',
        },
    })

    const isEditing = !!userId

    useEffect(() => {
        if (isEditing && userId) {
            // Load the specific user for editing
            api.get(`/api/users/${encodeURIComponent(userId)}`).then((user: unknown) => {
                manager.startEdit(user as User)
            }).catch(() => {
                // User not found, redirect back to list
                route('/settings/users')
            })
        } else {
            // For creating, just load the list to ensure we have the latest data
            manager.loadItems()
        }
    }, [userId])

    const handleSubmit = async() => {
        if (!manager.state.formData.username) {
            return
        }

        try {
            if (isEditing && userId) {
                await manager.updateItem(userId)
            } else {
                await manager.createItem()
            }
            route('/settings/users')
        } catch {
            // Error already handled by manager
        }
    }

    const handleCancel = () => {
        route('/settings/users')
    }

    if (isEditing && !manager.state.formData.username) {
        return (
            <section class="c-users-form">
                <div>Loading user...</div>
            </section>
        )
    }

    return (
        <section class="c-users-form">
            <div class="header">
                <h2>{isEditing ? ($t('user.management.action.edit') || 'Edit User') : ($t('user.management.action.add_user') || 'Add User')}</h2>
            </div>

            <div class="form">
                <FieldText
                    model={manager.state.formData.$username}
                    label={$t('user.management.field.username') || 'Username'}
                    placeholder={$t('user.management.placeholder.username') || 'Enter username'}
                    disabled={isEditing}
                />
                <FieldText
                    model={manager.state.formData.$password}
                    label={$t('user.management.field.password') || 'Password'}
                    type="password"
                    placeholder={isEditing
                        ? ($t('user.management.placeholder.password_optional') || 'Leave empty to keep current password')
                        : ($t('user.management.placeholder.password') || 'Enter password')
                    }
                />
                <FieldCheckbox
                    model={manager.state.formData.$admin}
                    label={$t('user.management.field.admin') || 'Admin'}
                    help={$t('user.management.field.admin_help') || 'Grant administrator privileges'}
                />
                <div class="actions">
                    <Button
                        icon="save"
                        label={isEditing ? ($t('user.management.action.save') || 'Save') : ($t('user.management.action.create') || 'Create')}
                        onClick={handleSubmit}
                        type="success"
                    />
                    <Button
                        icon="close"
                        label={$t('user.management.action.cancel') || 'Cancel'}
                        onClick={handleCancel}
                        type="default"
                    />
                </div>
            </div>
        </section>
    )
}
