import {useEffect, useRef} from 'preact/hooks'
import {FieldText, FieldCheckbox, Button} from '@/components'
import {api, notifier} from '@/app'
import {deepSignal} from 'deepsignal'

export interface User {
    createdAt?: string
    id: string
    password?: {
        key: string
        type: 'plaintext' | 'bcrypt'
    }
    permissions?: {
        admin?: boolean
    }
    profile?: {
        avatar?: string
        displayName?: string
    }
    updatedAt?: string
    username: string
}

export interface UsersManagementTabProps {
    /**
     * Translation function
     */
    $t?: (key: string) => string
}

/**
 * User Management Settings Tab Component
 * Provides full CRUD functionality for user management with inline editing (matching channels UX)
 */
export function UsersManagement({
    $t = (key: string) => key,
}: UsersManagementTabProps) {
    // Use DeepSignal for component state (per-instance, stable across renders)
    const stateRef = useRef(deepSignal({
        users: [] as User[],
        loading: false,
        editing: null as string | null,
        error: null as string | null,
        formData: {
            username: '',
            password: '',
            admin: false,
        },
    }))
    const state = stateRef.current

    const loadUsers = async () => {
        state.loading = true
        try {
            const users = await api.get('/api/users')
            state.users = Array.isArray(users) ? users : []
        } catch {
            state.error = 'Failed to load users'
            notifier.notify({
                level: 'error',
                message: $t('user.management.error.load_failed') || 'Failed to load users',
                type: 'error',
            })
        } finally {
            state.loading = false
        }
    }

    useEffect(() => {
        loadUsers()
    }, [])

    const handleCreate = async () => {
        if (!state.formData.username) {
            notifier.notify({
                level: 'error',
                message: $t('user.management.error.username_required') || 'Username is required',
                type: 'error',
            })
            return
        }

        try {
            state.loading = true
            const userData: Partial<User> = {
                username: state.formData.username,
                password: state.formData.password ? {
                    key: state.formData.password,
                    type: 'plaintext',
                } : undefined,
                permissions: {
                    admin: state.formData.admin,
                },
                profile: {
                    displayName: '',
                },
            }

            const newUser = (await api.post(`/api/users/${state.formData.username}`, userData)) as User
            state.users = [...state.users, newUser] as User[]
            state.formData = {username: '', password: '', admin: false}
            notifier.notify({
                level: 'success',
                message: $t('user.management.success.created') || 'User created',
                type: 'success',
            })
        } catch (error) {
            const message = error instanceof Error ? error.message : ($t('user.management.error.create_failed') || 'Failed to create user')
            notifier.notify({
                level: 'error',
                message,
                type: 'error',
            })
        } finally {
            state.loading = false
        }
    }

    const handleUpdate = async (userId: string) => {
        if (!state.formData.username) {
            notifier.notify({
                level: 'error',
                message: $t('user.management.error.username_required') || 'Username is required',
                type: 'error',
            })
            return
        }

        try {
            state.loading = true
            const userData: Partial<User> = {
                username: state.formData.username,
                permissions: {
                    admin: state.formData.admin,
                },
            }

            // Only include password if it was provided (not empty)
            if (state.formData.password && state.formData.password.trim() !== '') {
                userData.password = {
                    key: state.formData.password,
                    type: 'plaintext',
                }
            }

            const updatedUser = (await api.post(`/api/users/${userId}`, userData)) as User
            state.users = state.users.map((u) => u.id === userId ? updatedUser : u) as User[]
            state.editing = null
            state.formData = {username: '', password: '', admin: false}
            notifier.notify({
                level: 'success',
                message: $t('user.management.success.updated') || 'User updated',
                type: 'success',
            })
        } catch (error) {
            const message = error instanceof Error ? error.message : ($t('user.management.error.save_failed') || 'Failed to update user')
            notifier.notify({
                level: 'error',
                message,
                type: 'error',
            })
        } finally {
            state.loading = false
        }
    }

    const handleDelete = async (user: User) => {
        if (!confirm(($t('user.management.confirm.delete') || 'Are you sure you want to delete user {username}?').replace('{username}', user.username))) {
            return
        }

        try {
            state.loading = true
            await api.get(`/api/users/${user.id}/delete`)
            state.users = state.users.filter((u) => u.id !== user.id)
            if (state.editing === user.id) {
                state.editing = null
                state.formData = {username: '', password: '', admin: false}
            }
            notifier.notify({
                level: 'success',
                message: $t('user.management.success.deleted') || 'User deleted',
                type: 'success',
            })
        } catch (error) {
            const message = error instanceof Error ? error.message : ($t('user.management.error.delete_failed') || 'Failed to delete user')
            notifier.notify({
                level: 'error',
                message,
                type: 'error',
            })
        } finally {
            state.loading = false
        }
    }

    const startEdit = (user: User) => {
        state.editing = user.id
        state.formData = {
            username: user.username,
            password: '', // Don't show actual password
            admin: user.permissions?.admin || false,
        }
    }

    const cancelEdit = () => {
        state.editing = null
        state.formData = {username: '', password: '', admin: false}
    }

    return (
        <section class="c-users-management-tab">
            <div class="header">
                <h2>User Management</h2>
            </div>

            {state.loading ? (
                <div>Loading users...</div>
            ) : (
                <>
                    {state.editing === null && (
                        <div class="create-form">
                            <h3>Create New User</h3>
                            <div class="form">
                                <FieldText
                                    model={state.formData.$username}
                                    label={$t('user.management.field.username') || 'Username'}
                                    placeholder={$t('user.management.placeholder.username') || 'Enter username'}
                                />
                                <FieldText
                                    model={state.formData.$password}
                                    label={$t('user.management.field.password') || 'Password'}
                                    type="password"
                                    placeholder={$t('user.management.placeholder.password') || 'Enter password'}
                                />
                                <FieldCheckbox
                                    model={state.formData.$admin}
                                    label={$t('user.management.field.admin') || 'Admin'}
                                    help={$t('user.management.field.admin_help') || 'Grant administrator privileges'}
                                />
                                <div class="actions">
                                    <Button
                                        icon="plus"
                                        label={$t('user.management.action.add_user') || 'Create User'}
                                        onClick={handleCreate}
                                        type="success"
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    <div class="list">
                        {state.users.map((user) => (
                            <div key={user.id} class="item">
                                {state.editing === user.id ? (
                                    <div class="form">
                                        <FieldText
                                            model={state.formData.$username}
                                            label={$t('user.management.field.username') || 'Username'}
                                            disabled={true}
                                        />
                                        <FieldText
                                            model={state.formData.$password}
                                            label={$t('user.management.field.password') || 'Password'}
                                            type="password"
                                            placeholder={$t('user.management.placeholder.password_optional') || 'Leave empty to keep current password'}
                                        />
                                        <FieldCheckbox
                                            model={state.formData.$admin}
                                            label={$t('user.management.field.admin') || 'Admin'}
                                            help={$t('user.management.field.admin_help') || 'Grant administrator privileges'}
                                        />
                                        <div class="actions">
                                            <Button
                                                icon="save"
                                                label={$t('user.management.action.save') || 'Save'}
                                                onClick={() => handleUpdate(user.id)}
                                                type="success"
                                            />
                                            <Button
                                                icon="close"
                                                label={$t('user.management.action.cancel') || 'Cancel'}
                                                onClick={cancelEdit}
                                                type="default"
                                            />
                                        </div>
                                    </div>
                                ) : (
                                    <div class="content">
                                        <div>
                                            <h3>{user.username}</h3>
                                            {user.permissions?.admin && (
                                                <p class="badge">Admin</p>
                                            )}
                                        </div>
                                        <div class="actions">
                                            <Button
                                                icon="edit"
                                                onClick={() => startEdit(user)}
                                                tip={$t('user.management.action.edit') || 'Edit'}
                                                variant="menu"
                                            />
                                            <Button
                                                icon="trash"
                                                onClick={() => handleDelete(user)}
                                                tip={$t('user.management.action.delete') || 'Delete'}
                                                type="danger"
                                                variant="menu"
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                        {state.users.length === 0 && (
                            <div class="empty">
                                <p>No users yet. Create your first user above.</p>
                            </div>
                        )}
                    </div>
                </>
            )}
        </section>
    )
}
