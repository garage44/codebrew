import {Icon} from '@garage44/common/components'
import classnames from 'classnames'
import {useCallback} from 'preact/hooks'

import {$s} from '@/app'
import {connection} from '@/models/sfu/sfu'

import {Stream} from '../stream/stream'

interface VideoStripProps {
    className?: string
    streams?: Array<{[key: string]: unknown; id: string; username: string}>
}

/**
 * VideoStrip - Vertical video tiles strip component
 *
 * Displays video streams in a single vertical column layout.
 * Optimized for right-side panel display.
 */
export const VideoStrip = ({className, streams}: VideoStripProps) => {
    // Helper to check if stream is a screen share
    const isScreenShare = useCallback((streamId: string) => {
        // Check if it's in upMedia.screenshare (upstream)
        if ($s.upMedia.screenshare.includes(streamId)) return true
        // Check downstream streams via connection
        if (connection?.down?.[streamId]?.label === 'screenshare') return true
        return false
    }, [])

    // Inline (no useMemo) - ensures we always read latest $s.streams when it changes (channel switch)
    const streamList = streams || $s.streams
    const sortedStreams = [...streamList].toSorted((a, b) => {
        const aIsScreenShare = isScreenShare(a.id)
        const bIsScreenShare = isScreenShare(b.id)
        if (aIsScreenShare && !bIsScreenShare) return -1
        if (!aIsScreenShare && bIsScreenShare) return 1
        if (a.username < b.username) return -1
        if (a.username > b.username) return 1
        return 0
    })

    const handleStreamUpdate = useCallback((updatedStream: {[key: string]: unknown; id: string}) => {
        const streamIndex = $s.streams.findIndex((s) => s.id === updatedStream.id)
        if (streamIndex >= 0) {
            Object.assign($s.streams[streamIndex], updatedStream)
            $s.streams = [...$s.streams]
        }
    }, [])

    /*
     * Show placeholder slots when no streams
     * Show 3 placeholder slots
     */
    const placeholderCount = 3

    return (
        <div class={classnames('c-video-strip', className)}>
            {sortedStreams.length > 0
                ? sortedStreams.map((description, index) => {
                      const isScreenShareStream = isScreenShare(description.id)
                      const itemClass = classnames('video-strip-item', {
                          'is-screenshare': isScreenShareStream,
                      })
                      return (
                          <div class={itemClass} key={description.id || index}>
                              <Stream key={description.id} modelValue={sortedStreams[index]} onUpdate={handleStreamUpdate} />
                          </div>
                      )
                  })
                : Array.from({length: placeholderCount}).map((_, index) => (
                      <div class='video-strip-placeholder' key={`placeholder-${index}`}>
                          <div class='placeholder-content'>
                              <Icon className='icon icon-l' name='webcam' />
                              <p>Waiting for video</p>
                          </div>
                      </div>
                  ))}
        </div>
    )
}
