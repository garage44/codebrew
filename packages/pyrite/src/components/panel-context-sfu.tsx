import {VideoStrip} from './video/video-strip'
import {VideoCanvas} from './video/video-canvas'
import {ControlsMain} from './controls/controls-main'
import {PanelContext} from '@garage44/common/components'
import {$s} from '@/app'
import {store} from '@garage44/common/app'
import {DeviceSettings} from './device-settings'
import {useEffect, useMemo} from 'preact/hooks'

export function PanelContextSfu() {
    // Toggle between VideoStrip and VideoCanvas based on panel width
    // Use VideoStrip when panel width is <= 300px (narrow/collapsed state)
    // Use VideoCanvas when panel width is > 300px (widened state)
    // Higher threshold gives more space before canvas view sets in
    const currentWidth = useMemo(() => $s.panels.context.width || 350, [$s.panels.context.width])
    const showCanvasLayout = useMemo(() => !$s.panels.context.collapsed && currentWidth > 300, [$s.panels.context.collapsed, currentWidth])

    // Calculate available space: viewport width - menu width - chat min-width (350px)
    const calculateAvailableWidth = () => {
        if (typeof window === 'undefined') return 350
        const viewportWidth = window.innerWidth
        // Account for actual menu width: collapsed menu still takes ~56px, not 0
        const menuWidth = $s.panels.menu.collapsed ? 56 : $s.panels.menu.width || 240
        const chatMinWidth = 350
        const availableWidth = viewportWidth - menuWidth - chatMinWidth
        // Ensure minimum width of 160px (collapsed width)
        return Math.max(availableWidth, 160)
    }

    // Update panel width when window is resized (only if not collapsed)
    useEffect(() => {
        if ($s.panels.context.collapsed) return

        const handleResize = () => {
            const availableWidth = calculateAvailableWidth()
            // Only update if current width exceeds available space
            const currentWidth = $s.panels.context.width || 350
            if (currentWidth > availableWidth) {
                $s.panels.context.width = availableWidth
                store.save()
            }
        }

        window.addEventListener('resize', handleResize)
        return () => window.removeEventListener('resize', handleResize)
    }, [$s.panels.context.collapsed, $s.panels.menu.collapsed, $s.panels.menu.width])

    // Calculate maximum width based on available space
    const maxWidth = calculateAvailableWidth()

    return (
<PanelContext
    className='c-panel-context-conference'
    collapsed={$s.panels.context.collapsed}
    defaultWidth={350}
    maxWidth={maxWidth}
    minWidth={160}
    onWidthChange={(width) => {
        // Only allow width changes when not collapsed
        if (!$s.panels.context.collapsed) {
            // Clamp width to maxWidth to prevent exceeding available space
            const clampedWidth = Math.min(width, maxWidth)
            $s.panels.context.width = clampedWidth
        }
    }}
    onWidthChangeEnd={(width) => {
        // Save to store only when dragging ends (mouse up)
        // This prevents excessive localStorage writes during smooth dragging
        if (!$s.panels.context.collapsed) {
            store.save()
        }
    }}
    width={$s.panels.context.width}
>
        <ControlsMain key='controls' onCollapseChange={(collapsed) => {
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
        }} />
        {$s.env.url.includes('/devices') ? (
            <DeviceSettings key='devices' />
        ) : (
            <>
                <VideoStrip key='video-strip' className={showCanvasLayout ? 'hidden' : ''} />
                <VideoCanvas key='video-canvas' className={!showCanvasLayout ? 'hidden' : ''} />
            </>
        )}
</PanelContext>
    )
}
