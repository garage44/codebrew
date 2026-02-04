import ChatMessage from './message'
import classnames from 'classnames'
import {useEffect, useRef, useCallback} from 'preact/hooks'
import {effect} from '@preact/signals'
import {Icon} from '@garage44/common/components'
import Emoji from './emoji'
import {logger} from '@garage44/common/app'
import {$s} from '@/app'
import {sendMessage as sendChatMessage, sendTypingIndicator} from '@/models/chat'

const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
        e.preventDefault()
    }
}

import type {Channel} from '../../types'

interface ChannelChatProps {
    channel?: Channel
    channelSlug: string
}

export default function ChannelChat({channel, channelSlug}: ChannelChatProps) {
    const viewRef = useRef<HTMLDivElement>(null)
    const messagesRef = useRef<HTMLDivElement>(null)
    const chatInputRef = useRef<HTMLTextAreaElement>(null)
    const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null)
    const lastTypingSentRef = useRef<number>(0)

    /*
     * Get current channel from state - access directly for DeepSignal reactivity
     * Access $s.channels in render so Preact tracks it reactively
     */
    const currentChannel = channel || $s.channels.find((c) => c.slug === channelSlug)

    // Only log when channel is found to avoid spam
    useEffect(() => {
        if (currentChannel) {
            logger.debug(`[ChannelChat] Looking for channel ${channelSlug}, found:`, currentChannel)
        }
    }, [currentChannel, channelSlug])

    // Get channel key - needed for accessing messages (slug is the key now)
    const channelKey = channelSlug

    /*
     * Access messages directly from DeepSignal - this is reactive
     * Accessing $s.chat.channels[channelKey] in render makes it reactive
     */
    const channelData = $s.chat.channels[channelKey]
    const messages = channelData?.messages || []
    const messageCount = messages.length

    // Format message for sending (DeepSignal reactivity handled automatically)
    const formattedMessage = $s.chat.message.trim()

    const addEmoji = (e: MouseEvent, emoji: string) => {
        const message = $s.chat.message.split('')
        const caretPosition = chatInputRef.current?.selectionStart || 0
        if (caretPosition >= 0) {
            message.splice(caretPosition, 0, emoji)
        }
        $s.chat.message = message.join('')

        if (!(e as MouseEvent & {ctrlKey?: boolean}).ctrlKey) {
            $s.chat.emoji.active = false
        }
    }

    const sendMessage = async(e: KeyboardEvent | MouseEvent) => {
        if (e instanceof KeyboardEvent && !(e.key === 'Enter' && !e.ctrlKey && !e.shiftKey && !e.metaKey)) {
            // ctrl/shift/meta +enter is next line.
            $s.chat.message += '\r\n'
            return false
        }

        // Don't send empty messages
        if (!formattedMessage) {
            logger.debug('[ChannelChat] Attempted to send empty message')
            return
        }

        logger.debug('[ChannelChat] Sending message:', formattedMessage)

        // Stop typing indicator and clear timeout
        if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current)
            typingTimeoutRef.current = null
        }
        await sendTypingIndicator(false, channelSlug)

        // Set the active channel before sending
        $s.chat.activeChannelSlug = channelSlug
        sendChatMessage(formattedMessage)
        $s.chat.message = ''
        $s.chat.emoji.active = false
    }

    const handleKeyUp = (e: KeyboardEvent) => {
        if (e.key === 'Enter') {
            sendMessage(e)
        }
    }

    // Check if user is near bottom of chat (within 100px)
    const isNearBottom = useCallback(() => {
        if (!messagesRef.current) return false
        const {clientHeight, scrollHeight, scrollTop} = messagesRef.current
        return scrollHeight - scrollTop - clientHeight < 100
    }, [])

    // Scroll to bottom immediately
    const scrollToBottom = useCallback(() => {
        if (!messagesRef.current) return
        // Use scrollIntoView for smoother scrolling, or direct scrollTop for immediate
        const messagesContainer = messagesRef.current
        messagesContainer.scrollTop = messagesContainer.scrollHeight
    }, [])

    /*
     * Watch channel messages directly from state using signal effect
     * This automatically tracks DeepSignal changes and triggers immediately
     */
    useEffect(() => {
        const channelData = $s.chat.channels[channelKey]
        if (!channelData) return

        // Use effect from @preact/signals to watch signal changes
        const unsubscribe = effect(() => {
            // Access messages to track signal reactivity
            const msgs = channelData.messages || []
            const msgCount = msgs.length

            if (messagesRef.current && msgCount > 0 && isNearBottom()) {
                // Scroll immediately - signal change triggers this effect
                scrollToBottom()
                // Also scroll after next frame to catch any DOM layout updates
                requestAnimationFrame(scrollToBottom)
            }
        })

        return unsubscribe
    }, [channelKey, isNearBottom, scrollToBottom])

    // Initial scroll on mount
    useEffect(() => {
        if (messagesRef.current && messageCount > 0) {
            messagesRef.current.scrollTop = messagesRef.current.scrollHeight
        }
    }, [messageCount])

    // Set active channel when component mounts
    useEffect(() => {
        $s.chat.activeChannelSlug = channelSlug
        // Pre-create channel entry if it doesn't exist for immediate UI feedback
        const channelKey = channelSlug
        if (!$s.chat.channels[channelKey]) {
            $s.chat.channels[channelKey] = {
                id: channelKey,
                messages: [],
                typing: {},
                unread: 0,
            }
        } else if (!$s.chat.channels[channelKey].typing) {
            $s.chat.channels[channelKey].typing = {}
        }
    }, [channelSlug])

    // Cleanup typing timeout on unmount
    useEffect(() => {
        return () => {
            if (typingTimeoutRef.current) {
                clearTimeout(typingTimeoutRef.current)
            }
            // Stop typing indicator when leaving channel
            sendTypingIndicator(false, channelSlug)
        }
    }, [channelSlug])

    if (!currentChannel) {
        return (
            <div class='c-channel-chat'>
                <div class='channel-not-found'>
                    <Icon className='icon icon-l' name='error' />
                    <h2>Channel not found</h2>
                    <p>The channel you&apos;re looking for doesn&apos;t exist or you don&apos;t have access to it.</p>
                </div>
            </div>
        )
    }

    return (
<div class={classnames('c-channel-chat', {[$s.env.layout]: true})} ref={viewRef}>
        {/* Channel Header */}
        <div class='channel-header'>
            <Icon className='icon icon-s' name='chat' />
            <h1>{currentChannel.name}</h1>
            {currentChannel?.description &&
                <p class='channel-description'>{currentChannel.description}</p>}
        </div>

        {/* Emoji Picker */}
        {$s.chat.emoji.active && <Emoji onselect={addEmoji} />}

        {/* Messages */}
        <div class='messages scroller' ref={messagesRef}>
            {(() => {
                // Access messages directly in render for DeepSignal reactivity
                const channelData = $s.chat.channels[channelKey]
                const msgs = channelData?.messages || []
                const sorted = msgs.length > 0 ? [...msgs].toSorted((a, b) => {
                    const timeA = (a as {time?: number}).time ?? 0
                    const timeB = (b as {time?: number}).time ?? 0
                    return timeA - timeB
                }) : []

                // Get typing indicators for this channel
                const typingUsers = channelData?.typing ? Object.values(channelData.typing) : []

                /*
                 * Filter out current user's typing indicator and stale indicators (older than 5 seconds)
                 * Also enrich with username from global users if missing
                 */
                const otherTypingUsers = typingUsers
                    .map((t: {timestamp: number; userId: string | number; username: string}) => {
                        // Use username from global users if not provided
                        if (!t.username && $s.chat.users?.[String(t.userId)]) {
                            t.username = $s.chat.users[String(t.userId)].username
                        }
                        return t
                    })
                    .filter((t: {timestamp: number; userId: string | number; username: string}) => {
                        const isStale = Date.now() - t.timestamp > 5000
                        const isCurrentUser = $s.profile.id && String(t.userId) === String($s.profile.id)
                        return !isStale && !isCurrentUser
                    })

                if (sorted.length === 0 && otherTypingUsers.length === 0) {
                    return (
                        <div class='no-messages'>
                            <Icon className='icon icon-l' name='chat' />
                            <p>No messages yet. Start the conversation!</p>
                        </div>
                    )
                }

                return (
                    <>
                        {sorted.map((message, index) => {
                            const msg = message as {kind: string; message: string; nick?: string; time: number; user_id?: string}
                            return <ChatMessage channelSlug={channelSlug} key={index} message={msg} />
                        })}
                        {otherTypingUsers.length > 0 &&
                            <div class='typing-indicator'>
                                {otherTypingUsers.length === 1 ?
                                    <span class='typing-text'>
                                        <strong>{(otherTypingUsers[0] as {username: string}).username}</strong>
{' '}
is typing...
                                    </span> :
                                    <span class='typing-text'>
                                        {otherTypingUsers.length}
{' '}
people are typing...
                                    </span>}
                            </div>}
                    </>
                )
            })()}
        </div>

        {/* Message Input */}
        <div class='send'>
            <div class='send-input'>
                <textarea
                    autofocus={true}
                    onInput={(e) => {
                        $s.chat.message = (e.target as HTMLTextAreaElement).value
                        // Send typing indicator (debounced)
                        const now = Date.now()
                        if (now - lastTypingSentRef.current > 1000) {
                        // Send typing indicator every 1 second max
                            sendTypingIndicator(true, channelSlug)
                            lastTypingSentRef.current = now
                        }

                        // Clear existing timeout
                        if (typingTimeoutRef.current) {
                            clearTimeout(typingTimeoutRef.current)
                        }

                        // Set timeout to stop typing indicator after 3 seconds of inactivity
                        typingTimeoutRef.current = setTimeout(() => {
                            sendTypingIndicator(false, channelSlug)
                        }, 3000)
                    }}
                    onKeyDown={handleKeyDown}
                    onKeyUp={handleKeyUp}
                    placeholder={`Message #${currentChannel.name}`}
                    ref={chatInputRef}
                    value={$s.chat.message}
                />
            </div>


            <div class='chat-actions'>
                <button
                    class={classnames('btn btn-menu', {
                        active: $s.chat.emoji.active,
                    })}
                    onClick={() => $s.chat.emoji.active = !$s.chat.emoji.active}
                >
                    😼
                </button>
                <button
                    class='btn btn-menu'
                    disabled={formattedMessage === ''}
                    onClick={sendMessage}
                >
                    <Icon className='icon icon-s' name='send' />
                </button>
            </div>
        </div>

</div>
    )
}
