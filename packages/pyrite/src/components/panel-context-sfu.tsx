import {VideoStrip} from './video/video-strip'
import {VideoCanvas} from './video/video-canvas'
import {ControlsMain} from './controls/controls-main'
import {PanelContext} from '@garage44/common/components'
import {$s} from '@/app'
import {store} from '@garage44/common/app'
import {DeviceSettings} from './device-settings'
import {useEffect} from 'preact/hooks'

export function PanelContextSfu() {
    // Determine which video view to show based on expanded state
    const showExpandedView = $s.panels.context.expanded && !$s.panels.context.collapsed

    // Calculate available space: viewport width - menu width - chat min-width (350px)
    const calculateAvailableWidth = () => {
        if (typeof window === 'undefined') return 350
        const viewportWidth = window.innerWidth
        const menuWidth = $s.panels.menu.collapsed ? 0 : $s.panels.menu.width || 240
        const chatMinWidth = 350
        const availableWidth = viewportWidth - menuWidth - chatMinWidth
        // Ensure minimum width of 160px (collapsed width)
        return Math.max(availableWidth, 180)
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

    return (
<PanelContext
    className='c-panel-context-conference'
    collapsed={$s.panels.context.collapsed}
    defaultWidth={350}
    minWidth={160}
    onCollapseChange={(collapsed) => {
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
    onWidthChange={(width) => {
        // Only allow width changes when not collapsed
        if (!$s.panels.context.collapsed) {
            $s.panels.context.width = width
            store.save()
        }
    }}
    width={$s.panels.context.width}
>
        <ControlsMain key='controls' />
        {$s.env.url.includes('/devices') ? <DeviceSettings key='devices' /> : showExpandedView ? <VideoCanvas key='video-canvas' /> : <VideoStrip key='video-strip' />}
</PanelContext>
    )
}
