import {route} from 'preact-router'
import {useEffect} from 'preact/hooks'

import type {CollectionColumn} from '@/components'

import {CollectionView, Button} from '@/components'
import {useCollectionManager} from '@/lib/collection-manager'

export interface Channel {
    created_at: number
    description: string
    id: number
    member_count?: number
    name: string
    slug: string
    unread_count?: number
}

export interface ChannelsListProps {
    /**
     * Translation function
     */
    $t?: (key: string) => string
}

/**
 * Channels List Component - Displays channels in a CollectionView table
 */
export function ChannelsList({$t = (key: string) => key}: ChannelsListProps) {
    const manager = useCollectionManager<Channel, {name: string; slug: string; description: string}>({
        createEndpoint: '/api/channels',
        deleteEndpoint: (id) => `/api/channels/${id}`,
        getId: (channel) => channel.id,
        initialFormData: {name: '', slug: '', description: ''},
        listEndpoint: '/api/channels',
        messages: {
            loadFailed: $t('channel.management.error.load_failed') || 'Failed to load channels',
            createSuccess: $t('channel.management.success.created') || 'Channel created and synced with Galene',
            createFailed: $t('channel.management.error.create_failed') || 'Failed to create channel',
            updateSuccess: $t('channel.management.success.updated') || 'Channel updated and synced with Galene',
            updateFailed: $t('channel.management.error.update_failed') || 'Failed to update channel',
            deleteSuccess: $t('channel.management.success.deleted') || 'Channel deleted and Galene group removed',
            deleteFailed: $t('channel.management.error.delete_failed') || 'Failed to delete channel',
            deleteConfirm: (channel) =>
                $t('channel.management.confirm.delete') ||
                'Are you sure you want to delete this channel? This will also delete the associated Galene group.',
        },
        populateFormData: (channel) => ({
            description: channel.description || '',
            name: channel.name,
            slug: channel.slug,
        }),
        transformCreateData: (data) => ({
            description: data.description,
            name: data.name,
            slug: data.slug,
        }),
        transformUpdateData: (data) => ({
            description: data.description,
            name: data.name,
            slug: data.slug,
        }),
        updateEndpoint: (id) => `/api/channels/${id}`,
        updateMethod: 'PUT',
    })

    useEffect(() => {
        manager.loadItems()
    }, [])

    const columns: CollectionColumn[] = [
        {
            flex: true,
            label: $t('channel.management.field.name') || 'Name',
            minWidth: '200px',
            render: (channel: Channel) => (
                <div style={{minWidth: 0}}>
                    <strong style={{overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block'}}>
                        {channel.name}
                    </strong>
                </div>
            ),
        },
        {
            flex: true,
            label: $t('channel.management.field.slug') || 'Slug',
            minWidth: '150px',
            render: (channel: Channel) => (
                <span
                    style={{
                        color: 'var(--text-2)',
                        fontFamily: 'monospace',
                        fontSize: 'var(--font-d)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        display: 'block',
                    }}
                >
                    {channel.slug}
                </span>
            ),
        },
        {
            flex: 2,
            label: $t('channel.management.field.description') || 'Description',
            minWidth: '200px',
            render: (channel: Channel) => (
                <span
                    style={{
                        color: 'var(--text-2)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        display: 'block',
                    }}
                >
                    {channel.description || '—'}
                </span>
            ),
        },
    ]

    return (
        <section class='c-channels-list'>
            <div class='header'>
                <h2>{$t('ui.settings.channels.name') || 'Channels'}</h2>
                <Button
                    icon='plus'
                    label={$t('channel.management.action.add_channel') || 'Add Channel'}
                    onClick={() => route('/settings/channels/new')}
                    type='success'
                />
            </div>

            {manager.state.loading ? (
                <div>Loading channels...</div>
            ) : (
                <CollectionView
                    columns={columns}
                    emptyMessage={$t('channel.management.empty') || 'No channels found. Click "Add Channel" to create one.'}
                    items={manager.state.items}
                    row_actions={(channel: Channel) => (
                        <>
                            <Button
                                icon='edit'
                                onClick={() => route(`/settings/channels/${channel.id}`)}
                                tip={$t('channel.management.action.edit') || 'Edit'}
                                type='info'
                                variant='toggle'
                                size='s'
                            />
                            <Button
                                icon='trash'
                                onClick={() => manager.deleteItem(channel)}
                                tip={$t('channel.management.action.delete') || 'Delete'}
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
