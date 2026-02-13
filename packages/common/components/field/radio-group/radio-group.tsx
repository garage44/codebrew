interface FieldRadioGroupProps {
    value: string
    onChange: (value: string) => void
    options: [string, string][] // [value, label] tuples
    label?: string
    help?: string
    translate?: (key: string) => string
}

export const FieldRadioGroup = ({value, onChange, options, label, help, translate = (k) => k}: FieldRadioGroupProps) => {
    const updateModel = (event: Event) => {
        onChange((event.target as HTMLInputElement).value)
    }

    return (
        <div class='c-field-radio-group field'>
            {label && <div class='label'>{label}</div>}
            <div class='options'>
                {options.map((option) => (
                    <div key={option[0]} class='option'>
                        <input
                            id={option[0]}
                            checked={option[0] === value}
                            name='same'
                            type='radio'
                            value={option[0]}
                            onInput={updateModel}
                        />
                        <label for={option[0]}>{translate(option[1])}</label>
                    </div>
                ))}
            </div>
            {help && <div class='help'>{help}</div>}
        </div>
    )
}
