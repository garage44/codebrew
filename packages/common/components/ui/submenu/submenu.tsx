import type {ComponentChildren} from 'preact'

import classnames from 'classnames'

interface SubmenuItem {
    id: string
    label: ComponentChildren
    onClick?: () => void
    active?: boolean
    disabled?: boolean
    nested?: boolean // Indicates this is a nested item (e.g., docs under a package)
    children?: SubmenuItem[] // Nested children for expandable items
}

interface SubmenuProps {
    className?: string
    collapsed?: boolean
    items: SubmenuItem[]
    level?: number // Nesting level (0 = first level, 1 = nested, etc.)
}

/**
 * Submenu - A nested menu component for displaying sub-items
 *
 * Used within PanelMenu navigation to show nested menu items.
 * Provides consistent styling with hover and active states.
 *
 * @example
 * <Submenu
 *   collapsed={false}
 *   items={[
 *     { id: 'item1', label: 'Item 1', onClick: () => {}, active: true },
 *     { id: 'item2', label: 'Item 2', onClick: () => {} }
 *   ]}
 * />
 */
export const Submenu = ({className = '', collapsed = false, items, level = 0}: SubmenuProps) => {
    if (collapsed || !items.length) {
        return null
    }

    return (
        <nav class={classnames('c-submenu', `c-submenu--level-${level}`, className)}>
            {items.map((item) => (
                <div key={item.id} class='c-submenu-item-wrapper'>
                    <button
                        class={classnames('c-submenu-item', {
                            active: item.active,
                            disabled: item.disabled,
                            nested: item.nested,
                        })}
                        disabled={item.disabled}
                        onClick={item.onClick}
                        type='button'
                    >
                        {item.label}
                    </button>
                    {item.children && item.children.length > 0 && (
                        <Submenu collapsed={collapsed} items={item.children} level={level + 1} />
                    )}
                </div>
            ))}
        </nav>
    )
}
