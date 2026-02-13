import {route} from 'preact-router'
import {useEffect} from 'preact/hooks'

import type {CollectionColumn} from '@/components'

import {CollectionView, Button} from '@/components'
import {useCollectionManager} from '@/lib/collection-manager'

import type {User} from './users-management'

export interface UsersListProps {
    /**
     * Translation function
     */
    $t?: (key: string) => string
}

/**
 * Users List Component - Displays users in a CollectionView table
 */
export function UsersList({$t = (key: string) => key}: UsersListProps) {
    const manager = useCollectionManager<User, {username: string; password: string; admin: boolean}>({
        createEndpoint: (data) => `/api/users/${(data as {username: string}).username}`,
        deleteEndpoint: (id) => `/api/users/${id}/delete`,
        deleteMethod: 'GET',
        getId: (user) => user.id,
        initialFormData: {username: '', password: '', admin: false},
        listEndpoint: '/api/users',
        messages: {
            loadFailed: $t('user.management.error.load_failed') || 'Failed to load users',
            createSuccess: $t('user.management.success.created') || 'User created',
            createFailed: $t('user.management.error.create_failed') || 'Failed to create user',
            updateSuccess: $t('user.management.success.updated') || 'User updated',
            updateFailed: $t('user.management.error.save_failed') || 'Failed to update user',
            deleteSuccess: $t('user.management.success.deleted') || 'User deleted',
            deleteFailed: $t('user.management.error.delete_failed') || 'Failed to delete user',
            deleteConfirm: (user) =>
                ($t('user.management.confirm.delete') || 'Are you sure you want to delete user {username}?').replace(
                    '{username}',
                    user.username,
                ),
        },
        populateFormData: (user) => ({
            username: user.username,
            password: '', // Don't show actual password
            admin: user.permissions?.admin || false,
        }),
        transformCreateData: (data) => ({
            username: data.username,
            password: data.password
                ? {
                      key: data.password,
                      type: 'plaintext',
                  }
                : undefined,
            permissions: {
                admin: data.admin,
            },
            profile: {
                displayName: '',
            },
        }),
        transformUpdateData: (data) => ({
            username: data.username,
            ...(data.password && data.password.trim() !== ''
                ? {
                      password: {
                          key: data.password,
                          type: 'plaintext',
                      },
                  }
                : {}),
            permissions: {
                admin: data.admin,
            },
        }),
        updateEndpoint: (id) => `/api/users/${id}`,
        updateMethod: 'POST',
    })

    useEffect(() => {
        manager.loadItems()
    }, [])

    const columns: CollectionColumn[] = [
        {
            flex: true,
            label: $t('user.management.field.username') || 'Username',
            minWidth: '200px',
            render: (user: User) => (
                <div style={{display: 'flex', alignItems: 'center', gap: 'var(--spacer-1)', minWidth: 0}}>
                    <strong style={{overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>{user.username}</strong>
                    {user.permissions?.admin && (
                        <span
                            style={{
                                color: 'var(--success)',
                                fontSize: 'var(--font-d)',
                                fontWeight: 600,
                                flexShrink: 0,
                            }}
                        >
                            ●
                        </span>
                    )}
                </div>
            ),
        },
        {
            center: true,
            label: $t('user.management.field.admin') || 'Admin',
            render: (user: User) =>
                user.permissions?.admin ? (
                    <span
                        style={{
                            color: 'var(--success)',
                            fontWeight: 600,
                            fontSize: 'var(--font-d)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                        }}
                    >
                        {$t('user.management.field.admin') || 'Admin'}
                    </span>
                ) : (
                    <span style={{color: 'var(--text-3)'}}>—</span>
                ),
            width: '100px',
        },
    ]

    return (
        <section class='c-users-list'>
            <div class='header'>
                <h2>{$t('ui.settings.users.name') || 'Users'}</h2>
                <Button
                    icon='plus'
                    label={$t('user.management.action.add_user') || 'Add User'}
                    onClick={() => route('/settings/users/new')}
                    type='success'
                />
            </div>

            {manager.state.loading ? (
                <div>Loading users...</div>
            ) : (
                <CollectionView
                    columns={columns}
                    emptyMessage={$t('user.management.empty') || 'No users found. Click "Add User" to create one.'}
                    items={manager.state.items}
                    row_actions={(user: User) => (
                        <>
                            <Button
                                icon='edit'
                                onClick={() => route(`/settings/users/${user.id}`)}
                                tip={$t('user.management.action.edit') || 'Edit'}
                                type='info'
                                variant='toggle'
                                size='s'
                            />
                            <Button
                                icon='trash'
                                onClick={() => manager.deleteItem(user)}
                                tip={$t('user.management.action.delete') || 'Delete'}
                                type='danger'
                                variant='toggle'
                                size='s'
                            />
                        </>
                    )}
                />
            )}
        </section>
    )
}
