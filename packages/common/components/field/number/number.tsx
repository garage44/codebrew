import {useState} from 'preact/hooks'

interface FieldNumberProps {
    value: number
    onChange: (value: number) => void
    label?: string
    help?: string
    placeholder?: string
}

export const FieldNumber = ({value, onChange, label = 'Label me', help = '', placeholder = '...'}: FieldNumberProps) => {
    const [uniqueId] = useState(() => Math.random().toString(36).slice(2, 9))

    return (
        <div class='c-field-number field'>
            <div class='label'>{label}</div>
            <input
                id={uniqueId}
                value={value}
                onInput={(e) => onChange(Number((e.target as HTMLInputElement).value))}
                placeholder={placeholder}
                type='number'
            />

            {help && <div class='help'>{help}</div>}
        </div>
    )
}
