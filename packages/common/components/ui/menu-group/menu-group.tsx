import type {ComponentChildren} from 'preact'

import classnames from 'classnames'

interface MenuGroupProps {
    children: ComponentChildren
    className?: string
    collapsed?: boolean
}

/**
 * MenuGroup - Groups related menu items together
 * Used in PanelMenu navigation
 */
export const MenuGroup = ({children, className = '', collapsed = false}: MenuGroupProps) => (
    <div class={classnames('c-menu-group', {collapsed}, className)}>{children}</div>
)
