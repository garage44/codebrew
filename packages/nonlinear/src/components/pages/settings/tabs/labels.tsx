import {ws, notifier} from '@garage44/common/app'
import {Button, FieldText} from '@garage44/common/components'
import {deepSignal} from 'deepsignal'
import {useEffect, useRef, useState} from 'preact/hooks'

import {$s} from '@/app'

interface LabelDefinition {
    color: string
    created_at: number
    id: string
    name: string
    updated_at: number
}

interface LabelDefinition {
    color: string
    created_at: number
    id: string
    name: string
    updated_at: number
}

const createLabelFormState = () =>
    deepSignal({
        color: '#3b82f6',
        name: '',
    })

export function Labels() {
    const [labels, setLabels] = useState<LabelDefinition[]>([])
    const [editingId, setEditingId] = useState<string | null>(null)
    const formStateRef = useRef(createLabelFormState())
    const formState = formStateRef.current
    const editFormStateRef = useRef(createLabelFormState())
    const editFormState = editFormStateRef.current

    useEffect(() => {
        loadLabels()

        // Listen for label updates
        const handleLabelUpdate = (data: {label?: LabelDefinition; labelId?: string; type: string}) => {
            if (data.type === 'label:updated' && data.label) {
                loadLabels()
                // Update global state
                const index = $s.labelDefinitions.findIndex((l) => l.id === data.label!.id)
                if (index >= 0) {
                    $s.labelDefinitions[index] = data.label
                } else {
                    $s.labelDefinitions = [...$s.labelDefinitions, data.label]
                }
            } else if (data.type === 'label:deleted' && data.labelId) {
                loadLabels()
                // Update global state
                $s.labelDefinitions = $s.labelDefinitions.filter((l) => l.id !== data.labelId)
            }
        }

        ws.on('/labels', handleLabelUpdate)

        return () => {
            ws.off('/labels', handleLabelUpdate)
        }
    }, [])

    const loadLabels = async () => {
        try {
            const result = (await ws.get('/api/labels')) as {labels?: LabelDefinition[]} | null
            if (result?.labels) {
                setLabels(result.labels as LabelDefinition[])
            }
        } catch (error) {
            notifier.notify({
                message: `Failed to load labels: ${error instanceof Error ? error.message : String(error)}`,
                type: 'error',
            })
        }
    }

    const handleCreateLabel = async () => {
        if (!formState.name.trim()) {
            notifier.notify({
                message: 'Label name is required',
                type: 'warn',
            })
            return
        }

        try {
            await ws.post('/api/labels', {
                color: formState.color,
                name: formState.name.trim(),
            })

            formState.name = ''
            formState.color = '#3b82f6'
            await loadLabels()

            notifier.notify({
                message: 'Label created',
                type: 'success',
            })
        } catch (error) {
            notifier.notify({
                message: `Failed to create label: ${error instanceof Error ? error.message : String(error)}`,
                type: 'error',
            })
        }
    }

    const handleUpdateLabel = async (labelId: string) => {
        if (!editFormState.name.trim()) {
            notifier.notify({
                message: 'Label name is required',
                type: 'warn',
            })
            return
        }

        try {
            await ws.put(`/api/labels/${labelId}`, {
                color: editFormState.color,
                name: editFormState.name.trim(),
            })

            setEditingId(null)
            editFormState.name = ''
            editFormState.color = '#3b82f6'
            await loadLabels()

            notifier.notify({
                message: 'Label updated',
                type: 'success',
            })
        } catch (error) {
            notifier.notify({
                message: `Failed to update label: ${error instanceof Error ? error.message : String(error)}`,
                type: 'error',
            })
        }
    }

    const handleDeleteLabel = async (labelId: string) => {
        if (!confirm('Are you sure you want to delete this label? This will remove it from all tickets.')) {
            return
        }

        try {
            await ws.delete(`/api/labels/${labelId}`)
            await loadLabels()

            // Update global state
            $s.labelDefinitions = $s.labelDefinitions.filter((l) => l.id !== labelId)

            notifier.notify({
                message: 'Label deleted',
                type: 'success',
            })
        } catch (error) {
            notifier.notify({
                message: `Failed to delete label: ${error instanceof Error ? error.message : String(error)}`,
                type: 'error',
            })
        }
    }

    const startEdit = (label: LabelDefinition) => {
        setEditingId(label.id)
        editFormState.name = label.name
        editFormState.color = label.color
    }

    const cancelEdit = () => {
        setEditingId(null)
        editFormState.name = ''
        editFormState.color = '#3b82f6'
    }

    return (
        <div class='c-labels-settings'>
            <h2>Label Definitions</h2>
            <p class='description'>Manage label definitions. Labels can be reused across tickets and have configurable colors.</p>

            <div class='create-form'>
                <h3>Create New Label</h3>
                <div class='form-fields'>
                    <FieldText label='Label Name' model={formState.$name} placeholder='Enter label name' />
                    <div class='color-field'>
                        <label>Color</label>
                        <div class='color-input-wrapper'>
                            <input
                                onInput={(e) => {
                                    formState.color = (e.target as HTMLInputElement).value
                                }}
                                type='color'
                                value={formState.color}
                            />
                            <FieldText model={formState.$color} placeholder='#3b82f6' />
                        </div>
                    </div>
                    <Button onClick={handleCreateLabel} type='success'>
                        Create Label
                    </Button>
                </div>
            </div>

            <div class='list'>
                {labels.length === 0 ? (
                    <p class='empty'>No labels defined</p>
                ) : (
                    labels.map((label) => (
                        <div class='item' key={label.id}>
                            {editingId === label.id ? (
                                <div class='edit-form'>
                                    <div class='form-fields'>
                                        <FieldText
                                            label='Label Name'
                                            model={editFormState.$name}
                                            placeholder='Enter label name'
                                        />
                                        <div class='color-field'>
                                            <label>Color</label>
                                            <div class='color-input-wrapper'>
                                                <input
                                                    onInput={(e) => {
                                                        editFormState.color = (e.target as HTMLInputElement).value
                                                    }}
                                                    type='color'
                                                    value={editFormState.color}
                                                />
                                                <FieldText model={editFormState.$color} placeholder='#3b82f6' />
                                            </div>
                                        </div>
                                        <div class='actions'>
                                            <Button onClick={() => handleUpdateLabel(label.id)} type='success'>
                                                Save
                                            </Button>
                                            <Button onClick={cancelEdit} type='default'>
                                                Cancel
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div class='content'>
                                    <div class='label-preview'>
                                        <span
                                            class='label-badge'
                                            style={{
                                                backgroundColor: label.color,
                                                borderColor: label.color,
                                            }}
                                        >
                                            {label.name}
                                        </span>
                                    </div>
                                    <div class='actions'>
                                        <Button icon='edit' onClick={() => startEdit(label)} size='s' tip='Edit' type='default' />
                                        <Button
                                            icon='trash'
                                            onClick={() => handleDeleteLabel(label.id)}
                                            size='s'
                                            tip='Delete'
                                            type='default'
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>
        </div>
    )
}
