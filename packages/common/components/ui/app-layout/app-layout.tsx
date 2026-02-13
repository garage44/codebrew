import type {ComponentChildren} from 'preact'

import classnames from 'classnames'
import {useEffect} from 'preact/hooks'

import {$t} from '@/app'
import {store} from '@/app'
import {Icon} from '@/components'

interface AppLayoutProps {
    children: ComponentChildren
    context?: ComponentChildren
    menu?: ComponentChildren
}

/**
 * AppLayout - Generic application layout component
 *
 * Provides a consistent CSS Grid layout pattern with menu (left), content (center), and optional context (right).
 * Used across all Garage44 applications.
 *
 * @example
 * <AppLayout menu={<PanelMenu {...props} />} context={<PanelContext />}>
 *   <YourMainContent />
 * </AppLayout>
 */
export const AppLayout = ({children, context, menu}: AppLayoutProps) => {
    // Access store state directly - DeepSignal reactivity will trigger re-renders
    // Accessing store.state.env?.layout in render makes it reactive
    // Safe check: ensure env exists and has layout property
    const isMobile = store.state?.env?.layout === 'mobile'

    useEffect(() => {
        // On mobile, ensure menu starts collapsed (hidden) so hamburger button is visible
        if (isMobile && store.state?.panels?.menu && !store.state.panels.menu.collapsed) {
            store.state.panels.menu.collapsed = true
            store.save()
        }
        // On mobile, ensure context starts collapsed (hidden) so toggle button is visible
        if (isMobile && store.state?.panels?.context && !store.state.panels.context.collapsed) {
            store.state.panels.context.collapsed = true
            store.save()
        }
    }, [isMobile])

    // Unified toggle handler - cycles: Closed → Menu → Context → Closed
    const handleUnifiedToggle = () => {
        if (!isMobile) {
            return
        }

        const menuCollapsed = store.state?.panels?.menu?.collapsed ?? true
        const contextCollapsed = store.state?.panels?.context?.collapsed ?? true

        // If both panels are closed, open menu
        if (menuCollapsed && contextCollapsed && menu) {
            if (store.state?.panels?.menu) {
                store.state.panels.menu.collapsed = false
                store.save()
            }
        }
        // If menu is open, switch to context (if context exists)
        else if (!menuCollapsed && contextCollapsed && context) {
            if (store.state?.panels?.menu) {
                store.state.panels.menu.collapsed = true
            }
            if (store.state?.panels?.context) {
                store.state.panels.context.collapsed = false
            }
            store.save()
        }
        // If context is open, close it
        else if (!contextCollapsed) {
            if (store.state?.panels?.context) {
                store.state.panels.context.collapsed = true
                store.save()
            }
        }
        // If only menu exists and is open, close it
        else if (!menuCollapsed && !context) {
            if (store.state?.panels?.menu) {
                store.state.panels.menu.collapsed = true
                store.save()
            }
        }
    }

    const handleClosePanel = () => {
        if (!isMobile) {
            return
        }

        const menuCollapsed = store.state?.panels?.menu?.collapsed ?? true
        const contextCollapsed = store.state?.panels?.context?.collapsed ?? true

        // Close whichever panel is open
        if (!menuCollapsed && store.state?.panels?.menu) {
            store.state.panels.menu.collapsed = true
        }
        if (!contextCollapsed && store.state?.panels?.context) {
            store.state.panels.context.collapsed = true
        }
        store.save()
    }

    const handleSwitchToMenu = () => {
        if (!isMobile) {
            return
        }
        if (store.state?.panels?.menu) {
            store.state.panels.menu.collapsed = false
        }
        if (store.state?.panels?.context) {
            store.state.panels.context.collapsed = true
        }
        store.save()
    }

    const handleSwitchToContext = () => {
        if (!isMobile) {
            return
        }
        if (store.state?.panels?.menu) {
            store.state.panels.menu.collapsed = true
        }
        if (store.state?.panels?.context) {
            store.state.panels.context.collapsed = false
        }
        store.save()
    }

    const handleBackdropClick = () => {
        if (isMobile) {
            handleClosePanel()
        } else if (context && !contextCollapsed) {
            // On small screens, collapse context panel when backdrop is clicked
            if (store.state?.panels?.context) {
                store.state.panels.context.collapsed = true
                store.save()
            }
        }
    }

    // Access store state directly in render for reactivity
    // Reading these values in render ensures component re-renders when they change
    // Safe checks: ensure store.state and panels exist
    const menuCollapsed = store.state?.panels?.menu?.collapsed ?? true // Default to collapsed on mobile
    const contextCollapsed = store.state?.panels?.context?.collapsed ?? true // Default to collapsed on mobile
    const hasAnyPanel = menu || context
    const isAnyPanelOpen = !menuCollapsed || !contextCollapsed
    // Check if context panel is expanded (for small screen overlay)
    const isContextExpanded = context && !contextCollapsed

    return (
        <div class='c-app-layout'>
            <div style={{position: 'absolute', visibility: 'hidden'}}>{$t('direction_helper')}</div>
            {menu}
            {isMobile && isAnyPanelOpen && <div class='c-panel-backdrop' onClick={handleBackdropClick} aria-hidden='true' />}
            {isContextExpanded && (
                <div class='c-panel-backdrop c-panel-backdrop--context' onClick={handleBackdropClick} aria-hidden='true' />
            )}
            <main class='content'>
                {/* Unified toggle button - positioned top-left */}
                {/* Show when at least one panel exists and both are closed */}
                {isMobile && hasAnyPanel && menuCollapsed && contextCollapsed && (
                    <button class='c-mobile-panel-toggle' onClick={handleUnifiedToggle} aria-label='Open panel'>
                        <Icon name='menu_hamburger' size='d' />
                    </button>
                )}
                {/* Close button - show when any panel is open */}
                {isMobile && isAnyPanelOpen && (
                    <button class='c-mobile-panel-close' onClick={handleClosePanel} aria-label='Close panel'>
                        <Icon name='close_x' size='d' />
                    </button>
                )}
                {/* Panel switcher tabs - show when both panels exist and one is open */}
                {isMobile && menu && context && isAnyPanelOpen && (
                    <div class='c-panel-switcher'>
                        <button
                            class={classnames('c-panel-switcher-tab', {
                                'is-active': !menuCollapsed,
                            })}
                            onClick={handleSwitchToMenu}
                            aria-label='Switch to menu'
                        >
                            Menu
                        </button>
                        <button
                            class={classnames('c-panel-switcher-tab', {
                                'is-active': !contextCollapsed,
                            })}
                            onClick={handleSwitchToContext}
                            aria-label='Switch to context'
                        >
                            Context
                        </button>
                    </div>
                )}
                {children}
            </main>
            {context}
        </div>
    )
}
