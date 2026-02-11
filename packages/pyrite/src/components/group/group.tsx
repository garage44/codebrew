import {IconLogo} from '@garage44/common/components'
import {Stream} from '../stream/stream'
import {useEffect, useRef, useCallback} from 'preact/hooks'
import {$s} from '@/app'
import {notifier} from '@garage44/common/app'
import {connect} from '@/models/sfu/sfu'
import {currentGroup} from '@/models/group'

export const Group = () => {
    const viewRef = useRef<HTMLDivElement>(null)
    const resizeObserverRef = useRef<ResizeObserver | null>(null)

    // Constants
    const aspectRatio = 4 / 3
    const margin = 16

    // Inline (no useMemo) - ensures we always read latest $s.streams when it changes (channel switch)
    const streamsCount = $s.streams.length
    const sortedStreams = [...$s.streams].toSorted((a, b) => {
        if (a.username < b.username) return -1
        if (a.username > b.username) return 1
        return 0
    })
    const streamsPlayingCount = $s.streams.filter((s) => s.playing).length

    /**
     * Optimal space algorithm from Anton Dosov:
     * https://dev.to/antondosov/building-a-video-gallery-just-like-in-zoom-4mam
     * Also, learned from this resource:
     * https://github.com/Alicunde/Videoconference-Dish-CSS-JS
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
    }, [aspectRatio])

    // Watch streamsCount and streamsPlayingCount
    useEffect(() => {
        requestAnimationFrame(calcLayout)
    }, [streamsCount, streamsPlayingCount, calcLayout])

    // Auto-connect logic
    useEffect(() => {
        const attemptAutoConnect = async() => {
            if ($s.sfu.channel.connected) {
                // Already connected
                return
            }

            const group = currentGroup()
            if (!group) {
                // No group data
                return
            }

            try {
                // Check if group allows anonymous access
                if (group['allow-anonymous'] && group['public-access']) {
                    // Connect anonymously
                    await connect('', '')
                } else if ($s.profile.username && $s.profile.password) {
                    // Use stored credentials
                    await connect($s.profile.username, $s.profile.password)
                } else {
                    // Group requires authentication but no credentials stored
                    notifier.notify({
                        level: 'error',
                        message: 'This group requires authentication. Please log in first.',
                    })
                }
            } catch(err) {
                // Connection failed - could be auth error or network error
                notifier.notify({
                    level: 'error',
                    message: err === 'not authorised' ?
                        'Authentication failed. Please check your credentials.' :
                        'Failed to connect to group. Please try again.',
                })
            }
        }

        attemptAutoConnect()
    }, [])

    const handleStreamUpdate = useCallback((updatedStream: {id: string}) => {
        const streamIndex = $s.streams.findIndex((s) => s.id === updatedStream.id)
        if (streamIndex !== -1) {
            Object.assign($s.streams[streamIndex], updatedStream)
            $s.streams = [...$s.streams]
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

        // Set active channel to main
        $s.chat.channel = 'main'

        // Cleanup
        return () => {
            if (resizeObserverRef.current) {
                resizeObserverRef.current.disconnect()
            }
        }
    }, [calcLayout])

    return (
        <div class='c-group' ref={viewRef}>
            {sortedStreams.map((description, index) => <Stream
                key={description.id || index}
                modelValue={sortedStreams[index]}
                onUpdate={handleStreamUpdate}
            />)}

            {!$s.streams.length &&
                <svg class='icon logo-animated' height='40' viewBox='0 0 24 24' width='40'>
                    <IconLogo />
                </svg>}
        </div>
    )
}
