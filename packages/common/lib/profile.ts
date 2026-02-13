// Simple context functions for basic authentication
function adminContext() {
    return {admin: true, authenticated: true}
}

function deniedContext() {
    return {authenticated: false, permission: false}
}

function userContext() {
    return {admin: false, authenticated: true}
}

// Complex context functions for admin interfaces that need additional data
export async function createComplexAuthContext(config: {
    loadGroups: () => Promise<{groupsData: unknown}>
    loadUsers: () => Promise<unknown[]>
}) {
    return {
        async adminContext() {
            const [{groupsData}, users] = await Promise.all([config.loadGroups(), config.loadUsers()])
            return {
                authenticated: true,
                groups: groupsData,
                permission: true,
                users,
            }
        },
        deniedContext() {
            return {authenticated: false, permission: false}
        },
        async userContext() {
            return {authenticated: true, permission: false}
        },
    }
}

export {adminContext, deniedContext, userContext}
