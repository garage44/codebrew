import {Database} from 'bun:sqlite'
import {getPlaceholderAvatar} from './avatar.ts'

export interface User {
    createdAt: string
    email?: string
    id: string
    password: {
        key: string
        type: 'plaintext' | 'bcrypt'
    }
    permissions: {
        admin: boolean
        groups?: Record<string, string[]>
    }
    profile: {
        avatar: string
        displayName: string
    }
    updatedAt: string
    username: string
}

export interface UserManagerConfig {
    appName: string
    configPath: string
    useBcrypt?: boolean
}

export class UserManager {
    private db: Database | null = null

    private appName: string

    private useBcrypt: boolean

    constructor() {
        // Initialize with defaults, will be configured via init()
        this.appName = ''
        this.useBcrypt = false
    }

    async init(database: Database, config: UserManagerConfig) {
        this.db = database
        this.appName = config.appName
        this.useBcrypt = config.useBcrypt ?? false

        // Check if we need to create default admin user
        const userCount = database.query<{count: number}, []>('SELECT COUNT(*) as count FROM users').get()
        if (!userCount || userCount.count === 0) {
            await this.createDefaultAdmin()
            await this.createDefaultUsers()
        }
    }

    async initialize() {
        if (!this.db) throw new Error('Database not initialized')
        const users = await this.loadUsers()
        if (users.length === 0) {
            await this.createDefaultAdmin()
            await this.createDefaultUsers()
        }
    }

    private async createDefaultAdmin() {
        if (!this.db) throw new Error('Database not initialized')

        const now = Date.now()
        const adminId = crypto.randomUUID()

        const defaultUser: User = {
            createdAt: new Date().toISOString(),
            email: 'admin@localhost',
            id: adminId,
            password: {
                key: 'admin',
                type: 'plaintext',
            },
            permissions: {
                admin: true,
            },
            profile: {
                avatar: 'placeholder-1.png',
                displayName: 'Administrator',
            },
            updatedAt: new Date().toISOString(),
            username: 'admin',
        }

        const stmt = this.db.prepare(`
            INSERT INTO users (id, username, password_hash, permissions, avatar, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `)

        stmt.run(
            adminId,
            defaultUser.username,
            defaultUser.password.key,
            JSON.stringify(defaultUser.permissions),
            'placeholder-1.png',
            now,
            now,
        )
    }

    private async createDefaultUsers() {
        if (!this.db) throw new Error('Database not initialized')

        const defaultUsers = [
            {avatar: 'placeholder-5.png', displayName: 'Alice', email: 'alice@localhost', username: 'alice'},
            {avatar: 'placeholder-6.png', displayName: 'Bob', email: 'bob@localhost', username: 'bob'},
            {avatar: 'placeholder-7.png', displayName: 'Charlie', email: 'charlie@localhost', username: 'charlie'},
        ]

        for (const userData of defaultUsers) {
            // Check if user already exists
            const existingUser = await this.getUserByUsername(userData.username)
            if (existingUser) {
                continue
            }

            // Password same as username for default users
            await this.createUser({
                email: userData.email,
                password: {
                    key: userData.username,
                    type: 'plaintext',
                },
                permissions: {
                    admin: false,
                },
                profile: {
                    avatar: userData.avatar,
                    displayName: userData.displayName,
                },
                username: userData.username,
            })
        }
    }

    async loadUsers(): Promise<User[]> {
        if (!this.db) throw new Error('Database not initialized')

        const stmt = this.db.prepare(`
            SELECT id, username, password_hash, permissions, avatar, created_at, updated_at
            FROM users
            ORDER BY created_at ASC
        `)

        const rows = stmt.all() as Array<{
            avatar: string
            created_at: number
            id: string
            password_hash: string
            permissions: string
            updated_at: number
            username: string
        }>

        return rows.map((row) => ({
            createdAt: new Date(row.created_at).toISOString(),
            id: row.id,
            password: {
                key: row.password_hash,
                type: 'plaintext' as const,
            },
            permissions: JSON.parse(row.permissions),
            profile: {
                avatar: row.avatar,
                displayName: row.username,
            },
            updatedAt: new Date(row.updated_at).toISOString(),
            username: row.username,
        }))
    }


    async createUser(userData: Partial<User>): Promise<User> {
        if (!this.db) throw new Error('Database not initialized')

        const now = Date.now()
        const userId = crypto.randomUUID()

        // Always assign placeholder avatar if not provided
        const avatar = userData.profile?.avatar || getPlaceholderAvatar(userId)

        const stmt = this.db.prepare(`
            INSERT INTO users (id, username, password_hash, permissions, avatar, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `)

        const user: User = {
            createdAt: new Date().toISOString(),
            email: userData.email,
            id: userId,
            password: userData.password || {
                key: 'password',
                type: 'plaintext',
            },
            permissions: userData.permissions || {
                admin: false,
                groups: {},
            },
            profile: {
                avatar: avatar,
                displayName: userData.profile?.displayName || userData.username!,
            },
            updatedAt: new Date().toISOString(),
            username: userData.username!,
        }

        stmt.run(
            userId,
            user.username,
            user.password.key,
            JSON.stringify(user.permissions),
            avatar,
            now,
            now,
        )

        return user
    }

    async updateUser(userId: string, updates: Partial<User>): Promise<User | null> {
        if (!this.db) throw new Error('Database not initialized')

        const user = await this.getUser(userId)
        if (!user) return null

        // Deep merge profile if it's being updated
        let mergedProfile = user.profile
        if (updates.profile) {
            mergedProfile = {
                ...user.profile,
                ...updates.profile,
            }
        }

        // Extract updates without id to prevent any ID changes
        const {id, ...safeUpdates} = updates

        // If updates contained an id, log a warning
        if (id && id !== user.id) {
            const msg = `[UserManager] updateUser: Attempted to change user ID from ${user.id} to ${id}, ignoring`
            console.warn(msg)
        }

        // Always use the original user ID - never allow ID changes
        const updatedUser = {
            ...user,
            ...safeUpdates,
            id: user.id,
            profile: mergedProfile,
            updatedAt: new Date().toISOString(),
        }

        const stmt = this.db.prepare(`
            UPDATE users
            SET username = ?, password_hash = ?, permissions = ?, avatar = ?, updated_at = ?
            WHERE id = ?
        `)

        const avatarValue = updatedUser.profile.avatar
        const updatedAtValue = Date.now()

        // Log update details
        console.log(`[UserManager] updateUser: Updating user ${userId}`)
        console.log(`[UserManager] updateUser: Avatar value: ${avatarValue}`)
        const profileJson = JSON.stringify(updatedUser.profile)
        console.log('[UserManager] updateUser: Profile object:', profileJson)
        console.log(`[UserManager] updateUser: WHERE id = ${userId}`)

        const result = stmt.run(
            updatedUser.username,
            updatedUser.password.key,
            JSON.stringify(updatedUser.permissions),
            avatarValue,
            updatedAtValue,
            userId,
        )

        console.log(`[UserManager] updateUser: UPDATE result - changes: ${result.changes}`)

        // Verify the update affected at least one row
        if (result.changes === 0) {
            console.warn(`[UserManager] updateUser: No rows updated for userId ${userId}`)
            // Check if the user exists
            const checkUser = this.db.prepare('SELECT id FROM users WHERE id = ?').get(userId)
            if (checkUser) {
                console.warn('[UserManager] updateUser: User exists but UPDATE affected 0 rows')
            } else {
                console.error(`[UserManager] updateUser: User ${userId} does not exist in database`)
            }
            return null
        }

        console.log(`[UserManager] updateUser: Successfully updated user ${userId} with avatar ${avatarValue}`)
        return updatedUser
    }

    async deleteUser(userId: string): Promise<boolean> {
        if (!this.db) throw new Error('Database not initialized')

        const stmt = this.db.prepare('DELETE FROM users WHERE id = ?')
        const result = stmt.run(userId)

        return result.changes > 0
    }

    async getUser(userId: string): Promise<User | null> {
        if (!this.db) throw new Error('Database not initialized')

        const stmt = this.db.prepare(`
            SELECT id, username, password_hash, permissions, avatar, created_at, updated_at
            FROM users WHERE id = ?
        `)

        const row = stmt.get(userId) as {
            avatar: string
            created_at: number
            id: string
            password_hash: string
            permissions: string
            updated_at: number
            username: string
        } | null

        if (!row) return null

        return {
            createdAt: new Date(row.created_at).toISOString(),
            id: row.id,
            password: {
                key: row.password_hash,
                type: 'plaintext' as const,
            },
            permissions: JSON.parse(row.permissions),
            profile: {
                avatar: row.avatar,
                displayName: row.username,
            },
            updatedAt: new Date(row.updated_at).toISOString(),
            username: row.username,
        }
    }

    async getUserByUsername(username: string): Promise<User | null> {
        if (!this.db) throw new Error('Database not initialized')

        const stmt = this.db.prepare(`
            SELECT id, username, password_hash, permissions, avatar, created_at, updated_at
            FROM users WHERE username = ?
        `)

        const row = stmt.get(username) as {
            avatar: string
            created_at: number
            id: string
            password_hash: string
            permissions: string
            updated_at: number
            username: string
        } | null

        if (!row) return null

        return {
            createdAt: new Date(row.created_at).toISOString(),
            id: row.id,
            password: {
                key: row.password_hash,
                type: 'plaintext' as const,
            },
            permissions: JSON.parse(row.permissions),
            profile: {
                avatar: row.avatar,
                displayName: row.username,
            },
            updatedAt: new Date(row.updated_at).toISOString(),
            username: row.username,
        }
    }

    async listUsers(): Promise<User[]> {
        return await this.loadUsers()
    }

    async authenticate(username: string, password: string): Promise<User | null> {
        const user = await this.getUserByUsername(username)

        if (!user) {
            return null
        }

        const isValid = await this.validatePassword(user, password)
        return isValid ? user : null
    }

    async validatePassword(user: User, password: string): Promise<boolean> {
        if (user.password.type === 'plaintext') {
            const isMatch = user.password.key === password
            return isMatch
        }

        if (user.password.type === 'bcrypt') {
            return user.password.key === password
        }

        return false
    }

    async updatePassword(userId: string, newPassword: string): Promise<boolean> {
        const user = await this.getUser(userId)
        if (!user) return false

        // Note: bcrypt hashing can be added later if needed
        const passwordObj = this.useBcrypt ?
                {key: newPassword, type: 'bcrypt' as const} :
                {key: newPassword, type: 'plaintext' as const}

        await this.updateUser(userId, {password: passwordObj})
        return true
    }

    async hasPermission(userId: string, permission: string): Promise<boolean> {
        const user = await this.getUser(userId)
        if (!user) return false

        if (permission === 'admin') {
            return user.permissions.admin
        }

        return false
    }

    async getUserGroups(userId: string): Promise<Record<string, string[]>> {
        const user = await this.getUser(userId)
        return user?.permissions.groups || {}
    }

    async grantGroupPermission(userId: string, groupName: string, role: string): Promise<boolean> {
        const user = await this.getUser(userId)
        if (!user) return false

        const groups = user.permissions.groups || {}
        if (!groups[groupName]) {
            groups[groupName] = []
        }

        if (!groups[groupName].includes(role)) {
            groups[groupName].push(role)
        }

        await this.updateUser(userId, {permissions: {...user.permissions, groups}})
        return true
    }

    async revokeGroupPermission(userId: string, groupName: string, role: string): Promise<boolean> {
        const user = await this.getUser(userId)
        if (!user) return false

        const groups = user.permissions.groups || {}
        if (groups[groupName]) {
            groups[groupName] = groups[groupName].filter((r) => r !== role)
            if (groups[groupName].length === 0) {
                delete groups[groupName]
            }
        }

        await this.updateUser(userId, {permissions: {...user.permissions, groups}})
        return true
    }
}
