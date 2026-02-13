import fs from 'fs-extra'
import path from 'node:path'

import {UserManager, User} from './user-manager'

export interface Group {
    createdAt: string
    description?: string
    displayName?: string
    id: string
    name: string
    permissions: {
        'allow-recording'?: boolean
        'allow-subgroups'?: boolean
        autolock?: boolean
        codecs?: string[]
        'max-clients'?: number
    }
    public: boolean
    updatedAt: string
}

export interface GroupManagerConfig {
    storagePath: string
    userManager: UserManager
}

export class GroupManager {
    private storagePath: string

    private userManager: UserManager

    constructor(config: GroupManagerConfig) {
        this.storagePath = config.storagePath
        this.userManager = config.userManager
    }

    async createGroup(groupData: Partial<Group>): Promise<Group> {
        const group: Group = {
            createdAt: new Date().toISOString(),
            description: groupData.description || '',
            displayName: groupData.displayName || groupData.name!,
            id: groupData.id || `group-${Date.now()}`,
            name: groupData.name!,
            permissions: {
                'allow-recording': true,
                'allow-subgroups': true,
                autolock: false,
                codecs: ['opus', 'vp8'],
                'max-clients': 10,
                ...groupData.permissions,
            },
            public: groupData.public ?? true,
            updatedAt: new Date().toISOString(),
        }

        await this.saveGroupToDisk(group)
        return group
    }

    async updateGroup(groupName: string, updates: Partial<Group>): Promise<Group | null> {
        const group = await this.loadGroupFromDisk(groupName)
        if (!group) return null

        const updatedGroup = {
            ...group,
            ...updates,
            updatedAt: new Date().toISOString(),
        }

        await this.saveGroupToDisk(updatedGroup)
        return updatedGroup
    }

    async deleteGroup(groupName: string): Promise<boolean> {
        const groupFile = path.join(this.storagePath, `${groupName}.json`)
        if (!(await fs.pathExists(groupFile))) return false

        await fs.remove(groupFile)
        return true
    }

    async getGroup(groupName: string): Promise<Group | null> {
        return await this.loadGroupFromDisk(groupName)
    }

    async listGroups(): Promise<Group[]> {
        const files = await fs.readdir(this.storagePath)
        const groups: Group[] = []

        for (const file of files) {
            if (file.endsWith('.json')) {
                const groupName = file.replace('.json', '')
                const group = await this.loadGroupFromDisk(groupName)
                if (group) {
                    groups.push(group)
                }
            }
        }

        return groups
    }

    async listPublicGroups(): Promise<Group[]> {
        const groups = await this.listGroups()
        return groups.filter((g) => g.public)
    }

    async syncUsersToGroups(): Promise<void> {
        const users = await this.userManager.listUsers()
        const groups = await this.listGroups()

        for (const group of groups) {
            await this.updateGroupWithUsers(group.name, users)
        }
    }

    private async updateGroupWithUsers(groupName: string, users: User[]): Promise<void> {
        const groupFile = path.join(this.storagePath, `${groupName}.json`)
        let groupData: Record<string, unknown> = {}

        // Load existing group data if it exists
        if (await fs.pathExists(groupFile)) {
            groupData = JSON.parse(await fs.readFile(groupFile, 'utf8'))
        }

        // Initialize arrays for Pyrite format
        groupData.op = []
        groupData.other = []
        groupData.presenter = []

        // Initialize users dictionary for native Galene format
        groupData.users = {}

        // Process users and their group permissions
        for (const user of users) {
            const userGroups = user.permissions.groups || {}
            const roles = userGroups[groupName] || []

            // Update Pyrite arrays
            for (const role of roles) {
                if (role === 'op' && !(groupData.op as string[]).includes(user.username)) {
                    ;(groupData.op as string[]).push(user.username)
                } else if (role === 'presenter' && !(groupData.presenter as string[]).includes(user.username)) {
                    ;(groupData.presenter as string[]).push(user.username)
                } else if (role === 'other' && !(groupData.other as string[]).includes(user.username)) {
                    ;(groupData.other as string[]).push(user.username)
                }
            }

            // Update native Galene format
            if (roles.length > 0) {
                // Already in Galene format
                const users = groupData.users as Record<string, {password: string; permissions: string}>
                const passwordValue = typeof user.password === 'string' ? user.password : user.password.key
                users[user.username] = {
                    // Primary role
                    password: passwordValue,
                    permissions: roles[0],
                }
            }
        }

        // Save the group file
        await fs.writeFile(groupFile, JSON.stringify(groupData, null, 2))
    }

    private async loadGroupFromDisk(groupName: string): Promise<Group | null> {
        const groupFile = path.join(this.storagePath, `${groupName}.json`)

        if (!(await fs.pathExists(groupFile))) {
            return null
        }

        const groupData = JSON.parse(await fs.readFile(groupFile, 'utf8'))

        // Convert from Galene format to our Group interface
        return {
            createdAt: groupData.createdAt || new Date().toISOString(),
            description: groupData.description || '',
            displayName: groupData.displayName || groupName,
            id: groupData.id || `group-${groupName}`,
            name: groupName,
            permissions: {
                'allow-recording': groupData['allow-recording'] ?? true,
                'allow-subgroups': groupData['allow-subgroups'] ?? true,
                autolock: groupData.autolock ?? false,
                codecs: groupData.codecs || ['opus', 'vp8'],
                'max-clients': groupData['max-clients'] ?? 10,
            },
            public: groupData.public ?? true,
            updatedAt: groupData.updatedAt || new Date().toISOString(),
        }
    }

    private async saveGroupToDisk(group: Group): Promise<void> {
        const groupFile = path.join(this.storagePath, `${group.name}.json`)

        // Convert from our Group interface to Galene format
        const groupData = {
            'allow-recording': group.permissions['allow-recording'],
            'allow-subgroups': group.permissions['allow-subgroups'],
            autolock: group.permissions.autolock,
            codecs: group.permissions.codecs,
            createdAt: group.createdAt,
            description: group.description,
            displayName: group.displayName,
            id: group.id,
            'max-clients': group.permissions['max-clients'],
            // Initialize empty arrays for Pyrite format
            op: [],
            other: [],
            presenter: [],
            public: group.public,
            updatedAt: group.updatedAt,
            // Initialize empty users dict for native Galene format
            users: {},
        }

        await fs.writeFile(groupFile, JSON.stringify(groupData, null, 2))
    }
}
