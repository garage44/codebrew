import {Autocomplete, type AutocompleteItem} from '@garage44/common/components'
import {AgentAvatar} from '../agent-avatar/agent-avatar'
import {Icon} from '@garage44/common/components'
import {$s} from '@/app'

interface MentionAutocompleteProps {
    content: string
    onContentChange: (content: string) => void
    textareaRef: {current: HTMLTextAreaElement | null}
}

interface MentionData {
    name: string
    displayName: string
    type: 'agent' | 'human'
    agent?: {
        id: string
        name: string
        displayName: string
        type: 'prioritizer' | 'developer' | 'reviewer'
    }
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
                    planner: 'placeholder-2.png',
                    developer: 'placeholder-3.png',
                    reviewer: 'placeholder-4.png',
                }
                const avatar = agent.avatar || defaultAvatars[agent.type] || 'placeholder-1.png'

                mentions.push({
                    id: agent.id,
                    data: {
                        name: agent.name,
                        displayName: agent.displayName || agent.name,
                        type: 'agent',
                        agent: {
                            avatar,
                            id: agent.id,
                            name: agent.name,
                            displayName: agent.displayName || agent.name,
                            status: agent.status || 'idle',
                            type: agent.type,
                        },
                    },
                })
            }
        }

        // Add current user
        if ($s.profile.username) {
            mentions.push({
                id: $s.profile.username,
                data: {
                    name: $s.profile.username,
                    displayName: $s.profile.displayName || $s.profile.username,
                    type: 'human',
                },
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
            renderItem={(item, isSelected) => {
                if (item.data?.type === 'agent' && item.data?.agent) {
                    return (
                        <div class='mention-agent' style={{pointerEvents: 'none'}}>
                            <AgentAvatar agent={item.data.agent} size='d' />
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
