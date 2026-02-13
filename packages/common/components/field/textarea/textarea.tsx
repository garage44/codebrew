import {useEffect, useRef, useState} from 'preact/hooks'

interface FieldTextareaProps {
    value: string
    onChange: (value: string) => void
    label?: string
    placeholder?: string
    help?: string
    autofocus?: boolean
}

export const FieldTextarea = ({value, onChange, label, placeholder = '', help, autofocus}: FieldTextareaProps) => {
    const [uniqueId] = useState(() => Math.random().toString(36).slice(2, 9))
    const fieldRef = useRef<HTMLTextAreaElement>(null)

    const handleInput = (e: Event) => {
        onChange((e.target as HTMLTextAreaElement).value)
    }

    const handleKeydown = (e: KeyboardEvent) => {
        e.stopPropagation()
    }

    useEffect(() => {
        if (autofocus && fieldRef.current) {
            fieldRef.current.focus()
        }
    }, [autofocus])

    return (
        <div class='c-field-textarea field'>
            {label && <div class='label'>{label}</div>}
            <textarea
                ref={fieldRef}
                id={uniqueId}
                value={value}
                placeholder={placeholder}
                onInput={handleInput}
                onKeyDown={handleKeydown}
            />
            {help && <div class='help'>{help}</div>}
        </div>
    )
}
