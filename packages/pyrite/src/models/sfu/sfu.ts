// Copyright (c) 2020 by Juliusz Chroboczek.

// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.  IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.

import * as _protocol from './protocol.ts'
import _commands from './commands.ts'
import {notifier, $t} from '@garage44/common/app'
import {$s, store} from '@/app'
import {events} from '@garage44/common/app'
import {logger} from '@garage44/common/lib/logger'
import {formatBytes} from '@garage44/common/lib/utils'
import {localStream, getUserMedia, removeLocalStream} from '@/models/media'
import {currentGroup} from '@/models/group'

// Note: Presence is managed by Pyrite presence system only
// Galene SFU no longer modifies $s.users - it only manages connection.users

export const protocol = _protocol
export const commands = _commands

export let connection
export let file

let localGlnStream
let promiseConnect: {reject: (reason: string) => void; resolve: (value: string) => void} | null = null

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
    let stream = null
    try {
        if (!('getDisplayMedia' in navigator.mediaDevices))
            throw new Error('Your browser does not support screen sharing')
        stream = await (navigator.mediaDevices as any).getDisplayMedia({audio: true, video: true})
    } catch (e) {
        notifier.notify({message: String(e), type: 'error'})
        return
    }

    const {glnStream, streamState} = newUpStream(null, {
        direction: 'up',
        mirror: false,
    })
    glnStream.label = 'screenshare'
    $s.upMedia[glnStream.label].push(glnStream.id)
    glnStream.stream = stream

    stream.getTracks().forEach((t) => {
        if (t.kind === 'audio') {
            streamState.hasAudio = true
        } else if (t.kind === 'video') {
            streamState.hasVideo = true
        }
        glnStream.pc.addTrack(t, stream)
        // Screensharing was stopped; e.g. through browser ui.
        t.onended = () => {
            delUpMedia(glnStream)
        }
    })

    return glnStream
}

export async function addUserMedia() {
    logger.debug(`[sfu] addUserMedia called`)

    if (!localStream) {
        logger.error(`[sfu] addUserMedia: localStream is null`)
        throw new Error('localStream is required for addUserMedia')
    }

    if (!connection) {
        logger.error(`[sfu] addUserMedia: connection is null`)
        throw new Error('SFU connection is required for addUserMedia')
    }

    let localStreamId = findUpMedia('camera')
    let oldStream = localStreamId && connection.up[localStreamId]

    if (oldStream) {
        logger.debug(`[sfu] removing old camera stream ${localStreamId}`)
        stopUpMedia(oldStream)
    }

    logger.debug(`[sfu] creating new upstream stream`)
    const {glnStream, streamState} = newUpStream(localStreamId, {
        direction: 'up',
        mirror: false,
    })
    glnStream.label = 'camera'
    glnStream.stream = localStream
    localGlnStream = glnStream

    logger.debug(`[sfu] upstream stream created: id=${glnStream.id}, label=${glnStream.label}`)
    $s.upMedia[glnStream.label].push(glnStream.id)

    logger.debug(`[sfu] adding tracks to peer connection: ${localStream.getTracks().map(t => t.kind).join(', ')}`)
    localStream.getTracks().forEach((t) => {
        if (t.kind === 'audio') {
            streamState.hasAudio = true
            if (!$s.devices.mic.enabled) {
                logger.info(`[sfu] muting local audio stream track`)
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
    logger.debug(`[sfu] waiting for negotiation to complete (stream will be added to $s.streams)`)

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

    // Use credentials from parameters or fall back to profile state
    const sfuUsername = username || $s.profile.username || ''
    const sfuPassword = password || $s.profile.password || ''

    logger.info(`[SFU] Connecting with username: ${sfuUsername ? '***' : '(empty)'}`)

    // Create the join promise BEFORE setting up handlers
    // This ensures promiseConnect is available when onJoined is called
    let joinResolve: (value: string) => void
    let joinReject: (reason: string) => void
    const joinPromise = new Promise<string>((resolve, reject) => {
        joinResolve = resolve
        joinReject = reject
    })
    promiseConnect = {reject: joinReject!, resolve: joinResolve!}

    connection = new protocol.ServerConnection()

    connection.onconnected = () => {
        logger.info('[connected] connected to Galène websocket')
        $s.profile.id = connection.id

        // Get channel slug from state (active channel) or from current channel
        // Channel slug directly matches Galene group name (1:1 mapping)
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

    // Connect through Pyrite WebSocket proxy at /sfu
    // The proxy handles routing to Galene backend
    const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/sfu`
    logger.info(`[SFU] Connecting to Galene through proxy: ${url}`)

    try {
        await connection.connect(url)
        // Share initial status with other users.
        // Map $s.profile to Galene user data
        connection.userAction('setdata', connection.id, $s.sfu.profile)
    } catch (e) {
        logger.error('[SFU] Failed to connect to Galene:', e)
        // Clean up promiseConnect on connection error
        promiseConnect = null
        notifier.notify({
            message: e.message ? e.message : "Couldn't connect to " + url,
            type: 'error',
        })
        throw e
    }

    // Return the promise that will resolve/reject when onJoined is called
    return joinPromise
}

export function delLocalMedia() {
    // Find and disconnect screen share stream by label
    const screenShareId = findUpMedia('screenshare')
    if (screenShareId && connection.up[screenShareId]) {
        logger.info('disconnect screen share stream')
        delUpMedia(connection.up[screenShareId])
    }
    if (!localStream) return

    logger.info('delete local media share media')
    removeLocalStream()
}

export function delMedia(id) {
    const delStreamIndex = $s.streams.findIndex((i) => i.id === id)
    if (delStreamIndex === -1) return

    const delStream = $s.streams[delStreamIndex]
    logger.info(`[delMedia] remove stream ${delStream.id} from stream state (${delStreamIndex})`)
    // Use array assignment to ensure DeepSignal reactivity
    $s.streams = $s.streams.filter((s) => s.id !== id)
}

export function delUpMedia(c) {
    stopUpMedia(c)
    delMedia(c.id)

    c.close()
    delete(connection.up[c.id])
}

export function delUpMediaKind(label) {
    logger.debug(`remove all up media with label: ${label}`)
    for (let id in connection.up) {
        const c = connection.up[id]
        if (label && c.label !== label) {
            continue
        }
        c.close()
        delMedia(id)
        delete(connection.up[id])
        logger.debug(`remove up media stream: ${id}`)
        $s.upMedia[label].splice($s.upMedia[label].indexOf(id), 1)
    }
}

export function disconnect() {
    const channelSlug = $s.sfu.channel.name || $s.chat.activeChannelSlug
    logger.info(`disconnecting from group ${channelSlug}`)

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
    for (let id in connection.up) {
        if (connection.up[id].label === label)
            return id
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
            return {'': ['audio'], screenshare: ['audio','video-low']}
        case 'screenshare':
            return {'': ['audio'], screenshare: ['audio','video']}
        case 'everything-low':
            return {'': ['audio','video-low']}
        case 'everything':
            return {'': ['audio','video']}
        default:
            throw new Error(`Unknown value ${what} in request`)
    }
}

export function muteMicrophone(muted) {
    $s.devices.mic.enabled = !muted
    logger.debug(`microphone enabled: ${$s.devices.mic.enabled}`)
    for (let id in connection.up) {
        const glnStream = connection.up[id]
        if (glnStream.label === 'camera') {
            glnStream.stream.getTracks().forEach((t) => {
                if (t.kind === 'audio') {
                    t.enabled = !muted
                }
            })
        }
    }
}

function newUpStream(_id, state) {
    const glnStream = connection.newUpStream(_id)

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
        notifier.notify({message: String(e), type: 'error'})
        delUpMedia(glnStream)
    }
    glnStream.onabort = () => {
        delUpMedia(glnStream)
    }
    glnStream.onnegotiationcompleted = () => {
        logger.debug(`[sfu] negotiation completed for stream ${glnStream.id}, adding to $s.streams`)
        logger.debug(`[sfu] streamState: id=${streamState.id}, direction=${streamState.direction}, hasAudio=${streamState.hasAudio}, hasVideo=${streamState.hasVideo}`)

        const maxThroughput = getMaxVideoThroughput()
        setMaxVideoThroughput(glnStream, maxThroughput)

        // Use array assignment to ensure DeepSignal reactivity
        $s.streams = [...$s.streams, streamState]
        logger.debug(`[sfu] stream ${streamState.id} added to $s.streams (total: ${$s.streams.length})`)
    }

    return {glnStream, streamState}
}

function onClose(code, reason) {
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

    delUpMediaKind(null)

    if (code !== 1000) {
        notifier.notify({message: `Socket close ${code}: ${reason}`, type: 'error'})
    }

    // app.router.push({name: 'conference-groups'}, {params: {groupId: $s.sfu.channel.name}})
}

function onDownStream(c) {
    logger.debug(`[sfu] onDownStream: received downstream stream ${c.id} from user ${c.username}`)

    // When other-end Firefox replaces a stream (e.g. toggles webcam),
    // the onDownStream method is called twice.
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

    c.onclose = (replace) => {
        if (!replace) {
            logger.debug(`[sfu] onDownStream: stream ${c.id} closed`)
            delMedia(c.id)
        } else {
            logger.debug(`[sfu] onDownStream: stream ${c.id} replaced`)
        }
    }

    c.onerror = () => {
        const message = `[sfu] onDownStream: error on downstream stream ${c.id}`
        logger.error(message)
        notifier.notify({message, type: 'error'})
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

            // Closing the connection will trigger a 'leave' message,
            // which handles the accompanying UI flow.
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
                if (status.locked !== true) personal = {group, message:status.locked}
                notifier.notify({message: `Group ${group} is locked`, type: 'info'})
            } else if (currentGroupData.locked) {
                currentGroupData.locked = false
                notifier.notify({message: `Group ${group} is unlocked`, type: 'info'})
            }

            logger.debug(`permissions: ${JSON.stringify(permissions)}`)
            if (kind === 'change')
                return
            break
        default:
            notifier.notify({message: 'Unknown join message', type: 'error'})
            connection.close()
            return
    }

    logger.debug(`request Galène media types: ${$s.media.accept.id}`)
    connection.request(mapRequest($s.media.accept.id))

    // Note: Removed automatic getUserMedia call on join
    // Media should only start when user explicitly clicks camera/mic buttons
    // The default enabled=true in state doesn't mean user wants media - it's just default state
    // User must explicitly enable camera/mic via button actions
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

    if (kind ==='add') {
        // There might be a user with name 'RECORDING' that is an ordinary user;
        // only trigger the recording flag when it is a system user.
        if (user.username === 'RECORDING' && user.permissions.system) {
            $s.sfu.channel.recording = user.id
            notifier.notify({message: `Recording started in ${$s.sfu.channel.name}`, type: 'info'})
        }

        if (id === $s.profile.id) {
            // Restore user data back from state and notify others about it.
            // Map $s.profile to Galene user data
            user.data = $s.sfu.profile
            connection.userAction('setdata', connection.id, $s.sfu.profile)
        }

        // Note: Presence is managed by Pyrite presence system, not Galene
        // Galene users are stored in connection.users, not $s.users
        // $s.users is only for Pyrite presence list
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

        // Note: Presence is managed by Pyrite presence system, not Galene
        // Galene users are stored in connection.users, not $s.users
        // $s.users is only for Pyrite presence list
    } else if (kind === 'delete') {
        if (user.id === $s.sfu.channel.recording) {
            $s.sfu.channel.recording = false
            notifier.notify({message: `Recording stopped in ${$s.sfu.channel.name}`, type: 'info'})
        }

        // Note: Presence is managed by Pyrite presence system, not Galene
        // Galene users are stored in connection.users, not $s.users
        // $s.users is only for Pyrite presence list
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
        if (!s.track || s.track.kind !== 'video')
            continue
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
    logger.debug(`stopping up-stream ${c.id}`)
    c.stream.getTracks().forEach((t) => t.stop())

    $s.upMedia[c.label].splice($s.upMedia[c.label].findIndex((i) => i.id === c.id), 1)
    // Use array assignment to ensure DeepSignal reactivity
    $s.streams = $s.streams.filter((s) => s.id !== c.id)
}
