import type {ComponentChildren} from 'preact'

import {Button} from '../button/button'
import {Icon} from '../icon/icon'
import {Tabs, type TabConfig} from '../tabs/tabs'

export interface SettingsTab {
    /**
     * Tab content component
     */
    component: ComponentChildren
    /**
     * Whether tab is disabled
     */
    disabled?: boolean
    /**
     * Tab icon name
     */
    icon?: string
    /**
     * Tab ID
     */
    id: string
    /**
     * Tab label
     */
    label?: string
    /**
     * Tab tooltip
     */
    tip?: string
}

export interface SettingsProps {
    /**
     * Currently active tab ID
     */
    activeTabId?: string
    /**
     * Custom class name
     */
    class?: string
    /**
     * Default tab ID (if activeTabId not provided)
     */
    defaultTab?: string
    /**
     * Function to generate route for a tab
     */
    getRoute?: (tabId: string) => string
    /**
     * Custom header content (overrides title/icon)
     */
    header?: ComponentChildren
    /**
     * Settings icon name
     */
    icon?: string
    /**
     * Save handler function
     */
    onSave?: () => void | Promise<void>
    /**
     * Base route for tab navigation
     */
    routePrefix?: string
    /**
     * Save button label
     */
    saveLabel?: string
    /**
     * Whether to show save button
     */
    showSave?: boolean
    /**
     * Array of tab configurations
     */
    tabs: SettingsTab[]
    /**
     * Settings title
     */
    title?: string
}

/**
 * Reusable Settings wrapper component
 * Provides consistent settings UI with tabs, header, and save action
 */
export function Settings({
    activeTabId,
    class: classProp = '',
    defaultTab,
    getRoute,
    header,
    icon = 'settings',
    onSave,
    routePrefix,
    saveLabel = 'Save',
    showSave = true,
    tabs,
    title,
}: SettingsProps) {
    const currentTabId = activeTabId || defaultTab || tabs[0]?.id
    const activeTab = tabs.find((tab) => tab.id === currentTabId)

    const tabConfigs: TabConfig[] = tabs.map((tab) => ({
        disabled: tab.disabled,
        icon: tab.icon,
        id: tab.id,
        label: tab.label,
        route: getRoute ? getRoute(tab.id) : routePrefix ? `${routePrefix}/${tab.id}` : undefined,
        tip: tab.tip,
    }))

    const handleSave = async () => {
        if (onSave) {
            await onSave()
        }
    }

    return (
        <div class={`c-settings content ${classProp}`}>
            <header class='header'>
                <div class='notice' />
                {header || (
                    <div class='title'>
                        {title && <span>{title}</span>}
                        {icon && <Icon className='item-icon icon-regular' name={icon} />}
                    </div>
                )}
            </header>

            <Tabs tabs={tabConfigs} activeTabId={currentTabId} />

            <div class='content'>
                {activeTab && <div class='tab-content'>{activeTab.component}</div>}

                {showSave && onSave && (
                    <div class='actions'>
                        <Button icon='save' label={saveLabel} onClick={handleSave} tip='Save Settings' variant='menu' />
                    </div>
                )}
            </div>
        </div>
    )
}
