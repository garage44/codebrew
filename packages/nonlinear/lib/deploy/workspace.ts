import {readFileSync, existsSync, readdirSync} from 'fs'
import {join, dirname} from 'path'
import {fileURLToPath} from 'url'

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
                const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))

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
        const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))
        // Handle both array format and object format (Bun workspaces can be either)
        let workspaces: string[] = []
        if (Array.isArray(packageJson.workspaces)) {
            workspaces = packageJson.workspaces
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
                        if (entry.startsWith('.')) {
                            continue
                        }
                        const entryPath = join(packagesDir, entry)
                        const pkgPath = join(entryPath, 'package.json')
                        // Check if it's a directory and has package.json
                        if (existsSync(entryPath) && existsSync(pkgPath)) {
                            packages.push(entry)
                        }
                    }
                } catch(error) {
                    // Directory doesn't exist or can't be read
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
 * Determine if a package is an application (gets subdomain)
 * Excludes nonlinear and utility packages
 */
export function isApplicationPackage(packageName: string): boolean {
    // Exclude nonlinear itself
    if (packageName === 'nonlinear') {
        return false
    }

    // Utility packages that don't get subdomains
    const utilityPackages = ['common', 'bunchy', 'enola']
    if (utilityPackages.includes(packageName)) {
        return false
    }

    // Everything else is considered an application
    return true
}

/**
 * Read README file from workspace
 */
export function readReadme(workspaceRoot: string, path: string): string | null {
    const fullPath = join(workspaceRoot, path)

    if (existsSync(fullPath)) {
        try {
            return readFileSync(fullPath, 'utf-8')
        } catch {
            return null
        }
    }

    return null
}

/**
 * Get all package README paths
 */
export function getPackageReadmePaths(workspaceRoot: string): Array<{package: string; path: string}> {
    const packages = extractWorkspacePackages(workspaceRoot)
    const readmePaths: Array<{package: string; path: string}> = []

    for (const pkg of packages) {
        const readmePath = `packages/${pkg}/README.md`
        const fullPath = join(workspaceRoot, readmePath)

        if (existsSync(fullPath)) {
            readmePaths.push({package: pkg, path: readmePath})
        }
    }

    return readmePaths
}
