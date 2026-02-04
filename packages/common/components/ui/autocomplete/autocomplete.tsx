import {ComponentChildren, useCallback, useEffect, useRef, useState} from 'preact/hooks'
import classnames from 'classnames'

export interface AutocompleteItem<T = unknown> {
    id: string
    data: T
}

export interface AutocompleteProps<T = unknown> {
    /**
     * Current content/value of the input
     */
    content: string

    /**
     * Callback when content changes
     */
    onContentChange: (content: string) => void

    /**
     * Reference to the input element (textarea or input)
     */
    inputRef: {current: HTMLTextAreaElement | HTMLInputElement | null}

    /**
     * Pattern to trigger autocomplete (e.g., "@" for mentions)
     */
    triggerPattern: string | RegExp

    /**
     * Items to suggest
     */
    items: AutocompleteItem<T>[]

    /**
     * Function to filter items based on query
     */
    filterItems: (items: Array<AutocompleteItem<T>>, query: string) => Array<AutocompleteItem<T>>

    /**
     * Function to render each suggestion item
     */
    renderItem: (item: AutocompleteItem<T>, isSelected: boolean) => ComponentChildren

    /**
     * Function to get the text to insert when an item is selected
     */
    getInsertText: (item: AutocompleteItem<T>) => string

    /**
     * Optional className for the autocomplete dropdown
     */
    className?: string

    /**
     * Maximum height of the dropdown
     */
    maxHeight?: number
}

/**
 * Autocomplete - Generic autocomplete component for text inputs
 *
 * Provides autocomplete functionality that triggers when a pattern is detected
 * in the input. Supports keyboard navigation and mouse selection.
 *
 * @example
 * <Autocomplete
 *   content={text}
 *   onContentChange={setText}
 *   inputRef={inputRef}
 *   triggerPattern="@"
 *   items={mentions}
 *   filterItems={(items, query) => items.filter(i => i.name.includes(query))}
 *   renderItem={(item) => <div>{item.name}</div>}
 *   getInsertText={(item) => `@${item.name}`}
 * />
 */
export function Autocomplete<T = unknown>({
    className = '',
    content,
    filterItems,
    getInsertText,
    inputRef,
    items,
    maxHeight = 200,
    onContentChange,
    renderItem,
    triggerPattern,
}: AutocompleteProps<T>) {
    const [showSuggestions, setShowSuggestions] = useState(false)
    const [suggestions, setSuggestions] = useState<Array<AutocompleteItem<T>>>([])
    const [selectedIndex, setSelectedIndex] = useState(0)
    const [matchStart, setMatchStart] = useState(0)
    const [query, setQuery] = useState('')
    const suggestionsRef = useRef<HTMLDivElement>(null)
    const lastKeyRef = useRef<string | null>(null)

    // Check for trigger pattern and show suggestions
    useEffect(() => {
        const input = inputRef.current
        if (!input) return

        const handleInput = () => {
            const cursorPos = input.selectionStart || 0
            const textBeforeCursor = content.substring(0, cursorPos)

            // Find the last trigger pattern match before cursor
            let match: RegExpMatchArray | null = null
            if (typeof triggerPattern === 'string') {
                const escaped = triggerPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
                const regex = new RegExp(`${escaped}(\\w*)$`)
                match = textBeforeCursor.match(regex)
            } else {
                match = textBeforeCursor.match(triggerPattern)
            }

            if (match) {
                const queryText = (match[1] || '').toLowerCase()
                const start = cursorPos - match[0].length

                setMatchStart(start)
                setQuery(queryText)

                // Filter suggestions
                const filtered = filterItems(items, queryText)

                setSuggestions(filtered)
                // Only reset selectedIndex if the last key wasn't an arrow key
                // This prevents resetting selection when navigating with arrow keys
                if (lastKeyRef.current !== 'ArrowDown' && lastKeyRef.current !== 'ArrowUp') {
                    setSelectedIndex(0)
                }
                setShowSuggestions(filtered.length > 0)
            } else {
                setShowSuggestions(false)
            }
        }

        // Listen to various input events
        const handleSelectionChange = () => {
            handleInput()
        }

        handleInput()
        input.addEventListener('selectionchange', handleSelectionChange)
        input.addEventListener('click', handleInput)
        input.addEventListener('keyup', handleInput)

        return () => {
            input.removeEventListener('selectionchange', handleSelectionChange)
            input.removeEventListener('click', handleInput)
            input.removeEventListener('keyup', handleInput)
        }
    }, [content, inputRef, items, filterItems, triggerPattern])

    const insertItem = useCallback((item: AutocompleteItem<T>) => {
        const input = inputRef.current
        if (!input) return

        const triggerLength = typeof triggerPattern === 'string' ? triggerPattern.length : 1
        const before = content.substring(0, matchStart)
        const after = content.substring(matchStart + triggerLength + query.length)
        const insertText = getInsertText(item)
        const newContent = `${before}${insertText} ${after}`

        onContentChange(newContent)
        setShowSuggestions(false)

        // Set cursor position after the inserted text
        setTimeout(() => {
            const newCursorPos = matchStart + insertText.length + 1 // +1 for space
            input.setSelectionRange(newCursorPos, newCursorPos)
            input.focus()
        }, 0)
    }, [content, matchStart, query, triggerPattern, getInsertText, onContentChange])

    // Handle keyboard navigation
    useEffect(() => {
        const input = inputRef.current
        if (!input || !showSuggestions) return

        const handleKeyDown = (e: KeyboardEvent) => {
            if (!showSuggestions || suggestions.length === 0) return

            if (e.key === 'ArrowDown') {
                e.preventDefault()
                lastKeyRef.current = 'ArrowDown'
                setSelectedIndex((prev) => (prev + 1) % suggestions.length)
            } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                lastKeyRef.current = 'ArrowUp'
                setSelectedIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length)
            } else if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault()
                lastKeyRef.current = null
                if (suggestions[selectedIndex]) {
                    insertItem(suggestions[selectedIndex])
                }
            } else if (e.key === 'Escape') {
                e.preventDefault()
                lastKeyRef.current = null
                setShowSuggestions(false)
            } else {
                lastKeyRef.current = null
            }
        }

        input.addEventListener('keydown', handleKeyDown)
        return () => {
            input.removeEventListener('keydown', handleKeyDown)
        }
    }, [showSuggestions, suggestions, selectedIndex, insertItem])

    // Scroll selected item into view
    useEffect(() => {
        if (showSuggestions && suggestionsRef.current) {
            const selectedElement = suggestionsRef.current.children[selectedIndex] as HTMLElement
            if (selectedElement) {
                selectedElement.scrollIntoView({
                    behavior: 'smooth',
                    block: 'nearest',
                })
            }
        }
    }, [selectedIndex, showSuggestions])

    // Calculate position for autocomplete dropdown
    const [position, setPosition] = useState({top: 0, left: 0})

    useEffect(() => {
        if (!showSuggestions || !inputRef.current) {
            return
        }

        const input = inputRef.current
        const textBeforeCursor = content.substring(0, matchStart)

        // Create a temporary div to measure text position
        const measureDiv = document.createElement('div')
        const inputStyle = window.getComputedStyle(input)
        measureDiv.style.position = 'absolute'
        measureDiv.style.visibility = 'hidden'
        measureDiv.style.whiteSpace = 'pre-wrap'
        measureDiv.style.font = inputStyle.font
        measureDiv.style.fontSize = inputStyle.fontSize
        measureDiv.style.fontFamily = inputStyle.fontFamily
        measureDiv.style.fontWeight = inputStyle.fontWeight
        measureDiv.style.lineHeight = inputStyle.lineHeight
        measureDiv.style.padding = inputStyle.padding
        measureDiv.style.border = inputStyle.border
        measureDiv.style.width = `${input.offsetWidth}px`
        measureDiv.style.wordWrap = 'break-word'
        measureDiv.style.overflowWrap = 'break-word'
        measureDiv.style.boxSizing = inputStyle.boxSizing
        measureDiv.textContent = textBeforeCursor

        // Add a span to mark the end position
        const marker = document.createElement('span')
        marker.textContent = '|'
        measureDiv.appendChild(marker)

        document.body.appendChild(measureDiv)

        const inputRect = input.getBoundingClientRect()
        const markerRect = marker.getBoundingClientRect()
        const measureDivRect = measureDiv.getBoundingClientRect()

        // Calculate position relative to the marker
        const top = markerRect.top - measureDivRect.top + inputRect.top + parseInt(inputStyle.paddingTop || '0') + parseInt(inputStyle.borderTopWidth || '0')
        const left = markerRect.left - measureDivRect.left + inputRect.left + parseInt(inputStyle.paddingLeft || '0') + parseInt(inputStyle.borderLeftWidth || '0')

        document.body.removeChild(measureDiv)

        setPosition({
            top: top + 20, // Offset below the cursor
            left: left,
        })
    }, [showSuggestions, matchStart, content])

    if (!showSuggestions || suggestions.length === 0) {
        return null
    }

    return (
        <div
            class={classnames('c-autocomplete', className)}
            ref={suggestionsRef}
            style={{
                maxHeight: `${maxHeight}px`,
                position: 'fixed',
                top: `${position.top}px`,
                left: `${position.left}px`,
            }}
        >
            {suggestions.map((item, index) => (
                <div
                    class={classnames('autocomplete-item', {
                        selected: index === selectedIndex,
                    })}
                    key={item.id}
                    onMouseDown={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        insertItem(item)
                    }}
                    onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        insertItem(item)
                    }}
                    onMouseEnter={() => setSelectedIndex(index)}
                    style={{position: 'relative'}}
                >
                    <div
                        style={{
                            height: '100%',
                            left: 0,
                            pointerEvents: 'auto',
                            position: 'absolute',
                            top: 0,
                            width: '100%',
                            zIndex: 1,
                        }}
                        onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            insertItem(item)
                        }}
                        onMouseDown={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            insertItem(item)
                        }}
                        onMouseEnter={() => setSelectedIndex(index)}
                    />
                    <div style={{pointerEvents: 'none', position: 'relative', zIndex: 2}}>
                        {renderItem(item, index === selectedIndex)}
                    </div>
                </div>
            ))}
        </div>
    )
}
