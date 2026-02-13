/**
 * Pyrite TypeScript types
 * Note: API request/response types are available from '../lib/schemas/index.ts'
 * These types are frontend-specific state types for DeepSignal state management
 */
import type {CommonState} from '@garage44/common/types'

export interface Channel {
    created_at: number
    description: string
    id: number
    is_default: number
    member_count?: number
    name: string
    slug: string
    unread_count?: number
}

export interface PyriteState extends CommonState {
    admin: {
        authenticated: boolean | null
        group: Record<string, unknown> | null
        groups: Array<Record<string, unknown>>
        permission: boolean
        user: Record<string, unknown> | null
        users: Array<Record<string, unknown>>
    }
    channels: Channel[]
    chat: {
        activeChannelSlug: string | null
        channel: string
        channels: {
            [key: string]: {
                id: string
                members?: Record<string, {avatar: string}>
                messages: Array<Record<string, unknown>>
                name?: string
                typing?: {
                    [userId: string]: {
                        timestamp: number
                        userId: string | number
                        username: string
                    }
                }
                unread: number
            }
        }
        emoji: {
            active: boolean
            list?: Array<unknown>
            lookup: Record<string, unknown>
        }
        message: string
        // Global users map: userId -> {username, avatar, status?}
        users?: Record<string, {avatar: string; status?: 'online' | 'offline' | 'busy'; username: string}>
        width: number
    }
    devices: {
        audio: {
            enabled: boolean
            options: Array<{id: string; name: string}>
            selected: {id: string | null; name: string}
        }
        cam: {
            enabled: boolean
            options: Array<{id: string; name: string}>
            resolution: {id: string; name: string}
            selected: {id: string | null; name: string}
        }
        mic: {
            enabled: boolean
            options: Array<{id: string; name: string}>
            selected: {id: string | null; name: string}
        }
    }
    env: {
        ctrlKey: boolean
        isBrowser?: boolean
        isFirefox: boolean
        isSafari?: boolean
        layout: 'desktop' | 'mobile' | 'tablet'
        shiftKey: boolean
        ua?: string
        url: string
    }
    files: {
        playing: Array<unknown>
        upload: Array<unknown>
    }
    language: {id: string | null}
    language_ui: {
        i18n: Record<string, Record<string, string>>
        options: Array<{id: string; name: string}>
        selection: string
    }
    loading: boolean
    login: {
        autofocus: boolean
    }
    media: {
        accept: {id: string; name: string}
        upstream: {id: string; name: string}
    }
    mediaReady: boolean
    notifications: Array<Record<string, unknown>>
    panels: CommonState['panels'] & {
        chat?: {
            collapsed: boolean
            width?: number
        }
        conferenceMode?: boolean
        context: CommonState['panels']['context'] & {
            expanded?: boolean
        }
    }
    permissions: {
        op: boolean
        present: boolean
        record: boolean
    }
    sfu: {
        channel: {
            'allow-anonymous': boolean
            comment: string
            connected: boolean
            contact: string
            locked: boolean
            muted: boolean
            name: string
            recording: boolean
        }
        channels: Record<string, {
            audio: boolean
            clientCount?: number
            comment?: string
            connected?: boolean
            description?: string
            locked?: boolean
            video: boolean
        }>
        profile: {
            // Galene-specific user data
            availability: {id: string; name: string}
            mic: boolean
            raisehand: boolean
        }
    }
    streams: Array<{[key: string]: unknown; id: string; username: string}>
    theme: 'light' | 'dark' | 'system'
    upMedia: {
        audio: Array<unknown>
        camera: Array<unknown>
        screenshare: Array<unknown>
        video: Array<unknown>
    }
    users: Array<Record<string, unknown>>
}
