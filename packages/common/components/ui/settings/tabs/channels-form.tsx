import {route} from 'preact-router'
import {useEffect} from 'preact/hooks'

import {api} from '@/app'
import {FieldText, Button} from '@/components'
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

export interface ChannelsFormProps {
    /**
     * Translation function
     */
    $t?: (key: string) => string
    /**
     * Channel ID for editing (undefined for creating new)
     */
    channelId?: string
}

/**
 * Channels Form Component - Create or edit a channel
 */
export function ChannelsForm({$t = (key: string) => key, channelId}: ChannelsFormProps) {
    const manager = useCollectionManager<Channel, {name: string; slug: string; description: string}>({
        createEndpoint: '/api/channels',
        deleteEndpoint: (id) => `/api/channels/${id}`,
        getId: (channel) => channel.id,
        initialFormData: {description: '', name: '', slug: ''},
        listEndpoint: '/api/channels',
        messages: {
            createFailed: $t('channel.management.error.create_failed') || 'Failed to create channel',
            createSuccess: $t('channel.management.success.created') || 'Channel created and synced with Galene',
            deleteFailed: $t('channel.management.error.delete_failed') || 'Failed to delete channel',
            deleteSuccess: $t('channel.management.success.deleted') || 'Channel deleted and Galene group removed',
            loadFailed: $t('channel.management.error.load_failed') || 'Failed to load channels',
            updateFailed: $t('channel.management.error.update_failed') || 'Failed to update channel',
            updateSuccess: $t('channel.management.success.updated') || 'Channel updated and synced with Galene',
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

    const isEditing = Boolean(channelId)

    useEffect(() => {
        if (isEditing && channelId) {
            // Load the specific channel for editing
            api.get(`/api/channels/${channelId}`)
                .then((channel: unknown) => {
                    manager.startEdit(channel as Channel)
                })
                .catch(() => {
                    // Channel not found, redirect back to list
                    route('/settings/channels')
                })
        } else {
            // For creating, just load the list to ensure we have the latest data
            manager.loadItems()
        }
    }, [channelId])

    const handleSubmit = async () => {
        if (!manager.state.formData.name || !manager.state.formData.slug) {
            return
        }

        try {
            if (isEditing && channelId) {
                await manager.updateItem(Number.parseInt(channelId))
            } else {
                await manager.createItem()
            }
            route('/settings/channels')
        } catch {
            // Error already handled by manager
        }
    }

    const handleCancel = () => {
        route('/settings/channels')
    }

    if (isEditing && !manager.state.formData.name) {
        return (
            <section class='c-channels-form'>
                <div>Loading channel...</div>
            </section>
        )
    }

    return (
        <section class='c-channels-form'>
            <div class='header'>
                <h2>
                    {isEditing
                        ? $t('channel.management.action.edit') || 'Edit Channel'
                        : $t('channel.management.action.add_channel') || 'Add Channel'}
                </h2>
            </div>

            <div class='form'>
                <FieldText
                    model={manager.state.formData.$name}
                    label={$t('channel.management.field.name') || 'Channel Name'}
                    placeholder={$t('channel.management.placeholder.name') || 'Enter channel name'}
                />
                <FieldText
                    model={manager.state.formData.$slug}
                    help={$t('channel.management.field.slug_help') || 'This slug will be used as the Galene group name'}
                    label={$t('channel.management.field.slug') || 'Slug (Galene Group Name)'}
                    placeholder={$t('channel.management.placeholder.slug') || 'Enter slug (must match Galene group name)'}
                />
                <FieldText
                    model={manager.state.formData.$description}
                    label={$t('channel.management.field.description') || 'Description'}
                    placeholder={$t('channel.management.placeholder.description') || 'Enter channel description'}
                />
                <div class='actions'>
                    <Button
                        icon='save'
                        label={
                            isEditing
                                ? $t('channel.management.action.save') || 'Save'
                                : $t('channel.management.action.create') || 'Create'
                        }
                        onClick={handleSubmit}
                        type='success'
                    />
                    <Button
                        icon='close'
                        label={$t('channel.management.action.cancel') || 'Cancel'}
                        onClick={handleCancel}
                        type='default'
                    />
                </div>
            </div>
        </section>
    )
}
