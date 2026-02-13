import classnames from 'classnames'
import {ComponentChildren} from 'preact'
import {useEffect, useRef, useState} from 'preact/hooks'
import {Button} from '../button/button'

interface PanelContextProps {
    children: ComponentChildren
    className?: string | string[]
    collapsed?: boolean
    defaultWidth?: number
    maxWidth?: number
    minWidth?: number
    onCollapseChange?: (collapsed: boolean) => void
    onWidthChange?: (width: number) => void
    onWidthChangeEnd?: (width: number) => void
    width?: number
}

/**
 * PanelContext - Generic right sidebar/panel component
 *
 * Provides a consistent right-side panel layout for contextual content.
 * Supports collapse/expand functionality and horizontal resizing.
 * Width adapts based on content and collapsed state.
 *
 * @example
 * <PanelContext collapsed={false} onCollapseChange={(c) => {...}} width={200} onWidthChange={(w) => {...}}>
 *   <VideoControls />
 *   <VideoStrip streams={streams} />
 * </PanelContext>
 */
export const PanelContext = ({
    children,
    className,
    collapsed = false,
    defaultWidth = 200,
    maxWidth,
    minWidth = 64,
    onCollapseChange,
    onWidthChange,
    onWidthChangeEnd,
    width,
}: PanelContextProps) => {
    const panelRef = useRef<HTMLElement>(null)
    const resizerRef = useRef<HTMLDivElement>(null)
    const [isResizing, setIsResizing] = useState(false)
    const currentWidth = width ?? defaultWidth

    useEffect(() => {
        // Only enable resizing when not collapsed and onWidthChange is provided
        if (!panelRef.current || !resizerRef.current || !onWidthChange || collapsed) return

        const panel = panelRef.current
        const resizer = resizerRef.current

        const handleMouseDown = (e: MouseEvent) => {
            // Don't prevent default if clicking on the collapse button
            const target = e.target as HTMLElement
            if (target.closest('.c-button.variant-toggle')) {
                return
            }
            e.preventDefault()
            setIsResizing(true)

            const startX = e.clientX
            const startWidth = panel.offsetWidth

            const handleMouseMove = (e: MouseEvent) => {
                // Disable transition immediately for smooth dragging
                panel.style.transition = 'none'
                const diff = startX - e.clientX // Reversed because we're resizing from the left edge
                let newWidth = startWidth + diff

                // Clamp to min/max width - prevent dragging beyond constraints
                if (minWidth && newWidth < minWidth) {
                    newWidth = minWidth
                }
                if (maxWidth && newWidth > maxWidth) {
                    newWidth = maxWidth
                }

                // Update width immediately for seamless layout updates during dragging
                panel.style.width = `${newWidth}px`
                // Update state during dragging so layout switches smoothly
                onWidthChange(newWidth)
            }

            const handleMouseUp = () => {
                setIsResizing(false)
                // Re-enable transition after resizing is complete
                if (panelRef.current) {
                    panelRef.current.style.transition = ''
                    const finalWidth = panelRef.current.offsetWidth
                    // Final update on mouse up (state already updated during drag, but this ensures consistency)
                    onWidthChange(finalWidth)
                    // Call onWidthChangeEnd if provided (for saving to store, etc.)
                    if (onWidthChangeEnd) {
                        onWidthChangeEnd(finalWidth)
                    }
                }
                document.removeEventListener('mousemove', handleMouseMove)
                document.removeEventListener('mouseup', handleMouseUp)
            }

            document.addEventListener('mousemove', handleMouseMove)
            document.addEventListener('mouseup', handleMouseUp)
        }

        resizer.addEventListener('mousedown', handleMouseDown)

        return () => {
            resizer.removeEventListener('mousedown', handleMouseDown)
        }
    }, [onWidthChange, onWidthChangeEnd, minWidth, maxWidth, collapsed])

    return (
        <aside
            ref={panelRef}
            class={classnames(className, 'c-panel-context', 'fade-in', {collapsed, resizing: isResizing})}
            style={{
                gridColumn: 'context',
                width: collapsed ? `${minWidth}px` : `${currentWidth}px`,
            }}
        >
            {onWidthChange && !collapsed && (
                <div ref={resizerRef} class="resize-handle" aria-label="Resize panel" />
            )}
            <div class="content">
                {children}
            </div>
            {onCollapseChange && !(Array.isArray(className) ? className.some(c => c?.includes('c-panel-context-conference')) : className?.includes('c-panel-context-conference')) && (
                <Button
                    icon={collapsed ? 'chevron_left' : 'chevron_right'}
                    onClick={() => onCollapseChange(!collapsed)}
                    size="s"
                    tip={collapsed ? 'Expand panel' : 'Collapse panel'}
                    type="info"
                    variant="toggle"
                />
            )}
        </aside>
    )
}
