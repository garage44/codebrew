// Copyright (c) 2020 by Juliusz Chroboczek.

/*
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.  IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

import * as _protocol from './protocol.ts'
import _commands from './commands.ts'
import {notifier, $t} from '@garage44/common/app'
import {$s, store} from '@/app'
import {events} from '@garage44/common/app'
import {logger} from '@garage44/common/lib/logger'
import {formatBytes} from '@garage44/common/lib/utils'
import {localStream, getUserMedia, removeLocalStream} from '@/models/media'
import {currentGroup} from '@/models/group'

/*
 * Note: Presence is managed by Pyrite presence system only
 * Galene SFU no longer modifies $s.users - it only manages connection.users
 */

export const protocol = _protocol
export const commands = _commands

export let connection
export let file

let localGlnStream
let promiseConnect: {reject: (reason: string) => void; resolve: (value: string) => void} | null = null

// Connection state tracking
let connectionReady = false
const streamRetryCounts = new Map<string, number>()
const MAX_RETRIES = 3
const pendingDownstreamStreams: Array<{stream: any; timestamp: number}> = []

export async function addFileMedia(file) {
    logger.info('add file media')
    const {glnStream} = newUpStream(null, {
        direction: 'up',
        mirror: false,
        src: file,
    })
    glnStream.label = 'video'
    $s.upMedia[glnStream.label].push(glnStream.id)
    glnStream.userdata.play = true
    return glnStream
}

export async function addShareMedia() {
    logger.info('add share media')

    // Validate connection is ready
    if (!connectionReady) {
        const error = new Error('SFU connection not ready')
        logger.error('[SFU] addShareMedia: connection not ready')
        notifier.notify({message: 'Connection not ready. Please wait and try again.', type: 'error'})
        throw error
    }

    if (!connection) {
        const error = new Error('SFU connection not available')
        logger.error('[SFU] addShareMedia: connection not available')
        notifier.notify({message: 'Not connected to server', type: 'error'})
        throw error
    }

    let stream = null
    try {
        if (!('getDisplayMedia' in navigator.mediaDevices)) throw new Error('Your browser does not support screen sharing')
        stream = await (navigator.mediaDevices as any).getDisplayMedia({audio: true, video: true})

        if (!stream) {
            throw new Error('Failed to get display media')
        }
    } catch(e) {
        const errorMessage = e instanceof Error ? e.message : String(e)
        logger.error(`[SFU] addShareMedia: failed to get display media: ${errorMessage}`)
        notifier.notify({message: errorMessage, type: 'error'})
        throw e
    }

    let glnStream
    let streamState
    try {
        const result = newUpStream(null, {
            direction: 'up',
            mirror: false,
        })
        glnStream = result.glnStream
        streamState = result.streamState
    } catch(error) {
        // Clean up the stream if we failed to create upstream
        stream.getTracks().forEach((t) => t.stop())
        throw error
    }

    glnStream.label = 'screenshare'
    $s.upMedia[glnStream.label].push(glnStream.id)
    glnStream.stream = stream

    stream.getTracks().forEach((t) => {
        if (t.kind === 'audio') {
            streamState.hasAudio = true
        } else if (t.kind === 'video') {
            streamState.hasVideo = true
        }
        try {
            glnStream.pc.addTrack(t, stream)
        } catch(error) {
            logger.error(`[SFU] addShareMedia: failed to add track: ${error}`)
            // Clean up on error
            stream.getTracks().forEach((track) => track.stop())
            delUpMedia(glnStream)
            throw error
        }
        // Screensharing was stopped; e.g. through browser ui.
        t.onended = () => {
            logger.debug('[SFU] Screen share track ended, removing stream')
            delUpMedia(glnStream)
        }
    })

    return glnStream
}

export async function addUserMedia() {
    logger.debug('[sfu] addUserMedia called')

    // Enhanced validation
    if (!localStream) {
        const error = new Error('localStream is required for addUserMedia')
        logger.error('[sfu] addUserMedia: localStream is null')
        throw error
    }

    if (!connection) {
        const error = new Error('SFU connection is required for addUserMedia')
        logger.error('[sfu] addUserMedia: connection is null')
        throw error
    }

    // Validate connection is ready
    if (!connectionReady) {
        logger.warn('[SFU] addUserMedia: connection not ready yet, waiting...')
        // Wait for connection to be ready
        await new Promise((resolve) => {
            const checkReady = setInterval(() => {
                if (connectionReady) {
                    clearInterval(checkReady)
                    resolve(undefined)
                }
            }, 100)
            // Timeout after 5 seconds
            setTimeout(() => {
                clearInterval(checkReady)
                resolve(undefined)
            }, 5000)
        })

        if (!connectionReady) {
            const error = new Error('SFU connection not ready after timeout')
            logger.error('[SFU] addUserMedia: connection still not ready')
            throw error
        }
    }

    // Validate RTC configuration
    const rtcConfig = connection.getRTCConfiguration?.() || connection.rtcConfiguration
    if (!rtcConfig) {
        logger.warn('[SFU] addUserMedia: RTC configuration not available')
    }

    let localStreamId = findUpMedia('camera')
    let oldStream = localStreamId && connection.up[localStreamId]

    if (oldStream) {
        logger.debug(`[sfu] removing old camera stream ${localStreamId}`)
        stopUpMedia(oldStream)
    }

    logger.debug('[sfu] creating new upstream stream')
    const {glnStream, streamState} = newUpStream(localStreamId, {
        direction: 'up',
        mirror: false,
    })
    glnStream.label = 'camera'
    glnStream.stream = localStream
    localGlnStream = glnStream

    logger.debug(`[sfu] upstream stream created: id=${glnStream.id}, label=${glnStream.label}`)
    $s.upMedia[glnStream.label].push(glnStream.id)

    logger.debug(`[sfu] adding tracks to peer connection: ${localStream.getTracks().map((t) => t.kind).join(', ')}`)
    localStream.getTracks().forEach((t) => {
        if (t.kind === 'audio') {
            streamState.hasAudio = true
            if (!$s.devices.mic.enabled) {
                logger.info('[sfu] muting local audio stream track')
                t.enabled = false
            }
        } else if (t.kind === 'video') {
            streamState.hasVideo = true
            if ($s.devices.cam.resolution.id === '1080p') {
                t.contentHint = 'detail'
            }
        }
        glnStream.pc.addTrack(t, localStream)
    })

    logger.debug(`[sfu] streamState: hasAudio=${streamState.hasAudio}, hasVideo=${streamState.hasVideo}, id=${streamState.id}`)
    logger.debug('[sfu] waiting for negotiation to complete (stream will be added to $s.streams)')

    return new Promise((resolve) => {
        localGlnStream.onstatus = (status) => {
            logger.debug(`[sfu] upstream stream ${glnStream.id} status: ${status}`)
            if (status === 'connected') {
                logger.debug(`[sfu] upstream stream ${glnStream.id} connected successfully`)
                resolve(undefined)
            }
        }
    })
}

export async function connect(username?: string, password?: string) {
    if (connection && connection.socket) {
        connection.close()
    }

    // Reset connection state
    connectionReady = false
    streamRetryCounts.clear()
    pendingDownstreamStreams.length = 0

    // Use credentials from parameters or fall back to profile state
    const sfuUsername = username || $s.profile.username || ''
    const sfuPassword = password || $s.profile.password || ''

    logger.info(`[SFU] Connecting with username: ${sfuUsername ? '***' : '(empty)'}`)

    /*
     * Create the join promise BEFORE setting up handlers
     * This ensures promiseConnect is available when onJoined is called
     */
    let joinResolve: (value: string) => void
    let joinReject: (reason: string) => void
    const joinPromise = new Promise<string>((resolve, reject) => {
        joinResolve = resolve
        joinReject = reject
    })
    promiseConnect = {reject: joinReject!, resolve: joinResolve!}

    connection = new _protocol.ServerConnection()

    connection.onconnected = () => {
        logger.info('[connected] connected to Galène websocket')
        $s.profile.id = connection.id

        /*
         * Get channel slug from state (active channel) or from current channel
         * Channel slug directly matches Galene group name (1:1 mapping)
         */
        const channelSlug = $s.chat.activeChannelSlug
        if (!channelSlug) {
            logger.warn('[SFU] No active channel slug found, cannot join group')
            notifier.notify({
                message: 'No channel selected',
                type: 'error',
            })
            // Reject the join promise if no channel is selected
            if (promiseConnect) {
                promiseConnect.reject('No channel selected')
                promiseConnect = null
            }
            return
        }

        logger.info(`[SFU] Joining Galene group: ${channelSlug} (channel slug) with username: ${sfuUsername ? '***' : '(empty)'}`)
        connection.join(channelSlug, sfuUsername, sfuPassword)
    }

    // Disable chat handlers - Pyrite handles chat separately
    connection.onchat = null
    connection.onclearchat = null

    // Keep file transfer handler - uses WebRTC datachannels
    connection.onfiletransfer = onFileTransfer

    connection.onclose = onClose
    connection.ondownstream = onDownStream
    connection.onuser = onUser
    connection.onjoined = onJoined
    connection.onusermessage = onUserMessage

    /*
     * Ensure WebRTC configuration is available for peer connections
     * Match original Galène behavior: only modify if needed, otherwise use server config
     * Original Galène only modifies for forceRelay setting, we trust server config otherwise
     */
    connection.onpeerconnection = () => {
        // Like original Galène onPeerConnection: return null unless modifying
        // Original Galène only modifies for forceRelay setting, otherwise uses server config
        const serverConfig = connection.rtcConfiguration
        const isLocalhost = typeof location !== 'undefined' && 
            (location.hostname === 'localhost' || location.hostname === '127.0.0.1' || location.hostname === '[::1]')
        
        logger.debug(`[SFU] onpeerconnection called: serverConfig=${!!serverConfig}, isLocalhost=${isLocalhost}`)

        if (serverConfig) {
            // Server provided configuration - check if it has STUN servers
            const iceServers = serverConfig.iceServers || []
            
            // Log what server sent for debugging
            if (isLocalhost) {
                logger.debug(`[SFU] Server RTC config: ${iceServers.length} ICE servers`)
                iceServers.forEach((s, i) => {
                    const urls = Array.isArray(s.urls) ? s.urls : [s.urls]
                    logger.debug(`[SFU]   Server ${i}: ${urls.join(', ')}`)
                })
            }
            
            // Check for STUN servers more thoroughly
            let hasStun = false
            for (const server of iceServers) {
                const urls = Array.isArray(server.urls) ? server.urls : [server.urls]
                for (const url of urls) {
                    if (typeof url === 'string' && (url.includes('stun:') || url.startsWith('stun:'))) {
                        hasStun = true
                        break
                    }
                }
                if (hasStun) break
            }

            // For localhost, ALWAYS ensure STUN is present (browsers require it)
            if (isLocalhost && !hasStun) {
                logger.warn(`[SFU] Server RTC config missing STUN servers on localhost (${iceServers.length} servers), adding STUN fallback`)
                const modifiedConfig = {
                    ...serverConfig,
                    iceServers: [
                        {urls: 'stun:stun.l.google.com:19302'},
                        ...iceServers, // Add STUN first, then existing servers
                    ],
                }
                logger.debug(`[SFU] Modified RTC config now has ${modifiedConfig.iceServers.length} ICE servers (added STUN)`)
                return modifiedConfig
            }

            if (iceServers.length === 0) {
                logger.warn('[SFU] Server RTC config has no ICE servers - this may cause connection issues')
            } else if (isLocalhost && hasStun) {
                logger.debug(`[SFU] Server RTC config OK: ${iceServers.length} ICE servers, STUN present`)
            }

            logger.debug(`[SFU] onpeerconnection returning server config: ${iceServers.length} ICE servers`)
            return serverConfig
        }

        // If no server config yet, provide STUN fallback for localhost
        // Original Galène returns null here, but browsers on localhost often need STUN
        if (isLocalhost) {
            logger.warn('[SFU] No RTC configuration from server on localhost, using STUN fallback')
            const fallbackConfig = {
                iceServers: [
                    {urls: 'stun:stun.l.google.com:19302'},
                ],
            }
            logger.debug('[SFU] onpeerconnection returning STUN fallback config')
            return fallbackConfig
        }

        logger.debug('[SFU] No RTC configuration from server yet, using browser defaults')
        logger.debug('[SFU] onpeerconnection returning null (browser defaults)')
        return null
    }

    /*
     * Connect through Pyrite WebSocket proxy at /sfu
     * The proxy handles routing to Galene backend
     */
    // Construct WebSocket URL - use location.host which includes port if non-standard
    // For default HTTPS (443), browsers omit the port in location.host
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws'
    // location.host already includes port if present, or omits it for default ports
    const url = `${protocol}://${location.host}/sfu`
    logger.info(`[SFU] Connecting to Galene through proxy: ${url}`)
    logger.debug(`[SFU] Protocol: ${location.protocol}, Host: ${location.host}, Hostname: ${location.hostname}, Port: ${location.port || 'default'}`)
    
    console.log('[SFU] About to call connection.connect() with URL:', url)
    console.log('[SFU] Connection object:', connection ? 'exists' : 'null')
    console.log('[SFU] Connection type:', typeof connection)

    try {
        console.log('[SFU] Calling connection.connect() now...')
        await connection.connect(url)
        console.log('[SFU] connection.connect() completed successfully')

        // Validate connection was established
        if (!connection || !connection.socket) {
            const error = new Error('Connection established but socket is missing')
            logger.error('[SFU] Connection validation failed:', error)
            throw error
        }

        /*
         * Share initial status with other users.
         * Map $s.profile to Galene user data
         */
        if (connection.id && $s.sfu.profile) {
            try {
                connection.userAction('setdata', connection.id, $s.sfu.profile)
            } catch(error) {
                logger.warn(`[SFU] Failed to set user data: ${error}`)
                // Don't throw - connection is still valid
            }
        }
    } catch(e) {
        logger.error('[SFU] Failed to connect to Galene:', e)
        // Clean up promiseConnect on connection error
        promiseConnect = null
        connectionReady = false
        streamRetryCounts.clear()
        pendingDownstreamStreams.length = 0

        const errorMessage = e instanceof Error ? e.message : String(e)
        notifier.notify({
            message: errorMessage || "Couldn't connect to " + url,
            type: 'error',
        })
        throw e
    }

    // Return the promise that will resolve/reject when onJoined is called
    return joinPromise
}

export function delLocalMedia() {
    // Find and disconnect screen share stream by label
    if (connection && connection.up) {
        const screenShareId = findUpMedia('screenshare')
        if (screenShareId && connection.up[screenShareId]) {
            logger.info('disconnect screen share stream')
            delUpMedia(connection.up[screenShareId])
        }
    }
    if (!localStream) return

    logger.info('delete local media share media')
    removeLocalStream()
}

export function delMedia(id) {
    logger.debug(`[sfu] delMedia: removing stream ${id}`)

    // Clear retry count for this stream
    streamRetryCounts.delete(id)

    // Remove from pending streams if present
    const pendingIndex = pendingDownstreamStreams.findIndex((p) => p.stream.id === id)
    if (pendingIndex !== -1) {
        pendingDownstreamStreams.splice(pendingIndex, 1)
        logger.debug(`[sfu] delMedia: removed pending stream ${id}`)
    }

    const delStreamIndex = $s.streams.findIndex((i) => i.id === id)
    if (delStreamIndex === -1) {
        logger.warn(`[sfu] delMedia: stream ${id} not found in $s.streams`)
        return
    }

    const delStream = $s.streams[delStreamIndex]
    logger.info(`[delMedia] remove stream ${delStream.id} from stream state (${delStreamIndex})`)
    // Use array assignment to ensure DeepSignal reactivity
    $s.streams = $s.streams.filter((s) => s.id !== id)
    logger.debug(`[sfu] delMedia: stream ${id} removed from $s.streams (remaining: ${$s.streams.length})`)
}

export function delUpMedia(c) {
    if (!c) {
        logger.warn('[SFU] delUpMedia: stream object is null or undefined')
        return
    }

    if (!c.id) {
        logger.warn('[SFU] delUpMedia: stream id is missing')
        return
    }

    logger.debug(`[sfu] delUpMedia: removing upstream stream ${c.id}`)

    try {
        stopUpMedia(c)
    } catch(error) {
        logger.warn(`[SFU] delUpMedia: error stopping media: ${error}`)
    }

    delMedia(c.id)

    try {
        if (c.close) {
            c.close()
        }
    } catch(error) {
        logger.warn(`[SFU] delUpMedia: error closing stream: ${error}`)
    }

    if (connection && connection.up) {
        delete connection.up[c.id]
    } else {
        logger.warn('[SFU] delUpMedia: connection or connection.up not available')
    }
}

export function delUpMediaKind(label) {
    logger.debug(`remove all up media with label: ${label}`)

    if (!connection || !connection.up) {
        logger.warn('[SFU] delUpMediaKind: connection or connection.up not available')
        return
    }

    const streamsToRemove: string[] = []

    for (let id in connection.up) {
        const c = connection.up[id]
        if (!c) continue

        if (label && c.label !== label) {
            continue
        }

        streamsToRemove.push(id)
    }

    for (const id of streamsToRemove) {
        const c = connection.up[id]
        if (!c) continue

        try {
            if (c.close) {
                c.close()
            }
        } catch(error) {
            logger.warn(`[SFU] delUpMediaKind: error closing stream ${id}: ${error}`)
        }

        delMedia(id)
        delete connection.up[id]
        logger.debug(`remove up media stream: ${id}`)

        // Use array assignment to ensure DeepSignal reactivity
        if ($s.upMedia[label]) {
            $s.upMedia[label] = $s.upMedia[label].filter((i) => i !== id)
        }
    }
}

export function disconnect() {
    const channelSlug = $s.sfu.channel.name || $s.chat.activeChannelSlug
    logger.info(`disconnecting from group ${channelSlug}`)

    // Reset connection state
    connectionReady = false
    streamRetryCounts.clear()
    pendingDownstreamStreams.length = 0

    $s.sfu.channel.connected = false
    $s.streams = []

    // Update channel connection state
    if (channelSlug) {
        const sfuChannels = $s.sfu.channels as Record<string, {
            audio: boolean
            clientCount?: number
            comment?: string
            connected?: boolean
            description?: string
            locked?: boolean
            video: boolean
        }>
        if (sfuChannels[channelSlug]) {
            sfuChannels[channelSlug].connected = false
        }
    }

    // Always reset active channel on disconnect
    $s.chat.channel = ''
    connection.close()
    delLocalMedia()
}

function fileTransferEvent(this: any, state: string, data: any) {
    const f = this
    switch (state) {
        case 'inviting':
            break
        case 'connecting':
            break
        case 'connected':
            if (f.up) {
                Object.assign(f.notifier, {
                    buttons: [{
                        action: () => f.cancel(),
                        icon: 'Close',
                        text: 'Abort',
                    }],
                    message: $t('user.action.share_file.sending', {file: f.name}),
                    progress: {
                        boundaries: ['0', formatBytes(f.size)],
                        percentage: Math.ceil((f.datalen / f.size) * 100),
                    },

                })
            } else {
                Object.assign(f.notifier, {
                    buttons: [{
                        action: () => f.cancel(),
                        icon: 'Close',
                        text: 'Abort',
                    }],
                    message: $t('user.action.share_file.receiving', {file: f.name}),
                    progress: {
                        boundaries: ['0', formatBytes(f.size)],
                        percentage: Math.ceil((f.datalen / f.size) * 100),
                    },
                })
            }
            break
        case 'done':
            if (!f.up) {
                let url = URL.createObjectURL(data)
                let a = document.createElement('a')
                a.href = url
                a.textContent = f.name
                a.download = f.name
                a.type = f.mimetype
                a.click()
                URL.revokeObjectURL(url)
                Object.assign(f.notifier, {
                    buttons: [],
                    message: $t('user.action.share_file.transfer_complete', {
                        file: f.name,
                        size: formatBytes(f.size),
                    }),
                    progress: null,
                })
            } else {
                Object.assign(f.notifier, {
                    buttons: [],
                    message: $t('user.action.share_file.transfer_complete', {
                        file: f.name,
                        size: formatBytes(f.size),
                    }),
                    progress: null,
                })
            }
            // Update notification with timeout - notify method handles timeout automatically
            notifier.notify(f.notifier, 3000)
            break
        case 'cancelled':
            Object.assign(f.notifier, {
                buttons: [],
                level: 'warning',
                message: $t('user.action.share_file.transfer_cancelled', {file: f.name}),
                progress: null,
            })
            // Update notification with timeout - notify method handles timeout automatically
            notifier.notify(f.notifier, 3000)
            break
        case 'closed':
            break
        default:
            Object.assign(f.notifier, {
                buttons: [],
                level: 'error',
                message: $t('error', {error: state}),
                progress: null,
            })
            // Update notification with timeout - notify method handles timeout automatically
            notifier.notify(f.notifier, 3000)
            f.cancel(`unexpected state "${state}" (this shouldn't happen)`)
            break
    }
}

function findUpMedia(label) {
    if (!connection || !connection.up) {
        logger.debug('[SFU] findUpMedia: connection or connection.up not available')
        return null
    }

    for (let id in connection.up) {
        const stream = connection.up[id]
        if (stream && stream.label === label) {
            return id
        }
    }
    return null
}

function getMaxVideoThroughput() {
    switch ($s.media.upstream.id) {
        case 'lowest':
            return 150000
        case 'low':
            return 300000
        case 'normal':
            return 700000
        case 'unlimited':
            return null
        default:
            return 700000
    }
}

function mapRequest(what) {
    switch (what) {
        case '':
            return {}
        case 'audio':
            return {'': ['audio']}
        case 'screenshare-low':
            return {'': ['audio'], screenshare: ['audio', 'video-low']}
        case 'screenshare':
            return {'': ['audio'], screenshare: ['audio', 'video']}
        case 'everything-low':
            return {'': ['audio', 'video-low']}
        case 'everything':
            return {'': ['audio', 'video']}
        default:
            throw new Error(`Unknown value ${what} in request`)
    }
}

export function muteMicrophone(muted) {
    $s.devices.mic.enabled = !muted
    logger.debug(`microphone enabled: ${$s.devices.mic.enabled}`)

    if (!connection || !connection.up) {
        logger.warn('[SFU] muteMicrophone: connection or connection.up not available')
        return
    }

    for (let id in connection.up) {
        const glnStream = connection.up[id]
        if (!glnStream) continue

        if (glnStream.label === 'camera' && glnStream.stream) {
            try {
                glnStream.stream.getTracks().forEach((t) => {
                    if (t.kind === 'audio') {
                        t.enabled = !muted
                    }
                })
            } catch(error) {
                logger.warn(`[SFU] muteMicrophone: error updating tracks for stream ${id}: ${error}`)
            }
        }
    }
}

function newUpStream(_id, state) {
    // Validate connection exists
    if (!connection) {
        const error = new Error('SFU connection not available')
        logger.error('[SFU] newUpStream: connection not available')
        throw error
    }

    // Validate RTC configuration
    const rtcConfig = connection.getRTCConfiguration?.() || connection.rtcConfiguration
    if (!rtcConfig) {
        logger.warn('[SFU] newUpStream: RTC configuration not available, connection may not be ready')
    }

    let glnStream
    try {
        glnStream = connection.newUpStream(_id)
    } catch(error) {
        logger.error(`[SFU] newUpStream: failed to create upstream stream: ${error}`)
        throw error
    }

    if (!glnStream) {
        const error = new Error('Failed to create upstream stream')
        logger.error('[SFU] newUpStream: glnStream is null')
        throw error
    }

    let streamState = {
        aspectRatio: 4 / 3,
        direction: 'up',
        enlarged: false,
        hasAudio: false,
        hasVideo: false,
        id: glnStream.id,
        mirror: true,
        playing: false,
        settings: {audio: {}, video: {}},
        username: $s.profile.username,
        volume: {
            locked: false,
            value: 100,
        },
    }

    // Override properties; e.g. disable mirror for file streams.
    if (state) {
        Object.assign(streamState, state)
    }

    glnStream.onerror = (e) => {
        const errorMessage = String(e)
        logger.error(`[SFU] upstream stream ${glnStream.id} error: ${errorMessage}`)
        notifier.notify({message: `Stream error: ${errorMessage}`, type: 'error'})
        delUpMedia(glnStream)
    }
    glnStream.onabort = () => {
        logger.debug(`[SFU] upstream stream ${glnStream.id} aborted`)
        delUpMedia(glnStream)
    }
    glnStream.onnegotiationcompleted = () => {
        logger.debug(`[sfu] negotiation completed for stream ${glnStream.id}, adding to $s.streams`)
        logger.debug(
            `[sfu] streamState: id=${streamState.id}, direction=${streamState.direction}, ` +
            `hasAudio=${streamState.hasAudio}, hasVideo=${streamState.hasVideo}`,
        )

        try {
            const maxThroughput = getMaxVideoThroughput()
            setMaxVideoThroughput(glnStream, maxThroughput)

            // Use array assignment to ensure DeepSignal reactivity
            $s.streams = [...$s.streams, streamState]
            logger.debug(`[sfu] stream ${streamState.id} added to $s.streams (total: ${$s.streams.length})`)
        } catch(error) {
            logger.error(`[SFU] failed to add stream to state: ${error}`)
            delUpMedia(glnStream)
        }
    }

    return {glnStream, streamState}
}

// Process pending downstream streams that arrived before connection was ready
function processPendingDownstreamStreams() {
    const now = Date.now()
    // 5 second timeout for pending streams
    const timeout = 5000

    while (pendingDownstreamStreams.length > 0) {
        const pending = pendingDownstreamStreams.shift()
        if (!pending) continue

        // Skip if too old
        if (now - pending.timestamp > timeout) {
            logger.warn(`[SFU] Skipping stale pending downstream stream ${pending.stream.id}`)
            continue
        }

        logger.debug(`[SFU] Processing pending downstream stream ${pending.stream.id}`)
        onDownStream(pending.stream)
    }
}

/*
 * Process existing downstream streams from connection.down that may have been created
 * before onJoined completed (e.g., when reconnecting and server sends existing streams)
 */
function processExistingDownstreamStreams() {
    if (!connection || !connection.down) {
        return
    }

    logger.debug('[SFU] Checking for existing downstream streams in connection.down')
    const existingStreamIds = Object.keys(connection.down)
    logger.debug(`[SFU] Found ${existingStreamIds.length} existing downstream streams`)

    for (const streamId of existingStreamIds) {
        const stream = connection.down[streamId]
        if (!stream) {
            continue
        }

        // Check if we've already processed this stream
        const alreadyProcessed = $s.streams.find((s) => s.id === streamId)
        if (alreadyProcessed) {
            logger.debug(`[SFU] Stream ${streamId} already processed, skipping`)
            continue
        }

        // Check if this stream is already queued
        const alreadyQueued = pendingDownstreamStreams.some((p) => p.stream.id === streamId)
        if (alreadyQueued) {
            logger.debug(`[SFU] Stream ${streamId} already queued, skipping`)
            continue
        }

        // Check if stream already has handlers set (indicates it was processed via ondownstream callback)
        // This prevents overwriting handlers that components may have set up
        // Note: onDownStream sets onclose/onerror/onstatus, so if they exist, the stream was already processed
        if (stream.onclose || stream.onerror || stream.onstatus) {
            logger.debug(`[SFU] Stream ${streamId} already has handlers set (processed via ondownstream), skipping`)
            continue
        }

        logger.info(`[SFU] Processing existing downstream stream ${streamId} from connection.down`)
        onDownStream(stream)
    }
}

function onClose(code, reason) {
    // Reset connection state
    connectionReady = false
    streamRetryCounts.clear()
    pendingDownstreamStreams.length = 0

    const channelSlug = $s.sfu.channel.name || $s.chat.activeChannelSlug
    logger.debug('connection closed')
    events.emit('disconnected')
    $s.sfu.channel.connected = false

    // Update channel connection state
    if (channelSlug) {
        const sfuChannels = $s.sfu.channels as Record<string, {
            audio: boolean
            clientCount?: number
            comment?: string
            connected?: boolean
            description?: string
            locked?: boolean
            video: boolean
        }>
        if (sfuChannels[channelSlug]) {
            sfuChannels[channelSlug].connected = false
        }
    }

    // Clean up all upstream media
    if (connection && connection.up) {
        delUpMediaKind(null)
    }

    if (code !== 1000) {
        notifier.notify({message: `Socket close ${code}: ${reason}`, type: 'error'})
    }

    // app.router.push({name: 'conference-groups'}, {params: {groupId: $s.sfu.channel.name}})
}

function onDownStream(c) {
    logger.debug(`[sfu] onDownStream: received downstream stream ${c.id} from user ${c.username}`)

    // Validate connection is ready
    if (!connectionReady) {
        logger.warn(`[SFU] Downstream stream ${c.id} received before connection ready, queuing...`)
        pendingDownstreamStreams.push({stream: c, timestamp: Date.now()})
        return
    }

    // Validate RTC configuration
    const rtcConfig = connection?.getRTCConfiguration?.() || connection?.rtcConfiguration
    if (!rtcConfig) {
        logger.error(`[SFU] No RTC configuration available for downstream stream ${c.id}`)
        // Queue and retry after a delay
        pendingDownstreamStreams.push({stream: c, timestamp: Date.now()})
        setTimeout(() => {
            if (connection?.rtcConfiguration) {
                connectionReady = true
                processPendingDownstreamStreams()
            }
        }, 200)
        return
    }

    // Log WebRTC configuration state for debugging
    const upstreamCount = Object.keys(connection.up || {}).length
    logger.debug(`[sfu] onDownStream: RTC configuration available: yes, upstream streams: ${upstreamCount}`)

    /*
     * When other-end Firefox replaces a stream (e.g. toggles webcam),
     * the onDownStream method is called twice.
     */
    const existingStream = $s.streams.find((s) => s.id === c.id)
    if (!existingStream) {
        logger.debug(`[sfu] onDownStream: creating new stream object for ${c.id}`)
        const streamState = {
            aspectRatio: 4 / 3,
            direction: 'down',
            enlarged: false,
            hasAudio: false,
            hasVideo: false,
            id: c.id,
            mirror: true,
            playing: false,
            settings: {audio: {}, video: {}},
            username: c.username,
            volume: {
                locked: false,
                value: 100,
            },
        }
        // Use array assignment to ensure DeepSignal reactivity
        $s.streams = [...$s.streams, streamState]
        logger.debug(`[sfu] onDownStream: stream ${c.id} added to $s.streams (total: ${$s.streams.length})`)
    } else {
        logger.debug(`[sfu] onDownStream: stream ${c.id} already exists in $s.streams (replacement)`)
    }

    // Set handlers once (like original Galène gotDownStream)
    // Component should not overwrite these - they handle cleanup
    c.onclose = (replace) => {
        if (!replace) {
            streamRetryCounts.delete(c.id)
            delMedia(c.id)
        }
    }

    c.onerror = (error) => {
        const message = `[sfu] onDownStream: error on downstream stream ${c.id}: ${error || 'unknown error'}`
        logger.error(message)

        // Don't notify user for every error - only for persistent failures
        const retryCount = streamRetryCounts.get(c.id) || 0
        if (retryCount >= MAX_RETRIES) {
            notifier.notify({message: `Failed to connect to ${c.username}'s stream after ${MAX_RETRIES} attempts`, type: 'error'})
        }
    }

    // Set ondowntrack handler (like original Galène gotDownStream line 515-517)
    // Original Galène calls setMedia(c) when tracks arrive
    // Component will enhance this handler, but we set a base one here to handle early track arrival
    if (!c.ondowntrack) {
        c.ondowntrack = () => {
            // Base handler - component will enhance this
            // This ensures handler exists even if tracks arrive before component mounts
        }
    }

    // Set onstatus handler (like original Galène gotDownStream line 521-523)
    // Original Galène calls setMediaStatus(c) which checks ICE state and plays media
    // We can't call setMediaStatus here (component handles UI), but we handle retries
    c.onstatus = (status: string) => {
        // Handle ICE failures with retry logic (like original Galène protocol.js line 795-800)
        if (status === 'failed') {
            const retryCount = streamRetryCounts.get(c.id) || 0
            if (retryCount < MAX_RETRIES) {
                streamRetryCounts.set(c.id, retryCount + 1)
                const backoffDelay = Math.pow(2, retryCount) * 1000
                setTimeout(() => {
                    if (connection && connection.down && connection.down[c.id]) {
                        // Original Galène sends renegotiate on ICE failure (protocol.js line 796-799)
                        connection.send({id: c.id, type: 'renegotiate'})
                    } else {
                        streamRetryCounts.delete(c.id)
                    }
                }, backoffDelay)
            } else {
                streamRetryCounts.delete(c.id)
            }
        } else if (status === 'connected' || status === 'completed') {
            streamRetryCounts.delete(c.id)
        }
    }

}

async function onFileTransfer(f) {
    f.onevent = fileTransferEvent
    if (f.up) {
        f.notifier = notifier.notify({
            message: $t('user.action.share_file.share_confirm', {
                file: f.name,
                size: formatBytes(f.size),
                username: f.username,
            }),
            type: 'info',
        }, 0)
    } else {
        f.notifier = notifier.notify({
            message: $t('user.action.share_file.share_accept', {
                file: f.name,
                size: formatBytes(f.size),
                username: f.username,
            }),
            type: 'info',
        }, 0)
    }
}

async function onJoined(kind, group, permissions, status, data, message) {
    logger.debug(`[onJoined] ${kind}/${group}: ${message}`)
    let currentGroupData = currentGroup()
    let _permissions = {}
    switch (kind) {
        case 'fail':
            if (promiseConnect) {
                promiseConnect.reject(message)
                promiseConnect = null
            }

            /*
             * Closing the connection will trigger a 'leave' message,
             * which handles the accompanying UI flow.
             */
            connection.close()
            return
        case 'leave':
            disconnect()
            return
        case 'join':
            for (const permission of permissions) {
                _permissions[permission] = true
            }
            const permissionsState = $s.permissions as {op: boolean; present: boolean; record: boolean}
            permissionsState.op = (_permissions as Record<string, boolean>).op || false
            permissionsState.present = (_permissions as Record<string, boolean>).present || false
            permissionsState.record = (_permissions as Record<string, boolean>).record || false

            // Update connection state - group is the channel slug
            $s.sfu.channel.connected = true
            $s.sfu.channel.name = group

            // Initialize channel state if it doesn't exist
            const sfuChannels = $s.sfu.channels as Record<string, {
                audio: boolean
                clientCount?: number
                comment?: string
                connected?: boolean
                description?: string
                locked?: boolean
                video: boolean
            }>
            if (!sfuChannels[group]) {
                sfuChannels[group] = {audio: false, connected: false, video: false}
            }
            // Set channel as connected
            sfuChannels[group].connected = true

            // Mark connection as ready after RTC config is received
            if (connection && connection.rtcConfiguration) {
                connectionReady = true
                // Log RTC config for debugging (like original Galène would have)
                const iceServers = connection.rtcConfiguration.iceServers || []
                const hasStun = iceServers.some((s) => 
                    (Array.isArray(s.urls) ? s.urls : [s.urls]).some((u) => 
                        typeof u === 'string' && u.includes('stun:')
                    )
                )
                const hasTurn = iceServers.some((s) => 
                    (Array.isArray(s.urls) ? s.urls : [s.urls]).some((u) => 
                        typeof u === 'string' && (u.includes('turn:') || u.includes('turns:'))
                    )
                )
                logger.debug(`[SFU] Connection ready, RTC configuration received: ${iceServers.length} ICE servers (STUN: ${hasStun}, TURN: ${hasTurn})`)
                // Process any pending downstream streams
                processPendingDownstreamStreams()
                // Process any existing streams that may have been created before onJoined
                processExistingDownstreamStreams()
            } else {
                logger.warn('[SFU] Join successful but RTC configuration not yet available - server may not be sending it')
                // Wait a bit and check again (original Galène doesn't do this, but helps with timing)
                setTimeout(() => {
                    if (connection && connection.rtcConfiguration) {
                        connectionReady = true
                        logger.debug('[SFU] Connection ready (delayed), RTC configuration received')
                        processPendingDownstreamStreams()
                        // Process any existing streams that may have been created before onJoined
                        processExistingDownstreamStreams()
                    } else {
                        logger.error('[SFU] RTC configuration still not available after delay - this may cause ICE failures')
                    }
                }, 100)
            }

            if (promiseConnect) {
                promiseConnect.resolve(message)
                promiseConnect = null
            }
            break
        case 'change':

            for (const permission of permissions) {
                _permissions[permission] = true
            }
            const permissionsStateChange = $s.permissions as {op: boolean; present: boolean; record: boolean}
            permissionsStateChange.op = (_permissions as Record<string, boolean>).op || false
            permissionsStateChange.present = (_permissions as Record<string, boolean>).present || false
            permissionsStateChange.record = (_permissions as Record<string, boolean>).record || false

            if (status && status.locked) {
                currentGroupData.locked = true
                // A custom message is sent along:
                let personal = null
                if (status.locked !== true) personal = {group, message: status.locked}
                notifier.notify({message: `Group ${group} is locked`, type: 'info'})
            } else if (currentGroupData.locked) {
                currentGroupData.locked = false
                notifier.notify({message: `Group ${group} is unlocked`, type: 'info'})
            }

            logger.debug(`permissions: ${JSON.stringify(permissions)}`)
            if (kind === 'change') return
            break
        default:
            notifier.notify({message: 'Unknown join message', type: 'error'})
            connection.close()
            return
    }

    logger.debug(`request Galène media types: ${$s.media.accept.id}`)
    connection.request(mapRequest($s.media.accept.id))

    /*
     * Note: Stream restoration happens through two mechanisms:
     * 1. Automatic: The server sends stream offers for existing streams, which triggers
     *    gotOffer -> ondownstream -> onDownStream automatically.
     * 2. Manual fallback: After connection is ready, we check connection.down for any
     *    existing streams that weren't processed via ondownstream (e.g., when reconnecting).
     *    This ensures streams are restored even if the server doesn't send offers.
     */

    /*
     * Note: Removed automatic getUserMedia call on join
     * Media should only start when user explicitly clicks camera/mic buttons
     * The default enabled=true in state doesn't mean user wants media - it's just default state
     * User must explicitly enable camera/mic via button actions
     */
}

function onUser(id, kind) {
    let user = {...connection.users[id], id}
    let _permissions = {}
    if (user.permissions) {
        for (const permission of user.permissions) {
            _permissions[permission] = true
        }
    } else {
        user.permissions = {}
    }

    user.permissions = _permissions

    logger.debug(`[onUser] ${kind}/${id}/${user.username}`)

    if (kind === 'add') {
        /*
         * There might be a user with name 'RECORDING' that is an ordinary user;
         * only trigger the recording flag when it is a system user.
         */
        if (user.username === 'RECORDING' && user.permissions.system) {
            $s.sfu.channel.recording = user.id
            notifier.notify({message: `Recording started in ${$s.sfu.channel.name}`, type: 'info'})
        }

        if (id === $s.profile.id) {
            /*
             * Restore user data back from state and notify others about it.
             * Map $s.profile to Galene user data
             */
            user.data = $s.sfu.profile
            connection.userAction('setdata', connection.id, $s.sfu.profile)
        }

        /*
         * Note: Presence is managed by Pyrite presence system, not Galene
         * Galene users are stored in connection.users, not $s.users
         * $s.users is only for Pyrite presence list
         */
        events.emit('user', {action: 'add', user})
    } else if (kind === 'change') {
        if (id === $s.profile.id) {
            // Check permissions from Galene user data (connection.users), not $s.users
            const galeneUser = connection.users[id]
            const hadPresent = galeneUser?.permissions?.includes('present')
            const hadOp = galeneUser?.permissions?.includes('op')

            // Shutdown the local stream when the Present permission is taken away.
            if (hadPresent && !user.permissions.present) {
                delUpMedia(localGlnStream)
                $s.devices.cam.enabled = false
                $s.devices.mic.enabled = false

                notifier.notify({message: `Present permission removed in ${$s.sfu.channel.name}`, type: 'warning'})
            } else if (!hadPresent && user.permissions.present) {
                notifier.notify({message: 'Present permission granted', type: 'info'})
            } else if (hadOp && !user.permissions.op) {
                notifier.notify({message: 'Operator permission removed', type: 'warning'})
            } else if (!hadOp && user.permissions.op) {
                notifier.notify({message: 'Operator permission granted', type: 'info'})
            }

            // Update Galene-specific user data from server
            $s.sfu.profile = {...$s.sfu.profile, ...user.data}
            store.save()
        }

        /*
         * Note: Presence is managed by Pyrite presence system, not Galene
         * Galene users are stored in connection.users, not $s.users
         * $s.users is only for Pyrite presence list
         */
    } else if (kind === 'delete') {
        if (user.id === $s.sfu.channel.recording) {
            $s.sfu.channel.recording = false
            notifier.notify({message: `Recording stopped in ${$s.sfu.channel.name}`, type: 'info'})
        }

        /*
         * Note: Presence is managed by Pyrite presence system, not Galene
         * Galene users are stored in connection.users, not $s.users
         * $s.users is only for Pyrite presence list
         */
        events.emit('user', {action: 'del', user})
    }
}

function onUserMessage(id, dest, username, time, privileged, kind, message) {
    let source = username
    if (!source) {
        if (id) source = 'Anonymous'
        else source = 'System Message'
    }

    // Handle incoming user messages - log for now, can be extended later
    logger.debug(`[onUserMessage] ${source}: ${message}`)
    // Remote actions are only allowed for operators.
    if (!privileged) return

    switch (kind) {
    // Handle related actions here...
        case 'mute':
            muteMicrophone(true)
            break
    }
}

export function removeTrack(glnStream, kind) {
    const tracks = glnStream.stream.getTracks()
    tracks.forEach((track) => {
        if (track.kind === kind) {
            logger.debug(`stopping track ${track.id}`)
            track.stop()

            const streamState = $s.streams.find((s) => s.id === glnStream.id)
            streamState.hasVideo = false
        }
    })
}

async function setMaxVideoThroughput(c, bps) {
    const unlimitedRate = 1000000000

    let senders = c.pc.getSenders()
    for (let i = 0; i < senders.length; i++) {
        let s = senders[i]
        if (!s.track || s.track.kind !== 'video') continue
        let p = s.getParameters()
        if (!p.encodings) p.encodings = [{}]
        p.encodings.forEach((e) => {
            if (!e.rid || e.rid === 'h') e.maxBitrate = bps || unlimitedRate
        })
        logger.debug(`set video throughput at max ${bps} bps`)

        await s.setParameters(p)
    }
}

function stopUpMedia(c) {
    if (!c) {
        logger.warn('[SFU] stopUpMedia: stream object is null or undefined')
        return
    }

    if (!c.id) {
        logger.warn('[SFU] stopUpMedia: stream id is missing')
        return
    }

    logger.debug(`stopping up-stream ${c.id}`)

    // Stop tracks safely
    if (c.stream) {
        try {
            c.stream.getTracks().forEach((t) => {
                try {
                    t.stop()
                } catch(error) {
                    logger.warn(`[SFU] stopUpMedia: error stopping track: ${error}`)
                }
            })
        } catch(error) {
            logger.warn(`[SFU] stopUpMedia: error accessing stream tracks: ${error}`)
        }
    }

    // Remove from upMedia array safely
    if (c.label && $s.upMedia[c.label]) {
        const index = $s.upMedia[c.label].findIndex((i) => i.id === c.id)
        if (index !== -1) {
            // Use array assignment to ensure DeepSignal reactivity
            $s.upMedia[c.label] = $s.upMedia[c.label].filter((i) => i.id !== c.id)
        }
    }

    // Use array assignment to ensure DeepSignal reactivity
    $s.streams = $s.streams.filter((s) => s.id !== c.id)
}
