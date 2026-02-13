import type {Signal} from '@preact/signals'

import {signal} from '@preact/signals'
import classnames from 'classnames'

import {Button} from '@/components'
import {setTouched} from '@/lib/validation'

interface FieldTextProps {
    autofocus?: boolean
    className?: string
    copyable?: boolean
    disabled?: boolean
    help?: string
    label?: string
    model?: Signal<string>
    onBlur?: ((event: Event) => void) | null
    onClick?: ((event: Event) => void) | null
    onKeyDown?: ((event: KeyboardEvent) => void) | null
    onChange?: (value: string) => void
    placeholder?: string
    transform?: ((value: string) => string) | null
    type?: string
    validation?: {isValid?: boolean; isTouched?: boolean; errors?: string[]} | null
    value?: string
}

export function FieldText({
    autofocus = false,
    className = '',
    copyable = false,
    disabled = false,
    help = '',
    label = '',
    model,
    onBlur = null,
    onClick = null,
    onKeyDown = null,
    onChange,
    placeholder = '...',
    transform = null,
    type = 'text',
    validation = null,
    value,
}: FieldTextProps) {
    // Support both model (Signal) and value/onChange patterns
    const internalModel = model || (value !== undefined ? signal(value) : signal(''))
    const currentValue = model ? model.value : (value ?? '')
    return (
        <div
            class={classnames('c-field-text', 'field', className, {
                'is-invalid': validation?.isValid === false,
                'is-touched': validation?.isTouched,
            })}
        >
            {Boolean(label) && (
                <div class='label'>
                    {label} {validation && <span class='indicator'>*</span>}
                </div>
            )}
            <div class='field-wrapper'>
                <input
                    autofocus={autofocus}
                    disabled={disabled}
                    onClick={(event) => {
                        if (onClick) {
                            onClick(event)
                        }
                    }}
                    onBlur={(event) => {
                        if (model) {
                            setTouched(model, true)
                        }

                        if (onBlur) {
                            onBlur(event)
                        }
                    }}
                    onKeyDown={(event) => {
                        if (onKeyDown) {
                            onKeyDown(event)
                        }
                    }}
                    onInput={(event) => {
                        let newValue = (event.target as HTMLInputElement).value
                        if (transform) {
                            newValue = transform(newValue)
                        }
                        if (model) {
                            model.value = newValue
                        } else if (onChange) {
                            onChange(newValue)
                        } else {
                            internalModel.value = newValue
                        }
                    }}
                    autocomplete={type === 'password' ? 'new-password' : 'on'}
                    placeholder={placeholder}
                    type={type}
                    value={currentValue}
                />
                {type === 'password' && copyable && (
                    <Button
                        icon='content_copy'
                        onClick={() => {
                            navigator.clipboard.writeText(model ? model.value : (value ?? ''))
                        }}
                        type='info'
                    />
                )}
            </div>
            {(() => {
                if (validation && validation.errors && validation.errors.length > 0 && validation.isTouched) {
                    return validation.errors.map((error, index) => (
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
