import {api, notifier} from '@garage44/common/app'
import {FieldCheckbox, FieldText, Button} from '@garage44/common/components'
import {deepSignal} from 'deepsignal'
import {useEffect, useRef} from 'preact/hooks'

import type {Channel} from '@/types'

export default function TabChannels() {
    // Use DeepSignal for component state (per-instance, stable across renders)
    const stateRef = useRef(
        deepSignal({
            channels: [] as Channel[],
            editing: null as number | null,
            formData: {
                description: '',
                is_default: false,
                name: '',
                slug: '',
            },
            loading: false,
        }),
    )
    const state = stateRef.current

    const loadChannels = async () => {
        state.loading = true
        try {
            const data = await api.get('/api/channels')
            state.channels = Array.isArray(data) ? data : []
        } catch {
            notifier.notify({level: 'error', message: 'Failed to load channels'})
        } finally {
            state.loading = false
        }
    }

    useEffect(() => {
        loadChannels()
    }, [])

    const handleCreate = async () => {
        if (!state.formData.name || !state.formData.slug) {
            notifier.notify({level: 'error', message: 'Name and slug are required'})
            return
        }

        try {
            const newChannel = (await api.post('/api/channels', {
                description: state.formData.description,
                is_default: state.formData.is_default,
                name: state.formData.name,
                slug: state.formData.slug,
            })) as Channel
            state.channels = [...state.channels, newChannel]
            state.formData = {description: '', is_default: false, name: '', slug: ''}
            notifier.notify({level: 'success', message: 'Channel created and synced with Galene'})
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to create channel'
            notifier.notify({level: 'error', message})
        }
    }

    const handleUpdate = async (channelId: number) => {
        try {
            const updated = (await api.put(`/api/channels/${channelId}`, {
                description: state.formData.description,
                is_default: state.formData.is_default,
                name: state.formData.name,
                slug: state.formData.slug,
            })) as Channel
            state.channels = state.channels.map((c) => (c.id === channelId ? updated : c))
            state.editing = null
            state.formData = {description: '', is_default: false, name: '', slug: ''}
            notifier.notify({level: 'success', message: 'Channel updated and synced with Galene'})
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to update channel'
            notifier.notify({level: 'error', message})
        }
    }

    const handleDelete = async (channelId: number) => {
        if (!confirm('Are you sure you want to delete this channel? This will also delete the associated Galene group.')) {
            return
        }

        try {
            await api.delete(`/api/channels/${channelId}`, {})
            state.channels = state.channels.filter((c) => c.id !== channelId)
            notifier.notify({level: 'success', message: 'Channel deleted and Galene group removed'})
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to delete channel'
            notifier.notify({level: 'error', message})
        }
    }

    const startEdit = (channel: Channel) => {
        state.editing = channel.id
        state.formData = {
            description: channel.description || '',
            is_default: channel.is_default === 1,
            name: channel.name,
            slug: channel.slug,
        }
    }

    const cancelEdit = () => {
        state.editing = null
        state.formData = {description: '', is_default: false, name: '', slug: ''}
    }

    return (
        <section class='c-settings-tab-channels'>
            <div class='header'>
                <h2>Channel Configuration</h2>
            </div>

            {state.loading ? (
                <div>Loading channels...</div>
            ) : (
                <>
                    {state.editing === null && (
                        <div class='create-form'>
                            <h3>Create New Channel</h3>
                            <div class='form'>
                                <FieldText label='Channel Name' model={state.formData.$name} placeholder='Enter channel name' />
                                <FieldText
                                    help='This slug will be used as the Galene group name'
                                    label='Slug (Galene Group Name)'
                                    model={state.formData.$slug}
                                    placeholder='Enter slug (must match Galene group name)'
                                />
                                <FieldText
                                    label='Description'
                                    model={state.formData.$description}
                                    placeholder='Enter channel description'
                                />
                                <FieldCheckbox
                                    help='Only one channel can be set as default. Setting this unsets any other default channel.'
                                    label='Set as default channel'
                                    model={state.formData.$is_default}
                                />
                                <div class='actions'>
                                    <Button icon='plus' label='Create Channel' onClick={handleCreate} type='success' />
                                </div>
                            </div>
                        </div>
                    )}

                    <div class='list'>
                        {state.channels.map((channel) => (
                            <div class='item' key={channel.id}>
                                {state.editing === channel.id ? (
                                    <div class='form'>
                                        <FieldText label='Channel Name' model={state.formData.$name} />
                                        <FieldText
                                            help='This slug will be used as the Galene group name'
                                            label='Slug (Galene Group Name)'
                                            model={state.formData.$slug}
                                        />
                                        <FieldText label='Description' model={state.formData.$description} />
                                        <FieldCheckbox
                                            help='Only one channel can be set as default. Setting this unsets any other default.'
                                            label='Set as default channel'
                                            model={state.formData.$is_default}
                                        />
                                        <div class='actions'>
                                            <Button
                                                icon='save'
                                                label='Save'
                                                onClick={() => handleUpdate(channel.id)}
                                                type='success'
                                            />
                                            <Button icon='close' label='Cancel' onClick={cancelEdit} type='default' />
                                        </div>
                                    </div>
                                ) : (
                                    <div class='content'>
                                        <div>
                                            <h3>{channel.name}</h3>
                                            <p class='slug'>
                                                Slug:
                                                {channel.slug}
                                            </p>
                                            <p>{channel.description || 'No description'}</p>
                                        </div>
                                        <div class='actions'>
                                            <Button icon='edit' onClick={() => startEdit(channel)} tip='Edit' variant='menu' />
                                            <Button
                                                icon='trash'
                                                onClick={() => handleDelete(channel.id)}
                                                tip='Delete'
                                                type='danger'
                                                variant='menu'
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                        {state.channels.length === 0 && (
                            <div class='empty'>
                                <p>No channels yet. Create your first channel above.</p>
                            </div>
                        )}
                    </div>
                </>
            )}
        </section>
    )
}
