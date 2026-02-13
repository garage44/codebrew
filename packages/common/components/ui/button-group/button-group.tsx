import type {ComponentChildren} from 'preact'

import classnames from 'classnames'

interface ButtonGroupProps {
    active: boolean
    children?: ComponentChildren
}

export const ButtonGroup = ({active, children}: ButtonGroupProps) => (
    <div class={classnames('c-button-group', {active: active})}>{children}</div>
)
