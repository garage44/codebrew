import {store} from '@garage44/common/app'
import {PanelContext} from '@garage44/common/components'
import {useEffect, useMemo, useRef} from 'preact/hooks'

import {$s} from '@/app'

import {ControlsMain} from './controls/controls-main'
import {DeviceSettings} from './device-settings'
import {VideoCanvas} from './video/video-canvas'
import {VideoStrip} from './video/video-strip'

export function PanelContextSfu(): JSX.Element {
    const canvasRef = useRef<HTMLDivElement>(null)

    /*
     * Toggle between VideoStrip and VideoCanvas based on panel width
     * Use VideoStrip when panel width is <= 300px (narrow/collapsed state)
     * Use VideoCanvas when panel width is > 300px (widened state)
     * Higher threshold gives more space before canvas view sets in
     */
    const currentWidth = useMemo((): number => $s.panels.context.width || 350, [])
    const showCanvasLayout = useMemo((): boolean => !$s.panels.context.collapsed && currentWidth > 300, [currentWidth])

    // Fullscreen handler
    const handleFullscreen = async (): Promise<void> => {
        if (!canvasRef.current) {
            return
        }

        // Only allow fullscreen when canvas layout is visible
        if (!showCanvasLayout && !document.fullscreenElement) {
            return
        }

        try {
            if (document.fullscreenElement) {
                // Exit fullscreen
                await document.exitFullscreen()
                $s.panels.context.expanded = false
            } else {
                // Enter fullscreen - use the canvas container
                await canvasRef.current.requestFullscreen()
                $s.panels.context.expanded = true
            }
            store.save()
        } catch {
            // Fullscreen error - user may have cancelled or browser doesn't support
        }
    }

    // Listen for fullscreen changes to update state
    useEffect((): (() => void) => {
        const handleFullscreenChange = (): void => {
            $s.panels.context.expanded = Boolean(document.fullscreenElement)
            store.save()
        }

        document.addEventListener('fullscreenchange', handleFullscreenChange)
        return (): void => document.removeEventListener('fullscreenchange', handleFullscreenChange)
    }, [])

    // Calculate available space: viewport width - menu width - chat min-width (350px)
    const calculateAvailableWidth = (): number => {
        // eslint-disable-next-line no-undefined
        if (globalThis.window === undefined) {
            return 350
        }
        const viewportWidth = globalThis.window.innerWidth
        // Account for actual menu width: collapsed menu still takes ~56px, not 0
        const menuWidth = $s.panels.menu.collapsed ? 56 : $s.panels.menu.width || 240
        const chatMinWidth = 350
        const availableWidth = viewportWidth - menuWidth - chatMinWidth
        // Ensure minimum width of 160px (collapsed width)
        return Math.max(availableWidth, 160)
    }

    // Update panel width when window is resized (only if not collapsed)
    useEffect((): (() => void) | undefined => {
        if ($s.panels.context.collapsed) {
            return
        }

        const handleResize = (): void => {
            const availableWidth = calculateAvailableWidth()
            // Only update if current width exceeds available space
            const currentWidth = $s.panels.context.width || 350
            if (currentWidth > availableWidth) {
                $s.panels.context.width = availableWidth
                store.save()
            }
        }

        globalThis.window.addEventListener('resize', handleResize)
        return (): void => globalThis.window.removeEventListener('resize', handleResize)
    }, [])

    // Calculate maximum width based on available space
    const maxWidth = calculateAvailableWidth()

    return (
        <PanelContext
            className='c-panel-context-conference'
            collapsed={$s.panels.context.collapsed}
            defaultWidth={350}
            maxWidth={maxWidth}
            minWidth={160}
            onWidthChange={(width): void => {
                // Only allow width changes when not collapsed
                if (!$s.panels.context.collapsed) {
                    // Clamp width to maxWidth to prevent exceeding available space
                    const clampedWidth = Math.min(width, maxWidth)
                    $s.panels.context.width = clampedWidth
                }
            }}
            onWidthChangeEnd={(_width): void => {
                /*
                 * Save to store only when dragging ends (mouse up)
                 * This prevents excessive localStorage writes during smooth dragging
                 */
                if (!$s.panels.context.collapsed) {
                    store.save()
                }
            }}
            width={$s.panels.context.width}
        >
            <ControlsMain
                key='controls'
                onCollapseChange={(collapsed): void => {
                    if (!collapsed) {
                        /*
                         * Expanding: Set width to fill available space (100% minus menu and chat min-width)
                         * Always recalculate to ensure we use current viewport size, not stale localStorage value
                         */
                        const availableWidth = calculateAvailableWidth()
                        $s.panels.context.width = availableWidth
                        // Save immediately to update localStorage with correct value
                        store.save()
                    }
                    // Synchronize collapse state: both panels collapse together
                    $s.panels.context.collapsed = collapsed
                    store.save()
                }}
                onFullscreen={handleFullscreen}
            />
            {$s.env.url.includes('/devices') ? (
                <DeviceSettings key='devices' />
            ) : (
                <>
                    <VideoStrip className={showCanvasLayout ? 'hidden' : ''} key='video-strip' />
                    <div className='canvas-fullscreen-container' ref={canvasRef}>
                        <VideoCanvas className={showCanvasLayout ? '' : 'hidden'} key='video-canvas' />
                    </div>
                </>
            )}
        </PanelContext>
    )
}
