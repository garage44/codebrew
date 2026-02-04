import {$s} from '@/app'
import {ws, notifier} from '@garage44/common/app'
import {Button, FieldSelect, FieldText, FieldTextarea} from '@garage44/common/components'
import {createValidator, required} from '@garage44/common/lib/validation'
import {deepSignal} from 'deepsignal'
import {useRef} from 'preact/hooks'

interface TicketFormProps {
    initialStatus: 'backlog' | 'todo' | 'in_progress' | 'review' | 'closed'
    onClose: () => void
    onSuccess: () => void
}

// State defined outside component for stability
const createFormState = () => deepSignal({
    description: '',
    priority: '',
    repository_id: '',
    title: '',
})

export const TicketForm = ({initialStatus, onClose, onSuccess}: TicketFormProps) => {
    const stateRef = useRef(createFormState())
    const state = stateRef.current

    const {isValid, validation} = createValidator({
        repository_id: [state.$repository_id, required('Repository is required')],
        title: [state.$title, required('Title is required')],
    })

    const handleSubmit = async() => {
        if (!isValid.value) {
            return
        }

        try {
            const ticketData: {
                description?: string
                priority?: number
                repository_id: string
                status: string
                title: string
            } = {
                repository_id: state.repository_id,
                status: initialStatus,
                title: state.title,
            }

            if (state.description) {
                ticketData.description = state.description
            }

            if (state.priority) {
                const priorityNum = parseInt(state.priority, 10)
                if (!isNaN(priorityNum)) {
                    ticketData.priority = priorityNum
                }
            }

            await ws.post('/api/tickets', ticketData)

            notifier.notify({
                message: 'Ticket created successfully',
                type: 'success',
            })
            onSuccess()
            onClose()
        } catch(error) {
            notifier.notify({
                message: `Failed to create ticket: ${error instanceof Error ? error.message : 'Unknown error'}`,
                type: 'error',
            })
        }
    }


    return (
        <div class='c-ticket-form'>
            <div class='header'>
                <h2>Create New Ticket</h2>
                <Button
                    icon='close'
                    onClick={onClose}
                    size='s'
                    tip='Close'
                    type='info'
                    variant='toggle'
                />
            </div>
            <div class='content'>
                <FieldSelect
                    label='Repository'
                    model={state.$repository_id}
                    options={$s.repositories.map((repo) => ({
                        id: repo.id,
                        name: repo.name,
                    }))}
                    placeholder='Select repository'
                    validation={validation.value.repository_id}
                />
                <FieldText
                    autofocus
                    label='Title'
                    model={state.$title}
                    placeholder='Enter ticket title'
                    validation={validation.value.title}
                />
                <FieldTextarea
                    help='Optional description of the ticket'
                    label='Description'
                    onChange={(value) => {
                        state.description = value
                    }}
                    placeholder='Enter ticket description'
                    value={state.description}
                />
                <FieldText
                    help='Optional priority number (higher = more important)'
                    label='Priority'
                    model={state.$priority}
                    placeholder='Enter priority number'
                    type='number'
                />
            </div>
            <div class='actions'>
                <Button
                    onClick={onClose}
                    type='info'
                    variant='secondary'
                >
                    Cancel
                </Button>
                <Button
                    disabled={!isValid.value}
                    onClick={handleSubmit}
                    type='primary'
                >
                    Create Ticket
                </Button>
            </div>
        </div>
    )
}
