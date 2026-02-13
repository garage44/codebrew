import type {Signal} from '@preact/signals'

import {signal} from '@preact/signals'
import classnames from 'classnames'

import {FieldCheckbox} from '@/components'

interface FieldCheckboxGroupOption {
    label: string
    value: Signal<boolean> | boolean
}

interface FieldCheckboxGroupProps {
    children?: unknown
    className?: string
    label?: string
    model: FieldCheckboxGroupOption[]
}

export const FieldCheckboxGroup = ({children, className, label, model: options}: FieldCheckboxGroupProps) => (
    <div class={classnames('c-field-checkbox-group', 'field', className)}>
        {label && <div class='label'>{label}</div>}
        <div class='options'>
            {options.map((option) => {
                const valueSignal = typeof option.value === 'boolean' ? signal(option.value) : option.value
                return [<FieldCheckbox key={option.label} label={option.label} model={valueSignal} />, children]
            })}
        </div>
    </div>
)
