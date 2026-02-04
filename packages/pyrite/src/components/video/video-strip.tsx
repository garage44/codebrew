import {Stream} from '../stream/stream'
import {useMemo, useCallback, useEffect} from 'preact/hooks'
import {$s} from '@/app'
import {logger} from '@garage44/common/app'
import {Icon} from '@garage44/common/components'

interface VideoStripProps {
    streams?: Array<{[key: string]: unknown; id: string; username: string}>
}

/**
 * VideoStrip - Vertical video tiles strip component
 *
 * Displays video streams in a single vertical column layout.
 * Optimized for right-side panel display.
 */
export const VideoStrip = ({streams}: VideoStripProps) => {
    const sortedStreams = useMemo(() => {
        const streamList = streams || $s.streams
        const sorted = [...streamList].toSorted((a, b) => {
            if (a.username < b.username) return -1
            if (a.username > b.username) return 1
            return 0
        })
        logger.debug(`[VideoStrip] sorted streams: ${sorted.length} (from ${streamList.length} in $s.streams)`)
        return sorted
    }, [streams, $s.streams])

    const handleStreamUpdate = useCallback((updatedStream: {[key: string]: unknown; id: string}) => {
        logger.debug(`[VideoStrip] handleStreamUpdate: stream ${updatedStream.id}`)
        const streamIndex = $s.streams.findIndex((s) => s.id === updatedStream.id)
        if (streamIndex >= 0) {
            logger.debug(`[VideoStrip] updating stream ${updatedStream.id} at index ${streamIndex}`)
            Object.assign($s.streams[streamIndex], updatedStream)
        } else {
            logger.warn(`[VideoStrip] stream ${updatedStream.id} not found in $s.streams`)
        }
    }, [])

    // Log when streams change
    useEffect(() => {
        logger.debug(`[VideoStrip] streams changed: ${$s.streams.length} streams`)
        $s.streams.forEach((s) => {
            logger.debug(
                `[VideoStrip] stream: ${s.id} (${s.direction}), hasAudio=${s.hasAudio}, ` +
                `hasVideo=${s.hasVideo}, playing=${s.playing}`,
            )
        })
    }, [$s.streams])

    return (
        <div class='c-video-strip'>
            {sortedStreams.length > 0 ?
                    sortedStreams.map((description, index) => <div class='video-strip-item' key={description.id || index}>
                        <Stream modelValue={sortedStreams[index]} onUpdate={handleStreamUpdate} />
                    </div>) :
                <div class='video-strip-placeholder'>
                    <Icon className='icon icon-l' name='webcam' />
                    <p>No video streams</p>
                </div>}
        </div>
    )
}
