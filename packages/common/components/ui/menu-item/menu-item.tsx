import type {ComponentChildren} from 'preact'

import classnames from 'classnames'

import {Icon} from '../icon/icon'

interface MenuItemProps {
    active?: boolean
    className?: string
    collapsed?: boolean
    disabled?: boolean
    href?: string
    icon: string
    iconType?: string
    onClick?: () => void
    text: ComponentChildren
}

/**
 * MenuItem - A menu item with icon and text
 * Used in PanelMenu navigation
 */
export const MenuItem = ({
    active = false,
    className = '',
    collapsed = false,
    disabled = false,
    href,
    icon,
    iconType = 'info',
    onClick,
    text,
}: MenuItemProps) => {
    const content = (
        <>
            <Icon name={icon} type={iconType} />
            {!collapsed && <span>{text}</span>}
        </>
    )

    const classes = classnames(
        'c-menu-item',
        {
            active,
            collapsed,
            disabled,
        },
        className,
    )

    if (href && !disabled) {
        return (
            <a class={classes} href={href} onClick={onClick}>
                {content}
            </a>
        )
    }

    return (
        <button class={classes} disabled={disabled} onClick={onClick} type='button'>
            {content}
        </button>
    )
}
