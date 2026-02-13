import type {ComponentChildren} from 'preact'
import type {Instance as TippyInstance} from 'tippy.js'

import classnames from 'classnames'
import {Link} from 'preact-router'
import {useEffect, useRef, useState} from 'preact/hooks'
import tippy from 'tippy.js'

import {Icon} from '@/components'

export interface ButtonContextConfig {
    enabled: boolean
    placeholder: string
    submit: (text: string) => void
}

export interface ButtonProps {
    active?: boolean
    children?: ComponentChildren
    class?: string
    className?: string
    context?: ButtonContextConfig
    disabled?: boolean
    icon?: string
    iconProps?: Record<string, any>
    label?: string
    onClick?: (event: MouseEvent) => void
    route?: string
    size?: 's' | 'm' | 'l'
    tip?: string
    type?: 'default' | 'success' | 'info' | 'warning' | 'danger'
    variant?: 'default' | 'toggle' | 'menu' | 'unset' | 'context'
}

// Helper function to get DOM element from Preact ref
// Handles both direct DOM elements and Preact component instances
function getDOMElement(ref: unknown): HTMLElement | null {
    if (!ref) {
        return null
    }

    if (ref instanceof HTMLElement) {
        // Direct DOM element (from <button>)
        return ref
    }

    if (ref && typeof ref === 'object' && 'base' in ref) {
        // Preact component instance (from <Link>)
        const {base} = ref as {base?: HTMLElement}
        if (base instanceof HTMLElement) {
            return base
        }
    }

    return null
}

export function Button({
    active = false,
    children = null,
    class: classProp = '',
    className = '',
    context,
    disabled = false,
    icon,
    iconProps = {},
    label = '',
    onClick,
    route,
    size = 'm',
    tip = '',
    type = 'default',
    variant = 'default',
}: ButtonProps) {
    const buttonRef = useRef(null)
    const tippyInstanceRef = useRef<TippyInstance | null>(null)
    const [contextTriggered, setContextTriggered] = useState(false)
    const [contextText, setContextText] = useState('')

    useEffect(() => {
        // Initialize or update tippy when tip changes or component mounts
        const domElement = getDOMElement(buttonRef.current)

        if (!domElement) {
            return
        }

        if (tippyInstanceRef.current) {
            // Update existing tippy instance
            if (tip) {
                tippyInstanceRef.current.setContent(tip)
                tippyInstanceRef.current.enable()
                // Update zIndex in case it changed
                tippyInstanceRef.current.setProps({zIndex: 1_000_000})
            } else {
                tippyInstanceRef.current.disable()
            }
        } else if (tip) {
            // Initialize tippy if tip is available
            // Use appendTo: document.body to ensure tooltips render outside panel containers
            // This prevents tooltips from being clipped by overflow:hidden on panels
            // Set zIndex to ensure tooltips appear above panels (panel z-index: 100001)
            tippyInstanceRef.current = tippy(domElement, {
                allowHTML: true,
                appendTo: () => document.body,
                arrow: true,
                content: tip,
                zIndex: 1_000_000,
            })
        }

        return () => {
            if (tippyInstanceRef.current) {
                tippyInstanceRef.current.destroy()
                tippyInstanceRef.current = null
            }
        }
    }, [tip]) // Include tip in dependencies to handle both initialization and updates

    const handleClick = (event: MouseEvent) => {
        // Store onClick reference at call time to prevent issues with re-renders
        const currentOnClick = onClick

        if (disabled) {
            console.log('[Button] Click ignored - button is disabled')
            return
        }

        console.log(
            '[Button] handleClick called, onClick exists:',
            Boolean(currentOnClick),
            'onClick type:',
            typeof currentOnClick,
            'context:',
            Boolean(context),
        )
        console.log('[Button] onClick function:', currentOnClick?.toString().slice(0, 100))

        // Handle context menu
        if (context && !contextTriggered) {
            if (context.enabled) {
                setContextTriggered(true)
                return
            }
            // No context action; just submit with empty text
            context.submit(contextText)
        }

        // Regular click handler - use stored reference
        if (currentOnClick) {
            console.log('[Button] Calling onClick handler NOW')
            try {
                const result = currentOnClick(event)
                console.log('[Button] onClick handler returned:', result)
            } catch (error) {
                console.error('[Button] onClick handler threw error:', error)
                throw error
            }
        } else {
            console.warn('[Button] No onClick handler provided')
        }
    }

    const handleContextSubmit = () => {
        if (context) {
            context.submit(contextText)
            setContextTriggered(false)
            setContextText('')
        }
    }

    const finalClassName = classnames('c-button', `type-${type}`, `variant-${variant}`, `size-${size}`, className, classProp, {
        active,
        disabled,
    })

    const buttonContent = (
        <>
            {icon && <Icon name={icon} type='unset' {...iconProps} />}
            {label && <span class='label'>{label}</span>}
            {children}

            {context && (
                <div
                    class={classnames('context-submit', {active: contextTriggered})}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                            setContextTriggered(false)
                        }
                    }}
                >
                    <button class='btn-context-submit' onClick={handleContextSubmit}>
                        <Icon name='check' type='unset' />
                    </button>
                    <textarea
                        class='context-input'
                        placeholder={context.placeholder}
                        value={contextText}
                        onInput={(e) => setContextText((e.target as HTMLTextAreaElement).value)}
                    />
                </div>
            )}
        </>
    )

    // If route is provided, render as Link
    if (route) {
        // Preact-router Link accepts href but TypeScript types may not reflect this
        return (
            <Link ref={buttonRef} class={finalClassName} {...({href: route, onClick: handleClick} as Record<string, unknown>)}>
                {buttonContent}
            </Link>
        )
    }

    // Otherwise, render as button
    return (
        <button ref={buttonRef} class={finalClassName} disabled={disabled} onClick={handleClick}>
            {buttonContent}
        </button>
    )
}
