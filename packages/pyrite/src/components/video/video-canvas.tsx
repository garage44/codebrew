import {Stream} from '../stream/stream'
import {useMemo, useCallback, useEffect, useRef} from 'preact/hooks'
import {$s} from '@/app'
import {IconLogo} from '@garage44/common/components'
import classnames from 'classnames'
import {connection} from '@/models/sfu/sfu'

interface VideoCanvasProps {
    className?: string
    streams?: Array<{[key: string]: unknown; id: string; username: string}>
}

/**
 * VideoCanvas - Grid layout video component for expanded panel view
 *
 * Displays video streams in a grid layout optimized for expanded panel display.
 * Similar to Group component but designed for panel context.
 */
export const VideoCanvas = ({className, streams}: VideoCanvasProps) => {
    const viewRef = useRef<HTMLDivElement>(null)
    const resizeObserverRef = useRef<ResizeObserver | null>(null)

    // Constants
    const aspectRatio = 4 / 3
    const margin = 16

    // Helper to check if stream is a screen share
    const isScreenShare = useCallback((streamId: string) => {
        // Check if it's in upMedia.screenshare (upstream)
        if ($s.upMedia.screenshare.includes(streamId)) return true
        // Check downstream streams via connection
        if (connection?.down?.[streamId]?.label === 'screenshare') return true
        return false
    }, [$s.upMedia.screenshare])

    // Computed: sortedStreams - screen shares first, then by username
    const sortedStreams = useMemo(() => {
        const streamList = streams || $s.streams
        return [...streamList].toSorted((a, b) => {
            const aIsScreenShare = isScreenShare(a.id)
            const bIsScreenShare = isScreenShare(b.id)
            // Screen shares come first
            if (aIsScreenShare && !bIsScreenShare) return -1
            if (!aIsScreenShare && bIsScreenShare) return 1
            // Then sort by username
            if (a.username < b.username) return -1
            if (a.username > b.username) return 1
            return 0
        })
    }, [streams, $s.streams, isScreenShare])

    // Computed: streamsCount and streamsPlayingCount
    const streamsCount = $s.streams.length
    const streamsPlayingCount = useMemo(() => {
        return $s.streams.filter((s) => s.playing).length
    }, [$s.streams])

    /**
     * Optimal space algorithm from Anton Dosov:
     * https://dev.to/antondosov/building-a-video-gallery-just-like-in-zoom-4mam
     */
    const calcLayout = useCallback(() => {
        if (!viewRef.current) return
        const containerWidth = viewRef.current.offsetWidth
        const containerHeight = viewRef.current.offsetHeight
        let layout = {area: 0, cols: 0, height: 0, rows: 0, width: 0}
        let height,
            width

        for (let cols = 1; cols <= $s.streams.length; cols++) {
            const rows = Math.ceil($s.streams.length / cols)
            const hScale = containerWidth / (cols * aspectRatio)
            const vScale = containerHeight / rows

            // Determine which axis is the constraint.
            if (hScale <= vScale) {
                width = Math.floor((containerWidth - margin) / cols) - margin
                height = Math.floor(width / aspectRatio) - margin
            } else {
                height = Math.floor((containerHeight - margin) / rows) - margin
                width = Math.floor(height * aspectRatio) - margin
            }

            const area = width * height
            if (area > layout.area) {
                layout = {area, cols, height, rows, width}
            }
        }

        viewRef.current.style.setProperty('--stream-width', `${layout.width}px`)
    }, [$s.streams.length, aspectRatio])

    // Watch streamsCount and streamsPlayingCount
    useEffect(() => {
        requestAnimationFrame(calcLayout)
    }, [streamsCount, streamsPlayingCount, calcLayout])

    const handleStreamUpdate = useCallback((updatedStream: {id: string}) => {
        const streamIndex = $s.streams.findIndex((s) => s.id === updatedStream.id)
        if (streamIndex !== -1) {
            Object.assign($s.streams[streamIndex], updatedStream)
        }
    }, [])

    // Setup and cleanup
    useEffect(() => {
        if (!viewRef.current) return

        viewRef.current.style.setProperty('--stream-margin', `${margin}px`)

        resizeObserverRef.current = new ResizeObserver(() => {
            requestAnimationFrame(calcLayout)
        })

        requestAnimationFrame(calcLayout)
        resizeObserverRef.current.observe(viewRef.current)

        // Cleanup
        return () => {
            if (resizeObserverRef.current) {
                resizeObserverRef.current.disconnect()
            }
        }
    }, [calcLayout])

    return (
        <div class={classnames('c-video-canvas', className)} ref={viewRef}>
            {sortedStreams.map((description, index) => {
                const isScreenShareStream = isScreenShare(description.id)
                return <div
                    class={classnames('video-canvas-item', {'is-screenshare': isScreenShareStream})}
                    key={description.id || index}
                >
                    <Stream
                        key={description.id}
                        modelValue={sortedStreams[index]}
                        onUpdate={handleStreamUpdate}
                    />
                </div>
            })}

            {!$s.streams.length &&
                <div class='video-canvas-placeholder'>
                    <div class='placeholder-content'>
                        <svg class='icon logo-animated' height='48' viewBox='0 0 24 24' width='48'>
                            <IconLogo />
                        </svg>
                        <p>Waiting for video streams</p>
                        <span class='placeholder-hint'>Video streams will appear here when participants join</span>
                    </div>
                </div>}
        </div>
    )
}
