import {useState} from 'preact/hooks'

interface FieldMultiSelectProps {
    value: any
    onChange: (value: any) => void
    options: {id: string; name: string}[]
    label?: string
    help?: string
}

export const FieldMultiSelect = ({value, onChange, options, label = 'Label me', help}: FieldMultiSelectProps) => {
    const [uniqueId] = useState(() => Math.random().toString(36).slice(2, 9))

    const handleChange = (e: Event) => {
        const select = e.target as HTMLSelectElement
        const selectedOptions = [...select.selectedOptions].map((opt) => opt.value)
        onChange(selectedOptions)
    }

    return (
        <div class='c-field-multiselect field'>
            <div class='label-container'>
                <label class='field-label' for={uniqueId}>
                    {label}
                </label>
            </div>
            <select id={uniqueId} multiple onChange={handleChange}>
                {options.map((option) => (
                    <option key={option.id} value={option.id}>
                        {option.name}
                    </option>
                ))}
            </select>
            {help && <div class='help'>{help}</div>}
        </div>
    )
}
