import type {h, JSX} from 'preact'

import {useState} from 'preact/hooks'

interface StateViewProps {
    state?: unknown
    title?: string
}

const renderString = (value: string): string => `"${value}"`
const renderBoolean = (value: boolean): string => value.toString()
const renderNumber = (value: number): string => value.toString()
const renderArray = (value: unknown[]): string => (value.length === 0 ? '[]' : `[${value.length} items]`)
const renderObject = (value: object): string => {
    try {
        return JSON.stringify(value, null, 2)
    } catch {
        return '[Object]'
    }
}

// eslint-disable-next-line max-statements
const renderValue = (value: unknown): string => {
    if (value === null) {
        return 'null'
    }
    if (typeof value === 'string') {
        return renderString(value)
    }
    if (typeof value === 'boolean') {
        return renderBoolean(value)
    }
    if (typeof value === 'number') {
        return renderNumber(value)
    }
    if (Array.isArray(value)) {
        return renderArray(value)
    }
    if (typeof value === 'object') {
        return renderObject(value)
    }
    return String(value)
}

export const StateView = ({state, title = 'Component State'}: StateViewProps): ReturnType<typeof h> | null => {
    const [isOpen, setIsOpen] = useState(false)

    if (!state) {
        return null
    }

    const renderStateEntry = (key: string, value: unknown): JSX.Element => (
        <div class='entry' key={key}>
            <span class='key'>{key}:</span>
            <span class='value'>{renderValue(value)}</span>
        </div>
    )

    return (
        <div class={`c-state-view ${isOpen ? 'open' : ''}`}>
            <button
                class='header'
                onClick={(): void => {
                    setIsOpen(!isOpen)
                }}
                type='button'
            >
                <h4 class='title'>
                    <span class='icon'>{isOpen ? '▼' : '▶'}</span>
                    {title}
                </h4>
            </button>
            {isOpen && (
                <div class='content'>
                    {typeof state === 'object' && state !== null ? (
                        Object.entries(state).map(([key, value]): JSX.Element => renderStateEntry(key, value))
                    ) : (
                        <div class='entry'>
                            <span class='value'>{renderValue(state)}</span>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
