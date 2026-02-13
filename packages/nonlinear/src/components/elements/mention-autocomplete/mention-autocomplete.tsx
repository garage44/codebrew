import {Autocomplete, type AutocompleteItem} from '@garage44/common/components'
import {Icon} from '@garage44/common/components'

import {$s} from '@/app'

import {AgentAvatar} from '../agent-avatar/agent-avatar'

interface MentionAutocompleteProps {
    content: string
    onContentChange: (content: string) => void
    textareaRef: {current: HTMLTextAreaElement | null}
}

interface MentionData {
    agent?: {
        displayName: string
        id: string
        name: string
        type: 'prioritizer' | 'developer' | 'reviewer'
    }
    displayName: string
    name: string
    type: 'agent' | 'human'
}

export function MentionAutocomplete({content, onContentChange, textareaRef}: MentionAutocompleteProps) {
    // Get all available mentions (agents + current user)
    const getAllMentions = (): Array<AutocompleteItem<MentionData>> => {
        const mentions: Array<AutocompleteItem<MentionData>> = []

        // Add agents
        for (const agent of $s.agents) {
            if (agent.enabled === 1) {
                // Default avatars for agent types
                const defaultAvatars: Record<'planner' | 'developer' | 'reviewer', string> = {
                    developer: 'placeholder-3.png',
                    planner: 'placeholder-2.png',
                    reviewer: 'placeholder-4.png',
                }
                const _avatar = agent.avatar || defaultAvatars[agent.type] || 'placeholder-1.png'

                mentions.push({
                    data: {
                        agent: {
                            displayName: agent.display_name || agent.name,
                            id: agent.id,
                            name: agent.name,
                            type: ((agent.type as string | undefined) === 'prioritizer'
                                ? 'prioritizer'
                                : agent.type === 'planner'
                                  ? 'planner'
                                  : agent.type || 'developer') as 'developer' | 'prioritizer' | 'reviewer',
                        },
                        displayName: agent.display_name || agent.name,
                        name: agent.name,
                        type: 'agent',
                    },
                    id: agent.id,
                })
            }
        }

        // Add current user
        if ($s.profile.username) {
            mentions.push({
                data: {
                    displayName: $s.profile.displayName || $s.profile.username,
                    name: $s.profile.username,
                    type: 'human',
                },
                id: $s.profile.username,
            })
        }

        return mentions
    }

    const items = getAllMentions()

    return (
        <Autocomplete<MentionData>
            content={content}
            filterItems={(items, query) => {
                return items.filter((item) => {
                    const name = item.data?.name?.toLowerCase() || ''
                    const displayName = item.data?.displayName?.toLowerCase() || ''
                    return name.includes(query) || displayName.includes(query)
                })
            }}
            getInsertText={(item) => `@${item.data?.name || ''}`}
            inputRef={textareaRef}
            items={items}
            onContentChange={onContentChange}
            renderItem={(item, _isSelected) => {
                if (item.data?.type === 'agent' && item.data?.agent) {
                    return (
                        <div class='mention-agent' style={{pointerEvents: 'none'}}>
                            <AgentAvatar
                                agent={{
                                    avatar:
                                        (
                                            item.data.agent as {
                                                avatar?: string
                                                display_name?: string
                                                displayName?: string
                                                id: string
                                                name: string
                                                status?: string
                                                type?: string
                                            }
                                        ).avatar || 'placeholder-1.png',
                                    displayName:
                                        (
                                            item.data.agent as {
                                                display_name?: string
                                                displayName?: string
                                                name: string
                                            }
                                        ).displayName ||
                                        (
                                            item.data.agent as {
                                                display_name?: string
                                                name: string
                                            }
                                        ).display_name ||
                                        item.data.agent.name,
                                    id: item.data.agent.id,
                                    status: ((item.data.agent as {status?: string}).status || 'idle') as
                                        | 'idle'
                                        | 'working'
                                        | 'error'
                                        | 'offline',
                                    type: (((item.data.agent as {type?: string}).type as string) === 'prioritizer'
                                        ? 'planner'
                                        : (item.data.agent as {type?: string}).type) as 'developer' | 'planner' | 'reviewer',
                                }}
                                size='d'
                            />
                            <span class='agent-name'>{item.data.agent.displayName || item.data.agent.name}</span>
                        </div>
                    )
                }
                return (
                    <div class='mention-user' style={{pointerEvents: 'none'}}>
                        <Icon name='user' size='d' type='info' />
                        <span>{item.data?.displayName || item.data?.name || 'Unknown'}</span>
                    </div>
                )
            }}
            triggerPattern='@'
        />
    )
}
