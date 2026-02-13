import {$t} from '@garage44/common/app'
import {useEffect, useState, useMemo} from 'preact/hooks'

import {connection} from '@/models/sfu/sfu'

interface ReportsProps {
    description: {id: string; settings?: {audio?: Record<string, unknown>; video?: Record<string, unknown>}}
    onClick?: () => void
}

export const Reports = ({description, onClick}: ReportsProps) => {
    const [stats, setStats] = useState<Record<string, Record<string, string>>>({})
    const [glnStream, setGlnStream] = useState<{
        onstats: (() => void) | null
        pc: RTCPeerConnection
        setStatsInterval: (interval: number) => void
        stats?: Record<string, Record<string, unknown>>
    } | null>(null)

    const hasAudioStats = useMemo(() => {
        if (description.settings && description.settings.audio && Object.keys(description.settings.audio).length) {
            return true
        }
        return false
    }, [description.settings])

    const hasVideoStats = useMemo(() => {
        if (description.settings && description.settings.video && Object.keys(description.settings.video).length) {
            return true
        }
        return false
    }, [description.settings])

    const onDownStats = () => {
        if (!glnStream) return
        glnStream.pc.getReceivers().forEach((r: RTCRtpReceiver) => {
            let tid = r.track && r.track.id

            const streamStats = tid && glnStream.stats[tid]
            if (streamStats) {
                const filtered: Record<string, Record<string, string>> = {}
                for (const [categoryName, category] of Object.entries(streamStats)) {
                    filtered[categoryName] = {}
                    if (categoryName === 'track') {
                        for (const [statName, stat] of Object.entries(category as Record<string, unknown>)) {
                            if (statName === 'timestamp') {
                                continue
                            } else if (statName === 'totalAudioEnergy') {
                                filtered[categoryName]['Total Audio Energy'] = Number(stat).toFixed(2)
                            } else if (statName === 'audioEnergy') {
                                filtered[categoryName]['Audio Energy'] = Number(stat).toFixed(2)
                            }
                        }
                    }
                }
                setStats(filtered)
            }
        })
    }

    const onUpStats = () => {
        if (!glnStream) return
        glnStream.pc.getSenders().forEach((s: RTCRtpSender) => {
            let tid = s.track && s.track.id
            const streamStats = glnStream.stats[tid]

            if (streamStats) {
                const filtered: Record<string, Record<string, string>> = {}
                for (const [categoryName, category] of Object.entries(streamStats)) {
                    filtered[categoryName] = {}
                    if (categoryName === 'outbound-rtp') {
                        for (const [statName, stat] of Object.entries(category as Record<string, unknown>)) {
                            if (statName === 'timestamp') {
                                continue
                            } else if (statName === 'rate') {
                                filtered[categoryName]['Data Rate'] = `${Math.round((stat as number) / 1000)} Kbps`
                            } else if (statName === 'bytesSent') {
                                filtered[categoryName]['Streamed'] = `${Math.round((stat as number) / 1000 / 1024)} Mb`
                            }
                        }
                    }
                }

                setStats(filtered)
            }
        })
    }

    useEffect(() => {
        if (!connection) return

        let stream = null
        if (connection.up[description.id]) {
            stream = connection.up[description.id]
            stream.onstats = onUpStats
        } else {
            stream = connection.down[description.id]
            stream.onstats = onDownStats
        }

        setGlnStream(stream)
        stream?.setStatsInterval(250)

        return () => {
            if (stream) {
                stream.onstats = null
            }
        }
    }, [description.id])

    return (
        <div class='c-stream-reports' onClick={onClick}>
            {!hasAudioStats && !hasVideoStats && <div class='no-stats-available'>{$t('group.report.not_available')}</div>}

            {hasVideoStats && (
                <div class='category'>
                    <div class='title'>{$t('group.report.video')}</div>
                    {Object.entries(description.settings.video).map(([statName, stat]) => (
                        <div class='stat' key={statName}>
                            <div class='key'>{statName}</div>
                            <div class='value'>{String(stat)}</div>
                        </div>
                    ))}
                </div>
            )}

            {hasAudioStats && (
                <div class='category'>
                    <div class='title'>{$t('group.report.audio')}</div>
                    {Object.entries(description.settings.audio).map(([statName, stat]) => (
                        <div class='stat' key={statName}>
                            <div class='key'>{statName}</div>
                            <div class='value'>{String(stat)}</div>
                        </div>
                    ))}
                </div>
            )}

            {Object.entries(stats).map(([categoryName, category]) => (
                <div class='category' key={categoryName}>
                    <div class='title'>{categoryName}</div>
                    {Object.entries(category).map(([statName, stat]) => (
                        <div class='stat' key={statName}>
                            <div class='key'>{statName}</div>
                            <div class='value'>{String(stat)}</div>
                        </div>
                    ))}
                </div>
            ))}
        </div>
    )
}
