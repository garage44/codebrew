import {api, ws} from '@garage44/common/app'
import {Login as SharedLogin} from '@garage44/common/components'
import {route} from 'preact-router'

import {$s} from '@/app'

interface LoginResponse {
    admin?: boolean
    authenticated?: boolean
    error?: string
    id?: string
    profile?: {avatar?: string; displayName?: string}
    username?: string
}

export const Login = () => {
    const handleLogin = async (username: string, password: string) => {
        try {
            const result = await api.post<LoginResponse>('/api/login', {
                password,
                username,
            })

            /*
             * Check if user was authenticated - the response should have authenticated: true
             * Also check if we have user data (id, username) as an alternative indicator
             * This handles cases where authenticated might not be set but user data is present
             */
            const isAuthenticated = result.authenticated || (result.id && result.username)

            if (isAuthenticated) {
                // Set profile data from result
                $s.profile.authenticated = true
                $s.profile.admin = result.admin || false
                if (result.id) {
                    $s.profile.id = result.id
                }
                if (result.username) {
                    $s.profile.username = result.username
                }
                if (result.profile) {
                    $s.profile.avatar = result.profile.avatar || 'placeholder-1.png'
                    $s.profile.displayName = result.profile.displayName || result.username || 'User'
                }

                ws.connect()
                route('/board')
                // Success
                return null
            }
            return result.error || 'Invalid credentials'
        } catch (error) {
            return error instanceof Error ? error.message : 'Login failed'
        }
    }

    return <SharedLogin onLogin={handleLogin} title='Nonlinear' />
}
