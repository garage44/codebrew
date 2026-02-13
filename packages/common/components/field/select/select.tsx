import type {Signal} from '@preact/signals'

import {signal} from '@preact/signals'
import classnames from 'classnames'

// oxlint-disable-next-line consistent-type-specifier-style
import {type ValidationResult, setTouched} from '@/lib/validation'

interface FieldSelectProps {
    className?: string
    disabled?: boolean
    help?: string
    label?: string
    model?: Signal<string>
    onChange?: (value: string, oldValue: string) => void
    options: {id: string; name: string}[]
    placeholder?: string
    validation?: ValidationResult
}

export const FieldSelect = ({
    className = '',
    disabled = false,
    help,
    label,
    model,
    onChange,
    options,
    placeholder = '',
    validation,
}: FieldSelectProps) => {
    const internalModel = model ?? signal('')
    return (
        <div
            class={classnames('c-field-select', 'field', className, {
                'is-invalid': validation?.isValid === false,
                'is-touched': validation?.isTouched,
                validation,
            })}
        >
            {Boolean(label) && (
                <div class='label'>
                    {label} {validation && <span class='indicator'>*</span>}
                </div>
            )}
            <select
                disabled={disabled}
                value={internalModel.value}
                onChange={(event: Event) => {
                    const target = event.target as HTMLSelectElement
                    const oldValue = internalModel.value
                    internalModel.value = target.value
                    setTouched(internalModel, true)
                    if (onChange) {
                        onChange(target.value, oldValue)
                    }
                }}
            >
                {placeholder && (
                    <option value='' selected={!internalModel.value}>
                        {placeholder}
                    </option>
                )}
                {options.map((option, index) => (
                    <option key={index} value={option.id} selected={internalModel.value === option.id}>
                        {option.name}
                    </option>
                ))}
            </select>
            {(() => {
                if (validation && validation.errors.length > 0 && validation.isTouched) {
                    return validation?.errors.map((error, index) => (
                        <div key={index} class='validation'>
                            {error}
                        </div>
                    ))
                }
                if (help) {
                    return <div class='help'>{help}</div>
                }
            })()}
        </div>
    )
}
