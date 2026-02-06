import {
    persistentState as commonPersistantState,
    volatileState as commonVolatileState,
} from '@garage44/common/lib/state'
import {mergeDeep} from '@garage44/common/lib/utils'

// Pyrite state management using DeepSignal pattern
import type {PyriteState} from '../types.ts'

export const persistantState = mergeDeep({
    chat: {
        emoji: {
            list: [],
        },
    },
    devices: {
        audio: {
            enabled: true,
            options: [],
            selected: {id: null, name: ''},
        },
        cam: {
            enabled: true,
            options: [],
            resolution: {id: 'default', name: ''},
            selected: {id: null, name: ''},
        },
        mic: {
            enabled: true,
            options: [],
            selected: {id: null, name: ''},
        },
    },
    loading: true,
    media: {
        accept: {id: 'everything', name: ''},
        upstream: {id: 'normal', name: ''},
    },
    panels: {
        chat: {
            collapsed: false,
            width: 375,
        },
        context: {
            collapsed: false,
            expanded: false,
            width: 350,
        },
        conferenceMode: false,
    },
}, commonPersistantState as Record<string, unknown>) as Partial<PyriteState>

// State is always overwritten by these properties
export const volatileState = mergeDeep({
    admin: {
        authenticated: null,
        group: null,
        groups: [],
        permission: false,
        user: null,
        users: [],
    },
    channels: [],
    chat: {
        activeChannelSlug: null,
        channel: '',
        channels: {
            main: {
                id: 'main',
                messages: [],
                unread: 0,
            },
        },
        emoji: {
            active: false,
            lookup: {},
        },
        message: '',
        width: 375,
    },
    files: {
        playing: [],
        upload: [],
    },
    login: {
        autofocus: true,
    },
    mediaReady: false,
    notifications: [],
    permissions: {
        op: false,
        // Assume present permission before connecting,
        // so send can be modified in Settings.
        present: true,
        record: false,
    },
    sfu: {
        channel: {
            'allow-anonymous': false,
            comment: '',
            connected: false,
            contact: '',
            locked: false,
            muted: false,
            name: '',
            recording: false,
        },
        channels: {} as Record<string, {
            audio: boolean
            clientCount?: number
            comment?: string
            connected?: boolean
            description?: string
            locked?: boolean
            video: boolean
        }>,
        profile: {
            // Galene-specific user data - synced from $s.profile
            availability: {id: 'available', name: 'Available'},
            mic: true,
            raisehand: false,
        },
    },
    streams: [],
    upMedia: {
        audio: [],
        camera: [],
        screenshare: [],
        video: [],
    },
    users: [],
    panels: {
        chat: {
            collapsed: false,
            width: 375,
        },
        context: {
            collapsed: false,
            expanded: false,
            width: 350,
        },
        conferenceMode: false,
    },
}, commonVolatileState) as Partial<PyriteState>
