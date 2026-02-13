import {readFileSync, existsSync, readdirSync} from 'node:fs'
import {join, dirname} from 'node:path'
import {fileURLToPath} from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/**
 * Find workspace root by looking for package.json with workspaces field
 */
export function findWorkspaceRoot(startPath?: string): string | null {
    let currentPath = startPath || __dirname

    // Go up from nonlinear package to monorepo root
    while (currentPath !== dirname(currentPath)) {
        const packageJsonPath = join(currentPath, 'package.json')

        if (existsSync(packageJsonPath)) {
            try {
                const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'))

                // Check if this is a workspace root (has workspaces field)
                if (packageJson.workspaces) {
                    return currentPath
                }
            } catch {
                // Continue searching
            }
        }

        currentPath = dirname(currentPath)
    }

    return null
}

/**
 * Extract packages from workspace package.json
 */
export function extractWorkspacePackages(workspaceRoot: string): string[] {
    const packageJsonPath = join(workspaceRoot, 'package.json')

    if (!existsSync(packageJsonPath)) {
        return []
    }

    try {
        const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'))
        // Handle both array format and object format (Bun workspaces can be either)
        let workspaces: string[] = []
        if (Array.isArray(packageJson.workspaces)) {
            ;({workspaces} = packageJson)
        } else if (packageJson.workspaces && Array.isArray(packageJson.workspaces.packages)) {
            workspaces = packageJson.workspaces.packages
        }

        const packages: string[] = []

        for (const workspace of workspaces) {
            // Handle patterns like "packages/*"
            if (workspace.includes('*')) {
                const pattern = workspace.replace('*', '')
                const packagesDir = join(workspaceRoot, pattern)

                // Read directory and find package.json files
                try {
                    const entries = readdirSync(packagesDir)
                    for (const entry of entries) {
                        // Skip hidden files/directories and ensure it's a directory
                        if (!entry.startsWith('.')) {
                            const entryPath = join(packagesDir, entry)
                            const pkgPath = join(entryPath, 'package.json')
                            // Check if it's a directory and has package.json
                            if (existsSync(entryPath) && existsSync(pkgPath)) {
                                packages.push(entry)
                            }
                        }
                    }
                } catch (error: unknown) {
                    // Directory doesn't exist or can't be read
                    // eslint-disable-next-line no-console
                    console.warn(`[workspace] Failed to read packages directory ${packagesDir}:`, error)
                }
            } else {
                // Direct package path
                const pkgName = workspace.split('/').pop() || workspace
                packages.push(pkgName)
            }
        }

        return packages
    } catch {
        return []
    }
}

/**
 * Check if workspace has packages (from package.json workspaces field)
 */
export function hasWorkspacePackages(workspaceRoot: string): boolean {
    const packages = extractWorkspacePackages(workspaceRoot)
    return packages.length > 0
}
