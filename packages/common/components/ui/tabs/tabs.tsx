import classnames from 'classnames'
import {Link} from 'preact-router'
import {Button} from '../button/button'
import {Icon} from '../icon/icon'
import type {ComponentChildren} from 'preact'

export interface TabConfig {
    /**
     * Unique identifier for the tab
     */
    id: string
    /**
     * Tab label (optional, shown alongside icon)
     */
    label?: string
    /**
     * Icon name for the tab
     */
    icon?: string
    /**
     * Tooltip text for the tab
     */
    tip?: string
    /**
     * Whether the tab is disabled
     */
    disabled?: boolean
    /**
     * Route for the tab (if using routing)
     */
    route?: string
    /**
     * onClick handler (if not using routing)
     */
    onClick?: (tabId: string) => void
}

export interface TabsProps {
    /**
     * Array of tab configurations
     */
    tabs: TabConfig[]
    /**
     * Currently active tab ID
     */
    activeTabId?: string
    /**
     * Custom class name
     */
    class?: string
    /**
     * Whether to use Link component for routing (default: true if route is provided)
     */
    useRouter?: boolean
}

/**
 * Reusable Tabs component
 * Supports both routing (via Link/Button) and onClick handlers
 */
export function Tabs({
    tabs,
    activeTabId,
    class: classProp = '',
    useRouter = true,
}: TabsProps) {
    return (
        <ul class={classnames('c-tabs', classProp)}>
            {tabs.map((tab) => {
                const isActive = activeTabId === tab.id
                const isDisabled = tab.disabled || false

                // If route is provided and useRouter is true, use Link
                if (tab.route && useRouter) {
                    return (
                        <li key={tab.id}>
                            <Link
                                class={classnames('c-tabs__tab', {
                                    'is-active': isActive,
                                    'is-disabled': isDisabled,
                                })}
                                {...({href: tab.route} as Record<string, unknown>)}
                            >
                                {tab.icon && <Icon className="c-tabs__icon" name={tab.icon} type="info" />}
                                {tab.label && <span class="c-tabs__label">{tab.label}</span>}
                            </Link>
                        </li>
                    )
                }

                // If onClick is provided, use button
                if (tab.onClick) {
                    return (
                        <li key={tab.id}>
                            <button
                                class={classnames('c-tabs__tab', {
                                    'is-active': isActive,
                                    'is-disabled': isDisabled,
                                })}
                                disabled={isDisabled}
                                onClick={() => tab.onClick?.(tab.id)}
                                type="button"
                            >
                                {tab.icon && <Icon className="c-tabs__icon" name={tab.icon} type="info" />}
                                {tab.label && <span class="c-tabs__label">{tab.label}</span>}
                            </button>
                        </li>
                    )
                }

                // Use Button component as fallback (supports routing via route prop)
                return (
                    <li key={tab.id}>
                        <Button
                            active={isActive}
                            disabled={isDisabled}
                            icon={tab.icon}
                            label={tab.label}
                            route={tab.route}
                            tip={tab.tip}
                            variant="menu"
                            onClick={() => tab.onClick?.(tab.id)}
                        />
                    </li>
                )
            })}
        </ul>
    )
}
