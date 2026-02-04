import {useState} from 'preact/hooks'

interface StateViewProps {
    state?: unknown
    title?: string
}

const renderValue = (value: unknown): string => {
    if (value === null) {
        return 'null'
    }
    if (value === undefined) {
        return 'undefined'
    }
    if (typeof value === 'string') {
        return `"${value}"`
    }
    if (typeof value === 'boolean') {
        return value.toString()
    }
    if (typeof value === 'number') {
        return value.toString()
    }
    if (Array.isArray(value)) {
        if (value.length === 0) {
            return '[]'
        }
        return `[${value.length} items]`
    }
    if (typeof value === 'object') {
        try {
            return JSON.stringify(value, null, 2)
        } catch {
            return '[Object]'
        }
    }
    return String(value)
}

export const StateView = ({state, title = 'Component State'}: StateViewProps) => {
    const [isOpen, setIsOpen] = useState(false)

    if (!state) {
        return null
    }

    const renderStateEntry = (key: string, value: unknown) => <div class='entry' key={key}>
            <span class='key'>
{key}
:
            </span>
            <span class='value'>{renderValue(value)}</span>
    </div>


    return (
        <div class={`c-state-view ${isOpen ? 'open' : ''}`}>
            <button
                class='header'
                onClick={() => setIsOpen(!isOpen)}
            >
                <h4 class='title'>
                    <span class='icon'>{isOpen ? '▼' : '▶'}</span>
                    {title}
                </h4>
            </button>
            {isOpen &&
                <div class='content'>
                    {typeof state === 'object' && state !== null ?
                            Object.entries(state).map(([key, value]) => renderStateEntry(key, value)) :
                        <div class='entry'>
                            <span class='value'>{renderValue(state)}</span>
                        </div>}
                </div>}
        </div>
    )
}
