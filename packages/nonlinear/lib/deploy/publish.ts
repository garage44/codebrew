import {copyFile, readFile, unlink, writeFile} from 'fs/promises'
import {$} from 'bun'
import {join} from 'path'
import {findWorkspaceRoot, extractWorkspacePackages} from './workspace'
import {takeScreenshots} from './screenshot'

// Topological sort to determine publish order
function topologicalSort(graph: Record<string, string[]>): string[] {
    const visited = new Set<string>()
    const temp = new Set<string>()
    const order: string[] = []

    function visit(node: string): void {
        if (temp.has(node)) {
            throw new Error(`Circular dependency detected: ${node}`)
        }
        if (visited.has(node)) {
            return
        }

        temp.add(node)
        for (const dep of graph[node] || []) {
            visit(dep)
        }
        temp.delete(node)
        visited.add(node)
        order.push(node)
    }

    for (const node of Object.keys(graph)) {
        if (!visited.has(node)) {
            visit(node)
        }
    }

    return order
}

// Get current version from package.json
async function getCurrentVersion(packagePath: string): Promise<string> {
    const packageJson = JSON.parse(await readFile(join(packagePath, 'package.json'), 'utf8'))
    return packageJson.version
}

// Bump version (patch increment)
function bumpVersion(version: string): string {
    const [major, minor, patch] = version.split('.').map(Number)
    return `${major}.${minor}.${patch + 1}`
}

// Update package.json version
async function updateVersion(packagePath: string, newVersion: string): Promise<string> {
    const packageJsonPath = join(packagePath, 'package.json')
    const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'))
    packageJson.version = newVersion
    await writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n')
    return newVersion
}

// Build dependency graph from workspace packages
async function buildDependencyGraph(workspaceRoot: string, packages: string[]): Promise<Record<string, string[]>> {
    const graph: Record<string, string[]> = {}

    for (const pkg of packages) {
        const packagePath = join(workspaceRoot, 'packages', pkg)
        const packageJsonPath = join(packagePath, 'package.json')

        try {
            const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'))
            const packageName = packageJson.name

            // Get dependencies from package.json
            const deps: string[] = []
            const allDeps = {
                ...packageJson.dependencies,
                ...packageJson.devDependencies,
                ...packageJson.peerDependencies,
            }

            // Find which dependencies are workspace packages
            for (const [depName, depVersion] of Object.entries(allDeps)) {
                if (depVersion === 'workspace:*' || depVersion === 'workspace:^' || depVersion === 'workspace:~') {
                    deps.push(depName)
                }
            }

            graph[packageName] = deps
        } catch(error) {
            console.warn(`Failed to read package.json for ${pkg}:`, error)
        }
    }

    return graph
}

// Main publish function
export async function publish(): Promise<void> {
    console.log('🚀 Starting monorepo publish...\n')

    try {
        // Find workspace root
        const workspaceRoot = findWorkspaceRoot() || process.cwd()
        console.log(`📁 Workspace root: ${workspaceRoot}\n`)

        // Auto-discover packages from workspace
        const packages = extractWorkspacePackages(workspaceRoot)
        console.log(`📦 Discovered packages: ${packages.join(', ')}\n`)

        // Build packages list with paths
        const packageList = packages.map((pkg) => ({
            name: `@garage44/${pkg}`,
            path: `packages/${pkg}`,
        }))

        // Build dependency graph
        const dependencies = await buildDependencyGraph(workspaceRoot, packages)
        console.log('📋 Dependency graph:', JSON.stringify(dependencies, null, 2), '\n')

        // 1. Take fresh screenshots for README
        console.log('📸 Taking fresh screenshots...')
        try {
            await takeScreenshots()
            console.log('✅ Screenshots updated\n')
        } catch(error) {
            console.warn('⚠️ Screenshot generation failed:', error.message)
            process.exit(1)
        }

        // 2. Build all packages
        console.log('📦 Building packages...')
        process.chdir(workspaceRoot)
        await $`bun run build`
        console.log('✅ Build completed\n')

        // 3. Determine publish order
        const publishOrder = topologicalSort(dependencies)
        console.log('📋 Publish order:', publishOrder.join(' → '), '\n')

        // 4. Collect current versions and bump them
        const packageVersions: Record<string, string> = {}
        for (const packageName of publishOrder) {
            const packageInfo = packageList.find((pkg) => pkg.name === packageName)
            if (packageInfo) {
                const packagePath = join(workspaceRoot, packageInfo.path)
                const currentVersion = await getCurrentVersion(packagePath)
                const newVersion = bumpVersion(currentVersion)
                packageVersions[packageName] = newVersion

                console.log(`📝 ${packageName}: ${currentVersion} → ${newVersion}`)
            }
        }
        console.log()

        // 5. Update versions and publish
        for (const packageName of publishOrder) {
            const packageInfo = packageList.find((pkg) => pkg.name === packageName)
            if (packageInfo) {
                console.log(`🚀 Publishing ${packageName}...`)

                const packagePath = join(workspaceRoot, packageInfo.path)

                // Special handling for expressio package - copy root README
                let readmeCopied = false
                if (packageName === '@garage44/expressio') {
                    try {
                        await copyFile(join(workspaceRoot, 'README.md'), join(packagePath, 'README.md'))
                        console.log('📄 Copied root README.md to expressio package')
                        readmeCopied = true
                    } catch(error) {
                        console.warn('⚠️ Could not copy README.md:', error.message)
                    }
                }

                try {
                    // Update version
                    await updateVersion(packagePath, packageVersions[packageName])

                    // Publish
                    await $`cd ${packagePath} && bun publish`
                    console.log(`✅ ${packageName} published successfully`)
                } catch(error) {
                    console.error(`❌ Failed to publish ${packageName}:`, error.message)
                    throw error
                } finally {
                    // Clean up copied README for expressio package
                    if (readmeCopied) {
                        try {
                            await unlink(join(packagePath, 'README.md'))
                            console.log('🧹 Removed copied README.md from expressio package')
                        } catch(error) {
                            console.warn('⚠️ Could not remove copied README.md:', error.message)
                        }
                    }
                }

                console.log()
            }
        }

        console.log('🎉 All packages published successfully!')

        // 6. Commit version changes to git
        console.log('📦 Committing version changes to git...')
        try {
            // Add all modified package.json files
            for (const packageInfo of packageList) {
                await $`git add ${packageInfo.path}/package.json`
            }

            // Add updated screenshots
            await $`git add .github/screenshot-*.png`

            // Create commit message with all version changes
            const versionChanges = publishOrder
                .map((name) => `${name}@${packageVersions[name]}`)
                .join(', ')

            await $`git commit -m "chore: bump versions and update screenshots - ${versionChanges}"`
            console.log('✅ Version changes committed to git')

            // Push changes to remote
            console.log('🚀 Pushing changes to remote repository...')
            await $`git push`
            console.log('✅ Changes pushed to remote repository')
        } catch(error) {
            console.warn('⚠️ Could not commit/push to git:', error.message)
            console.warn('📝 Please manually commit and push the version changes')
        }
    } catch(error) {
        console.error('❌ Publish failed:', error.message)
        process.exit(1)
    }
}
