import type {ComponentChildren} from 'preact'

import classnames from 'classnames'
import {useEffect, useRef, useState} from 'preact/hooks'

interface ContextMenuProps {
    anchor: ComponentChildren
    children: ComponentChildren
    className?: string
    position?: 'top' | 'bottom' | 'left' | 'right'
}

/**
 * ContextMenu - Generic context menu component
 * Displays a menu when clicking on the anchor element
 */
export const ContextMenu = ({anchor, children, className = '', position = 'bottom'}: ContextMenuProps) => {
    const [isOpen, setIsOpen] = useState(false)
    const containerRef = useRef<HTMLDivElement>(null)
    const menuRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false)
            }
        }

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside)
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside)
        }
    }, [isOpen])

    const toggleMenu = () => {
        setIsOpen(!isOpen)
    }

    return (
        <div class={classnames('c-context-menu', className)} ref={containerRef}>
            <div class='anchor' onClick={toggleMenu}>
                {anchor}
            </div>
            {isOpen && (
                <div class={classnames('menu', position)} ref={menuRef}>
                    {children}
                </div>
            )}
        </div>
    )
}
