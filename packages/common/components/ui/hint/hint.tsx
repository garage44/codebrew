import {Icon} from '../icon/icon'

interface HintProps {
    text?: string
    class?: string
}

export const Hint = ({text = '', class: className}: HintProps) => (
    <div class={`c-hint ${className || ''}`}>
        <Icon className='item-icon icon-d' name='info' />
        <div class='description'>{text}</div>
    </div>
)
