import {$s} from '@/app'

interface EmojiProps {
    onselect: (e: MouseEvent, emoji: string) => void
}

export default function Emoji({onselect}: EmojiProps) {
    return (
        <div class='c-emoji'>
            {($s.chat.emoji.list || []).map((emoji, index) => {
                const emojiStr = typeof emoji === 'string' ? emoji : String(emoji)
                return (
                    <div class='emoji' key={index} onClick={(e) => onselect(e as MouseEvent, emojiStr)}>
                        {emojiStr}
                    </div>
                )
            })}
        </div>
    )
}
