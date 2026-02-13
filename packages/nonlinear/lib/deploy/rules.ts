import {lstat, mkdir, readlink, rm, stat, symlink} from 'node:fs/promises'
import {join, relative} from 'node:path'
import {findWorkspaceRoot} from './workspace'

/**
 * Create symlink from .cursor/rules to packages/nonlinear/lib/fixtures/rules
 */
export async function rules(): Promise<void> {
    const workspaceRoot = findWorkspaceRoot() || process.cwd()
    const cursorRulesPath = join(workspaceRoot, '.cursor', 'rules')
    const nonlinearRulesPath = join(workspaceRoot, 'packages', 'nonlinear', 'lib', 'fixtures', 'rules')

    // Check if nonlinear rules directory exists
    try {
        const stats = await stat(nonlinearRulesPath)
        if (!stats.isDirectory()) {
            console.error(`❌ ${nonlinearRulesPath} is not a directory`)
            process.exit(1)
        }
    } catch{
        console.error(`❌ Nonlinear rules directory not found: ${nonlinearRulesPath}`)
        process.exit(1)
    }

    // Create .cursor directory if it doesn't exist
    const cursorDir = join(workspaceRoot, '.cursor')
    try {
        await mkdir(cursorDir, {recursive: true})
    } catch(error) {
        console.error('❌ Failed to create .cursor directory:', error)
        process.exit(1)
    }

    /*
     * Check if .cursor/rules already exists and remove it (file, directory, or symlink)
     * Use lstat to detect symlinks (stat follows symlinks)
     */
    try {
        const stats = await lstat(cursorRulesPath)
        // Remove existing file, directory, or symlink
        try {
            await rm(cursorRulesPath, {force: true, recursive: true})
            if (stats.isSymbolicLink()) {
                console.log('ℹ️  Removed existing symlink')
            } else if (stats.isDirectory()) {
                console.log('ℹ️  Removed existing directory')
            } else {
                console.log('ℹ️  Removed existing file')
            }
        } catch(error) {
            console.error('❌ Failed to remove existing file/directory/symlink:', error)
            process.exit(1)
        }
    } catch {
        // Doesn't exist, we'll create it
    }

    /*
     * Create symlink using relative path for portability
     * Calculate relative path from .cursor/ directory to the target directory
     */
    const relativePath = relative(cursorDir, nonlinearRulesPath)
    try {
        await symlink(relativePath, cursorRulesPath, 'dir')

        // Verify the symlink was created correctly
        try {
            const linkStats = await lstat(cursorRulesPath)
            if (!linkStats.isSymbolicLink()) {
                console.error('❌ Created symlink but verification failed: not a symlink')
                process.exit(1)
            }
            const target = await readlink(cursorRulesPath)
            console.log(`✅ Created symlink: ${cursorRulesPath} → ${target}`)
            console.log(`   (points to: ${nonlinearRulesPath})`)
        } catch(error) {
            console.error('❌ Failed to verify symlink:', error)
            process.exit(1)
        }
    } catch(error) {
        console.error('❌ Failed to create symlink:', error)
        process.exit(1)
    }
}
