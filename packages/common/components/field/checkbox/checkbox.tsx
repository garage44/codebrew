import {randomId} from '../../../lib/utils'
import classnames from 'classnames'
import type {Signal} from '@preact/signals'
import {signal} from '@preact/signals'

interface FieldCheckboxProps {
    className?: string
    help?: string
    label: string
    model?: Signal<boolean>
    onChange?: (value: boolean) => void
    onInput?: (value: boolean) => void
    value?: boolean
}

export const FieldCheckbox = ({
    className = '',
    help = '',
    label,
    model,
    onChange,
    onInput,
    value,
}: FieldCheckboxProps) => {
    // Support both model (Signal) and value/onChange patterns
    const internalModel = model || (value !== undefined ? signal(value) : signal(false))
    const currentValue = model ? model.value : value ?? false
    const id = randomId()

    return <div class={classnames('c-field-checkbox', 'field', className)}>
        <div class='wrapper'>
            <input
                checked={currentValue}
                id={id}
                onInput={() => {
                    const newValue = !currentValue
                    if (model) {
                        model.value = newValue
                    } else if (onChange) {
                        onChange(newValue)
                    } else {
                        internalModel.value = newValue
                    }
                    if (onInput) {
                        onInput(newValue)
                    }
                }}
                type='checkbox'
                value={String(currentValue)}
            />
            <label class='label' for={id}>{label}</label>
        </div>
        {help && <div class='help'>{help}</div>}
    </div>
}
