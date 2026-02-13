import {create$t, init as i18nInit} from './lib/i18n'
import {Api} from './lib/api'
import type {CommonState} from './types'
import {EventEmitter} from 'node:events'
import {Notifier} from './lib/notifier'
import type {Notification} from './lib/notifier'
import {Store} from './lib/store'
import env from './lib/env'
import {logger} from './lib/logger'
import {WebSocketClient} from './lib/ws-client'
import {persistentState, volatileState} from './lib/state'
logger.setLevel('debug')

const notifier = new Notifier()
const store = new Store<CommonState & Record<string, unknown>>()
store.load(persistentState as CommonState & Record<string, unknown>, volatileState)
const $t = create$t(store)

// Create i18n object with init function
const i18n = {
    init: i18nInit,
}

const api = new Api()
const events = new EventEmitter()

// Helper function to construct WebSocket URL based on current protocol
function getWebSocketUrl(path: string): string {
    const protocol = globalThis?.location?.protocol === 'https:' ? 'wss:' : 'ws:'
    const hostname = globalThis?.location?.hostname || 'localhost'
    const port = (globalThis as any)?.location?.port

    /*
     * Only include port if it's explicitly set and not the default (80 for HTTP, 443 for HTTPS)
     * When behind Nginx with SSL, the port will be empty (defaults to 443) and Nginx will proxy to backend
     */
    const portSuffix = port && port !== '80' && port !== '443' ? `:${port}` : ''
    return `${protocol}//${hostname}${portSuffix}${path}`
}

const ws = new WebSocketClient(getWebSocketUrl('/ws'))

interface InitOptions {
    enableBunchy?: boolean
}


class App {
    async init(Main, renderFn, hFn, translations, options: InitOptions = {}) {
        const g = globalThis as any
        const isHMRUpdate = g.__HMR_UPDATING__ === true

        if (isHMRUpdate) {
            /*
             * During HMR, re-initialize the application but preserve state and avoid flicker
             * Note: data-hmr-updating attribute is already set by bunchy/client.ts before script loads
             */
            store.state.hmr_updating = true
            g.__HMR_UPDATING__ = false

            /*
             * Re-initialize application services (env, i18n, notifier)
             * This ensures any changes in non-component files are picked up
             */
            env(store.state.env, store)
            await i18n.init(translations, api, store)
            notifier.init(store.state.notifications as Notification[])

            // Update Main component reference
            g.__HMR_MAIN_COMPONENT__ = Main

            // Preserve scroll position before re-render
            const viewElement = document.querySelector('.view')
            const scrollPosition = viewElement ? viewElement.scrollTop : 0

            /*
             * Sync route state to prevent menu flash
             * Use store.state.env.url which is maintained by the env system
             * This ensures currentRoute matches the actual URL before Router initializes
             */
            try {
                const currentUrl = store.state.env?.url || globalThis.location?.pathname || '/'
                if ('currentRoute' in store.state && (store.state as any).currentRoute !== currentUrl) {
                    (store.state as any).currentRoute = currentUrl
                }
            } catch {
                // If env.url access fails (shouldn't happen, but be safe), use window.location
            }

            try {
                /*
                 * Re-render with the new Main component using the NEW render/h functions
                 * This ensures Preact hooks are from the same instance as the component
                 */
                const rootElement = document.body.firstElementChild

                if (rootElement) {
                    // Wait a microtask to ensure state propagates
                    await new Promise<void>((resolve) => {
                        setTimeout(() => {
                            resolve()
                        }, 0)
                    })

                    // Unmount the old tree by rendering null
                    renderFn(null, document.body)

                    // Wait a tick for Preact to complete unmounting
                    await new Promise<void>((resolve) => {
                        setTimeout(() => {
                            resolve()
                        }, 0)
                    })
                }

                // Render the new component - Preact will create a fresh tree
                const vnode = hFn(Main, {})
                renderFn(vnode, document.body)

                // Verify the component was actually rendered
                if (!document.body.firstElementChild) {
                    // oxlint-disable-next-line no-console
                    console.error('[HMR] Component was not rendered to DOM, falling back to reload')
                    globalThis.location.reload()
                    return
                }

                // Restore scroll position after render
                requestAnimationFrame(() => {
                    const newViewElement = document.querySelector('.view')
                    if (newViewElement) {
                        newViewElement.scrollTop = scrollPosition
                    }
                })
            } catch(error) {
                // oxlint-disable-next-line no-console
                console.error('[HMR] Error re-rendering Main component:', error)
                // Fall back to full reload on error
                globalThis.location.reload()
                return
            }

            // Reset HMR flag after render completes
            setTimeout(() => {
                store.state.hmr_updating = false

                /*
                 * Mark that HMR has completed - this prevents animations from restarting
                 * Add a persistent class to body/html that indicates HMR happened
                 */
                if (document.documentElement) {
                    document.documentElement.classList.add('hmr-complete')
                    // oxlint-disable-next-line @typescript-eslint/no-dynamic-delete
                    delete document.documentElement.dataset.hmrUpdating
                }
                document.body.classList.add('hmr-complete')
                // oxlint-disable-next-line @typescript-eslint/no-dynamic-delete
                delete document.body.dataset.hmrUpdating
            }, 0)

            // Don't emit app:init event (already initialized above)
            return
        }

        // oxlint-disable-next-line no-console
        console.log('[App] Normal initialization path')

        // Normal initialization (not HMR)
        env(store.state.env, store)
        await i18n.init(translations, api, store)
        notifier.init(store.state.notifications as Notification[])

        // Store Main component reference for HMR re-rendering
        g.__HMR_MAIN_COMPONENT__ = Main

        try {
            renderFn(hFn(Main, {}), document.body)
        } catch(error) {
            // oxlint-disable-next-line no-console
            console.error('Error rendering Main component:', error)
        }

        events.emit('app:init')
    }
}

export {
    $t,
    api,
    App,
    events,
    logger,
    i18n,
    notifier,
    store,
    ws,
}
