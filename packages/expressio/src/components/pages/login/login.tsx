import {api, logger, notifier, ws} from '@garage44/common/app'
import {Login as CommonLogin} from '@garage44/common/components'
import {mergeDeep} from '@garage44/common/lib/utils'
import {$t} from '@garage44/expressio'

import {$s} from '@/app'

export const Login = () => {
    const handleLogin = async (username: string, password: string): Promise<string | null> => {
        try {
            const result = (await api.post('/api/login', {
                password,
                username,
            })) as {
                admin?: boolean
                authenticated?: boolean
                id?: string
                password?: string
                profile?: {avatar?: string; displayName?: string}
                username?: string
            }

            /*
             * Check if user was authenticated - the response should have authenticated: true
             * Also check if we have user data (id, username) as an alternative indicator
             * This handles cases where authenticated might not be set but user data is present
             */
            const isAuthenticated = result.authenticated || (result.id && result.username)

            if (isAuthenticated) {
                const config = (await api.get('/api/config')) as {
                    enola?: unknown
                    workspaces?: Array<{workspace_id: string}>
                }

                /*
                 * Set profile data from result (but NOT authenticated yet)
                 * result from login already includes full profile from /api/context
                 */
                $s.profile.admin = result.admin || false
                if (result.id) $s.profile.id = result.id
                if (result.username) $s.profile.username = result.username
                if (result.password) $s.profile.password = result.password
                if (result.profile) {
                    $s.profile.avatar = result.profile.avatar || 'placeholder-1.png'
                    $s.profile.displayName = result.profile.displayName || result.username || 'User'
                }

                // Load workspaces config
                const configTyped = config as {
                    enola?: unknown
                    workspaces?: Array<{workspace_id: string}>
                }
                mergeDeep(
                    $s as Record<string, unknown>,
                    {
                        enola: configTyped.enola,
                        workspaces: configTyped.workspaces,
                    } as Record<string, unknown>,
                )

                // Connect WebSocket first so we can load workspace
                ws.connect()

                /*
                 * Auto-select first workspace and load its data BEFORE setting authenticated
                 * This ensures workspace is available when Main component renders
                 */
                if (config.workspaces && config.workspaces.length > 0) {
                    const firstWorkspace = config.workspaces[0]
                    const workspaceResult = (await ws.get(`/api/workspaces/${firstWorkspace.workspace_id}`)) as {
                        config: unknown
                        i18n: unknown
                        id: string
                    }
                    $s.workspace = {
                        config: workspaceResult.config,
                        i18n: workspaceResult.i18n,
                    } as typeof $s.workspace
                }

                // Now that workspace is loaded, we can safely access workspace.i18n
                const i18nNotifications =
                    $s.workspace?.i18n &&
                    typeof $s.workspace.i18n === 'object' &&
                    (($s.workspace.i18n as Record<string, unknown>).notifications as Record<string, unknown> | undefined)
                const loggedInKey =
                    i18nNotifications && typeof i18nNotifications === 'object'
                        ? (i18nNotifications as Record<string, unknown>).logged_in
                        : undefined
                const loggedInMessage = loggedInKey ? $t(loggedInKey as Parameters<typeof $t>[0]) : 'Login successful'
                notifier.notify({
                    icon: 'check_circle',
                    link: {text: '', url: ''},
                    list: [],
                    message: loggedInMessage,
                    type: 'info',
                })

                /*
                 * Set authenticated LAST - this triggers Main to re-render
                 * At this point workspace is already loaded
                 * The Router's handleRoute will redirect from '/' to the appropriate
                 * translations page based on workspace count
                 */
                $s.profile.authenticated = true

                // Success - no error message
                return null
            }

            const failedMessage = $s.workspace?.i18n?.notifications?.logged_in_fail
                ? $t($s.workspace.i18n.notifications.logged_in_fail)
                : 'Failed to login; please check your credentials'
            notifier.notify({
                icon: 'warning',
                link: {text: '', url: ''},
                list: [],
                message: failedMessage,
                type: 'warning',
            })
            return failedMessage
        } catch (error) {
            logger.error('[Login] Login error:', error)
            const failedMessage = $s.workspace?.i18n?.notifications?.logged_in_fail
                ? $t($s.workspace.i18n.notifications.logged_in_fail)
                : 'Failed to login; please check your credentials'
            notifier.notify({
                icon: 'warning',
                link: {text: '', url: ''},
                list: [],
                message: failedMessage,
                type: 'warning',
            })
            return failedMessage
        }
    }

    return <CommonLogin animated={true} logo='/public/img/logo.svg' onLogin={handleLogin} title='Expressio' />
}
