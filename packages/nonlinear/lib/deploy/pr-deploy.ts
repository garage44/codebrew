import {$} from 'bun'
import {existsSync, mkdirSync} from 'node:fs'
import {homedir} from 'node:os'
import path from 'node:path'
import {
    type PRDeployment,
    addPRDeployment,
    getPRDeployment,
    listActivePRDeployments,
    updatePRDeployment,
} from './pr-registry'
import {extractWorkspacePackages, findWorkspaceRoot, isApplicationPackage} from './workspace'

const PR_DEPLOYMENTS_DIR = path.join(homedir(), '.nonlinear', 'pr-deployments')
const PR_PORT_BASE = 40_000
const PR_PORT_RANGE = 10_000

/**
 * Fetch branches from remote to ensure branch info is available
 * Returns the main repository path
 */
async function fetchMainRepository(): Promise<string | null> {
    const mainRepoPath = process.env.REPO_PATH || findWorkspaceRoot() || process.cwd()

    if (!existsSync(mainRepoPath)) {
        // eslint-disable-next-line no-console
        // eslint-disable-next-line no-console
        console.warn(`[pr-deploy] Main repository path does not exist: ${mainRepoPath}`)
        return null
    }

    if (!existsSync(path.join(mainRepoPath, '.git'))) {
        // eslint-disable-next-line no-console
        // eslint-disable-next-line no-console
        console.warn(`[pr-deploy] Main repository is not a git repository: ${mainRepoPath}`)
        return null
    }

    // eslint-disable-next-line no-console
    // eslint-disable-next-line no-console
    console.log('[pr-deploy] Fetching branches from remote...')
    const originalCwd = process.cwd()

    try {
        process.chdir(mainRepoPath)
        const fetchResult = await $`git fetch origin`.nothrow()
        if (fetchResult.exitCode === 0) {
            // eslint-disable-next-line no-console
            // eslint-disable-next-line no-console
            console.log('[pr-deploy] Branches fetched successfully')
        } else {
            const stderr = fetchResult.stderr?.toString() || ''
            const stdout = fetchResult.stdout?.toString() || ''
            // eslint-disable-next-line no-console
            // eslint-disable-next-line no-console
            console.warn(`[pr-deploy] Git fetch failed (non-fatal): ${stderr || stdout || 'Unknown error'}`)
        }
        return mainRepoPath
    } catch(error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        // eslint-disable-next-line no-console
        console.warn(`[pr-deploy] Git fetch error (non-fatal): ${message}`)
        return mainRepoPath
    } finally {
        process.chdir(originalCwd)
    }
}

/**
 * Get SHA for a branch from the main repository
 * Assumes fetchMainRepository() has already been called
 */
async function getBranchSHA(branch: string): Promise<string | null> {
    const mainRepoPath = process.env.REPO_PATH || findWorkspaceRoot() || process.cwd()

    if (!existsSync(mainRepoPath) || !existsSync(path.join(mainRepoPath, '.git'))) {
        return null
    }

    const originalCwd = process.cwd()
    try {
        process.chdir(mainRepoPath)
        const result = await $`git rev-parse origin/${branch}`.quiet().nothrow()
        if (result.exitCode === 0) {
            return result.stdout.toString().trim()
        }
        return null
    } finally {
        process.chdir(originalCwd)
    }
}

export interface PRMetadata {
    author: string
    head_ref: string
    head_sha: string
    is_fork: boolean
    number: number
    repo_full_name: string
}

/**
 * Validate PR source for deployment
 */
export function validatePRSource(pr: PRMetadata): 'trusted' | 'untrusted' {
    // Block forks completely - only contributors allowed
    if (pr.is_fork) {
        // eslint-disable-next-line no-console
        console.log(`[pr-deploy] PR #${pr.number} is from a fork, deployment blocked`)
        return 'untrusted'
    }

    // Main repo PRs are trusted and get public access
    return 'trusted'
}

/**
 * Allocate ports for PR deployment
 */
export function allocatePRPorts(prNumber: number): {
    expressio: number
    nonlinear: number
    pyrite: number
} {
    const base = PR_PORT_BASE + ((prNumber % PR_PORT_RANGE) * 3)
    return {
        expressio: base,
        nonlinear: base + 1,
        pyrite: base + 2,
    }
}

/**
 * Generate access token for PR deployment
 */
export async function generatePRToken(prNumber: number): Promise<string> {
    const secret = process.env.PR_DEPLOYMENT_SECRET || process.env.WEBHOOK_SECRET || ''
    const data = `pr-${prNumber}-${Date.now()}`

    // Use Bun's built-in crypto
    const encoder = new TextEncoder()
    const key = encoder.encode(secret)
    const message = encoder.encode(data)

    try {
        const cryptoKey = await crypto.subtle.importKey('raw', key, {hash: 'SHA-256', name: 'HMAC'}, false, ['sign'])
        const signature = await crypto.subtle.sign('HMAC', cryptoKey, message)
        return [...new Uint8Array(signature)]
            .map((b): string => b.toString(16).padStart(2, '0'))
            .join('')
            .slice(0, 32)
    } catch {
        // Fallback to simple hash
        return `pr-${prNumber}-token`
    }
}

/**
 * Deploy a PR branch
 */
export async function deployPR(pr: PRMetadata): Promise<{
    deployment: PRDeployment | null
    message: string
    success: boolean
}> {
    try {
        // eslint-disable-next-line no-console
        // eslint-disable-next-line no-console
        console.log(`[pr-deploy] Starting deployment for PR #${pr.number}`)

        // Fetch branches to ensure branch info is available
        await fetchMainRepository()

        // Resolve SHA if not provided
        let {head_sha} = pr
        if (!head_sha) {
            const sha = await getBranchSHA(pr.head_ref)
            if (!sha) {
                return {
                    deployment: null,
                    message: `Failed to resolve SHA for branch ${pr.head_ref}. Make sure the branch exists on remote.`,
                    success: false,
                }
            }
            head_sha = sha
            pr = {...pr, head_sha: sha}
        }

        // Validate PR source - block forks completely
        const trustLevel = validatePRSource(pr)
        if (trustLevel !== 'trusted') {
            return {
                deployment: null,
                message: `PR #${pr.number} blocked - only contributor PRs allowed (no forks)`,
                success: false,
            }
        }

        // Check if already deployed
        const existing = await getPRDeployment(pr.number)
        if (existing && existing.status === 'running') {
            // eslint-disable-next-line no-console
            // eslint-disable-next-line no-console
            console.log(`[pr-deploy] PR #${pr.number} already deployed, updating...`)
            return await updateExistingPRDeployment(pr)
        }

        // Create deployment directory
        const prDir = path.join(PR_DEPLOYMENTS_DIR, `pr-${pr.number}`)
        const repoDir = path.join(prDir, 'repo')
        const logsDir = path.join(prDir, 'logs')
        const dataDir = path.join(prDir, 'data')

        if (!existsSync(prDir)) {
            mkdirSync(prDir, {recursive: true})
        }
        if (!existsSync(logsDir)) {
            mkdirSync(logsDir, {recursive: true})
        }
        if (!existsSync(dataDir)) {
            mkdirSync(dataDir, {recursive: true})
        }

        // Allocate ports
        const ports = allocatePRPorts(pr.number)

        // Generate access token
        const token = await generatePRToken(pr.number)

        // Create deployment record
        const deployment: PRDeployment = {
            author: pr.author,
            created: Date.now(),
            directory: prDir,
            head_ref: pr.head_ref,
            head_sha: head_sha,
            number: pr.number,
            ports,
            status: 'deploying',
            token,
            updated: Date.now(),
        }

        await addPRDeployment(deployment)

        // Clone or pull repository
        if (existsSync(repoDir)) {
            // eslint-disable-next-line no-console
            console.log('[pr-deploy] Repository directory already exists, skipping clone')
        } else {
            // eslint-disable-next-line no-console
            console.log('[pr-deploy] Cloning repository...')

            /*
             * Use GitHub URL instead of local path for cloning
             * Construct URL from repo_full_name (e.g., "owner/repo" -> "https://github.com/owner/repo.git")
             */
            const githubUrl = `https://github.com/${pr.repo_full_name}.git`
            // eslint-disable-next-line no-console
            console.log(`[pr-deploy] Source: ${githubUrl}`)
            // eslint-disable-next-line no-console
            console.log(`[pr-deploy] Target: ${repoDir}`)
            const cloneResult = await $`git clone ${githubUrl} ${repoDir}`.nothrow()
            if (cloneResult.exitCode !== 0) {
                const stderr = cloneResult.stderr?.toString() || ''
                const stdout = cloneResult.stdout?.toString() || ''
                const errorDetails = stderr || stdout || 'Unknown clone error'
                // eslint-disable-next-line no-console
                console.error(`[pr-deploy] Clone failed with exit code ${cloneResult.exitCode}`)
                // eslint-disable-next-line no-console
                console.error(`[pr-deploy] Clone stderr: ${stderr}`)
                // eslint-disable-next-line no-console
                console.error(`[pr-deploy] Clone stdout: ${stdout}`)
                await updatePRDeployment(pr.number, {status: 'failed'})
                throw new Error(`Failed to clone repository: ${errorDetails.slice(0, 500)}`)
            }
            // eslint-disable-next-line no-console
            console.log('[pr-deploy] Repository cloned successfully')
        }

        // Fetch and checkout PR branch
        // eslint-disable-next-line no-console
        console.log(`[pr-deploy] Checking out PR branch ${pr.head_ref}...`)
        process.chdir(repoDir)
        // eslint-disable-next-line no-console
        console.log(`[pr-deploy] Working directory: ${process.cwd()}`)

        // Ensure remote is set correctly (in case repo was cloned from local path previously)
        const githubUrl = `https://github.com/${pr.repo_full_name}.git`
        const remoteSetResult = await $`git remote set-url origin ${githubUrl}`.nothrow()
        if (remoteSetResult.exitCode !== 0) {
            // eslint-disable-next-line no-console
            console.warn('[pr-deploy] Failed to update remote URL, continuing with existing remote')
        }

        const fetchResult = await $`git fetch origin ${pr.head_ref}`.quiet()
        if (fetchResult.exitCode !== 0) {
            await updatePRDeployment(pr.number, {status: 'failed'})
            throw new Error('Failed to fetch PR branch')
        }

        const checkoutResult = await $`git checkout ${head_sha}`.quiet()
        if (checkoutResult.exitCode !== 0) {
            await updatePRDeployment(pr.number, {status: 'failed'})
            throw new Error('Failed to checkout PR commit')
        }
        // eslint-disable-next-line no-console
        console.log(`[pr-deploy] Checked out commit: ${head_sha}`)

        // Install dependencies (must be run from workspace root)
        // eslint-disable-next-line no-console
        console.log('[pr-deploy] Installing dependencies...')
        // eslint-disable-next-line no-console
        console.log(`[pr-deploy] Installing from: ${process.cwd()}`)

        // First, install workspace dependencies
        const installResult = await $`bun install`.nothrow()
        if (installResult.exitCode !== 0) {
            const stderr = installResult.stderr?.toString() || ''
            const stdout = installResult.stdout?.toString() || ''
            const errorDetails = stderr || stdout || 'Unknown install error'
            // eslint-disable-next-line no-console
            console.error(`[pr-deploy] Install failed with exit code ${installResult.exitCode}`)
            // eslint-disable-next-line no-console
            console.error(`[pr-deploy] Install stderr: ${stderr}`)
            // eslint-disable-next-line no-console
            console.error(`[pr-deploy] Install stdout: ${stdout}`)
            await updatePRDeployment(pr.number, {status: 'failed'})
            throw new Error(`Failed to install dependencies: ${errorDetails.slice(0, 500)}`)
        }
        // eslint-disable-next-line no-console
        console.log('[pr-deploy] Dependencies installed successfully')

        // Build packages
        // eslint-disable-next-line no-console
        console.log('[pr-deploy] Building packages...')
        try {
            // Run build without quiet() first to capture any errors
            const buildResult = await $`bun run build`.nothrow()
            if (buildResult.exitCode !== 0) {
                const stderr = buildResult.stderr?.toString() || ''
                const stdout = buildResult.stdout?.toString() || ''
                const errorOutput = stderr || stdout || 'Unknown build error'
                // eslint-disable-next-line no-console
                console.error(`[pr-deploy] Build failed with exit code ${buildResult.exitCode}`)
                // eslint-disable-next-line no-console
                console.error(`[pr-deploy] Build stderr: ${stderr}`)
                // eslint-disable-next-line no-console
                console.error(`[pr-deploy] Build stdout: ${stdout}`)
                await updatePRDeployment(pr.number, {status: 'failed'})
                throw new Error(`Build failed: ${errorOutput.slice(0, 1000)}`)
            }
            // eslint-disable-next-line no-console
            console.log('[pr-deploy] Build completed successfully')
        } catch(error: unknown) {
            if (error instanceof Error && error.message.includes('Build failed')) {
                throw error
            }
            await updatePRDeployment(pr.number, {status: 'failed'})
            throw new Error(`Build failed: ${error instanceof Error ? error.message : String(error)}`, {cause: error})
        }

        // Discover which packages to deploy
        const packagesToDeploy = discoverPackagesToDeploy(repoDir)
        // eslint-disable-next-line no-console
        console.log(`[pr-deploy] Discovered packages to deploy: ${packagesToDeploy.join(', ')}`)

        // Generate systemd service files
        await generateSystemdServices(deployment, packagesToDeploy)

        // Generate nginx configuration
        await generateNginxConfig(deployment, packagesToDeploy)

        // Start services
        // eslint-disable-next-line no-console
        console.log('[pr-deploy] Starting services...')
        for (const packageName of packagesToDeploy) {
            const startResult = await $`sudo systemctl start pr-${pr.number}-${packageName}.service`.nothrow()
            if (startResult.exitCode === 0) {
                // eslint-disable-next-line no-console
                console.log(`[pr-deploy] Started ${packageName} service`)
            } else {
                const stderr = startResult.stderr?.toString() || ''
                const stdout = startResult.stdout?.toString() || ''
                const errorDetails = stderr || stdout || 'Unknown error'
                // eslint-disable-next-line no-console
                console.error(`[pr-deploy] Failed to start ${packageName} service`)
                // eslint-disable-next-line no-console
                console.error(`[pr-deploy] systemctl stderr: ${stderr}`)
                // eslint-disable-next-line no-console
                console.error(`[pr-deploy] systemctl stdout: ${stdout}`)
                // Check service status for more details
                const statusResult = await $`sudo systemctl status pr-${pr.number}-${packageName}.service --no-pager -l`.nothrow()
                if (statusResult.exitCode === 0) {
                    const statusOutput = statusResult.stdout?.toString() || ''
                    // eslint-disable-next-line no-console
                    console.error(`[pr-deploy] Service status:\n${statusOutput}`)
                }
                throw new Error(`Failed to start ${packageName} service: ${errorDetails}`)
            }
        }

        // Update deployment status
        await updatePRDeployment(pr.number, {status: 'running'})

        // Port mapping for display
        const portMap: Record<string, number> = {
            expressio: deployment.ports.expressio,
            nonlinear: deployment.ports.nonlinear,
            pyrite: deployment.ports.pyrite,
        }

        // eslint-disable-next-line no-console
        console.log(`[pr-deploy] PR #${pr.number} deployed successfully`)
        // eslint-disable-next-line no-console
        console.log('[pr-deploy] URLs (public access, no token required):')
        for (const packageName of packagesToDeploy) {
            const port = portMap[packageName] || deployment.ports.nonlinear
            const subdomain = `pr-${pr.number}-${packageName}.garage44.org`
            // eslint-disable-next-line no-console
            console.log(`[pr-deploy]   ${packageName}: https://${subdomain} (port ${port})`)
        }

        /*
         * Note: We do NOT restart the main nonlinear service here because:
         * 1. PR deployments don't affect the main nonlinear service
         * 2. Restarting during a webhook request would kill the connection
         * 3. The main service only needs restart on main branch deployments
         */

        return {
            deployment: {
                ...deployment,
                status: 'running',
            },
            message: `PR #${pr.number} deployed successfully`,
            success: true,
        }
    } catch(error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        // eslint-disable-next-line no-console
        console.error(`[pr-deploy] Deployment failed: ${message}`)

        /*
         * Note: We do NOT restart the main nonlinear service here because:
         * 1. PR deployments don't affect the main nonlinear service
         * 2. Restarting during a webhook request would kill the connection
         * 3. The main service only needs restart on main branch deployments
         */

        return {
            deployment: null,
            message: `Deployment failed: ${message}`,
            success: false,
        }
    }
}

/**
 * Update an existing PR deployment
 */
async function updateExistingPRDeployment(pr: PRMetadata): Promise<{
    deployment: PRDeployment | null
    message: string
    success: boolean
}> {
    const existing = await getPRDeployment(pr.number)
    if (!existing) {
        return {
            deployment: null,
            message: `PR #${pr.number} not found`,
            success: false,
        }
    }

    try {
        // eslint-disable-next-line no-console
        console.log(`[pr-deploy] Updating PR #${pr.number}...`)

        // Fetch branches to ensure branch info is available
        await fetchMainRepository()

        // Resolve SHA if not provided
        let {head_sha} = pr
        if (!head_sha) {
            const sha = await getBranchSHA(pr.head_ref)
            if (!sha) {
                throw new Error(`Failed to resolve SHA for branch ${pr.head_ref}. Make sure the branch exists on remote.`)
            }
            head_sha = sha
            pr = {...pr, head_sha: sha}
        }

        const repoDir = path.join(existing.directory, 'repo')

        // Verify repo directory exists
        if (!existsSync(repoDir)) {
            throw new Error(`Repository directory not found: ${repoDir}`)
        }

        process.chdir(repoDir)

        // Fetch and checkout new commit
        // eslint-disable-next-line no-console
        console.log(`[pr-deploy] Fetching branch ${pr.head_ref}...`)
        // Ensure remote is set correctly (in case it was cloned from local path previously)
        const githubUrl = `https://github.com/${pr.repo_full_name}.git`
        const remoteSetResult = await $`git remote set-url origin ${githubUrl}`.nothrow()
        if (remoteSetResult.exitCode !== 0) {
            // eslint-disable-next-line no-console
            console.warn('[pr-deploy] Failed to update remote URL, continuing with existing remote')
        }
        const fetchResult = await $`git fetch origin ${pr.head_ref}`.nothrow()
        if (fetchResult.exitCode !== 0) {
            const stderr = fetchResult.stderr?.toString() || ''
            const stdout = fetchResult.stdout?.toString() || ''
            throw new Error(`Failed to fetch branch ${pr.head_ref}: ${stderr || stdout || 'Unknown error'}`)
        }

        // eslint-disable-next-line no-console
        console.log(`[pr-deploy] Checking out commit ${head_sha}...`)
        const checkoutResult = await $`git checkout ${head_sha}`.nothrow()
        if (checkoutResult.exitCode !== 0) {
            const stderr = checkoutResult.stderr?.toString() || ''
            const stdout = checkoutResult.stdout?.toString() || ''
            throw new Error(`Failed to checkout commit ${head_sha}: ${stderr || stdout || 'Unknown error'}`)
        }
        // eslint-disable-next-line no-console
        console.log(`[pr-deploy] Checked out commit: ${head_sha}`)

        // Rebuild
        // eslint-disable-next-line no-console
        console.log('[pr-deploy] Installing dependencies...')
        const installResult = await $`bun install`.nothrow()
        if (installResult.exitCode !== 0) {
            const stderr = installResult.stderr?.toString() || ''
            const stdout = installResult.stdout?.toString() || ''
            throw new Error(`Failed to install dependencies: ${stderr || stdout || 'Unknown error'}`)
        }

        // eslint-disable-next-line no-console
        console.log('[pr-deploy] Building packages...')
        const buildResult = await $`bun run build`.nothrow()
        if (buildResult.exitCode !== 0) {
            const stderr = buildResult.stderr?.toString() || ''
            const stdout = buildResult.stdout?.toString() || ''
            throw new Error(`Build failed: ${stderr || stdout || 'Unknown error'}`)
        }
        // eslint-disable-next-line no-console
        console.log('[pr-deploy] Build completed successfully')

        // Discover which packages to deploy
        const packagesToDeploy = discoverPackagesToDeploy(repoDir)
        // eslint-disable-next-line no-console
        console.log(`[pr-deploy] Discovered packages to restart: ${packagesToDeploy.join(', ')}`)

        // Regenerate systemd service files (in case packages changed or files are missing)
        // eslint-disable-next-line no-console
        console.log('[pr-deploy] Regenerating systemd service files...')
        await generateSystemdServices(existing, packagesToDeploy)

        // Regenerate nginx configs to ensure correct port mapping
        // eslint-disable-next-line no-console
        console.log('[pr-deploy] Regenerating nginx configurations...')
        await generateNginxConfig(existing, packagesToDeploy)

        // Stop services first to ensure clean restart
        // eslint-disable-next-line no-console
        console.log('[pr-deploy] Stopping services...')
        for (const packageName of packagesToDeploy) {
            const port = existing.ports[packageName as keyof typeof existing.ports] || existing.ports.nonlinear
            const serviceName = `pr-${pr.number}-${packageName}.service`

            // Try to stop via systemctl first
            const stopResult = await $`sudo /usr/bin/systemctl stop ${serviceName}`.nothrow()
            if (stopResult.exitCode === 0) {
                // eslint-disable-next-line no-console
                console.log(`[pr-deploy] Stopped ${packageName} service`)
            } else {
                // Log warning but continue - service might not be running
                const stderr = stopResult.stderr?.toString() || ''
                const stdout = stopResult.stdout?.toString() || ''
                // eslint-disable-next-line no-console
                console.warn(
                    `[pr-deploy] Warning: Failed to stop ${packageName} service via systemctl: ${
                        stderr || stdout || 'Unknown error'
                    }`,
                )

                // Try to kill any processes holding the port as fallback
                // eslint-disable-next-line no-console
                console.log(`[pr-deploy] Attempting to kill processes on port ${port}...`)
                const killResult = await $`sudo fuser -k ${port}/tcp`.nothrow()
                if (killResult.exitCode === 0) {
                    // eslint-disable-next-line no-console
                    console.log(`[pr-deploy] Killed processes on port ${port}`)
                } else {
                    // eslint-disable-next-line no-console
                    console.warn(`[pr-deploy] No processes found on port ${port} (or fuser not available)`)
                }
            }
        }

        // Wait a moment for processes to fully stop and ports to be released
        // eslint-disable-next-line no-console
        console.log('[pr-deploy] Waiting for processes to fully stop...')
        await new Promise<void>((resolve): void => {
            setTimeout((): void => {
                resolve()
            }, 2000)
        })

        // Start services
        // eslint-disable-next-line no-console
        console.log('[pr-deploy] Starting services...')
        for (const packageName of packagesToDeploy) {
            const startResult = await $`sudo /usr/bin/systemctl start pr-${pr.number}-${packageName}.service`.nothrow()
            if (startResult.exitCode === 0) {
                // eslint-disable-next-line no-console
                console.log(`[pr-deploy] Started ${packageName} service`)
            } else {
                const stderr = startResult.stderr?.toString() || ''
                const stdout = startResult.stdout?.toString() || ''
                // Check if service exists
                const statusResult = await $`sudo systemctl status pr-${pr.number}-${packageName}.service --no-pager -l`.nothrow()
                const statusOutput = statusResult.stdout?.toString() || ''
                throw new Error(
                    `Failed to start ${packageName} service: ${
                        stderr || stdout || 'Unknown error'
                    }\nService status: ${statusOutput}`,
                )
            }
        }

        // Update deployment record
        await updatePRDeployment(pr.number, {
            head_sha: head_sha,
            status: 'running',
        })

        // eslint-disable-next-line no-console
        console.log(`[pr-deploy] PR #${pr.number} updated successfully`)

        /*
         * Note: We do NOT restart the main nonlinear service here because:
         * 1. PR deployments don't affect the main nonlinear service
         * 2. Restarting during a webhook request would kill the connection
         * 3. The main service only needs restart on main branch deployments
         */

        return {
            deployment: existing,
            message: `PR #${pr.number} updated successfully`,
            success: true,
        }
    } catch(error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        // eslint-disable-next-line no-console
        console.error(`[pr-deploy] Update failed: ${message}`)

        // Update deployment status to failed
        try {
            await updatePRDeployment(pr.number, {status: 'failed'})
        } catch(error: unknown) {
            // eslint-disable-next-line no-console
            console.error('[pr-deploy] Failed to update deployment status:', error)
        }

        /*
         * Note: We do NOT restart the main nonlinear service here because:
         * 1. PR deployments don't affect the main nonlinear service
         * 2. Restarting during a webhook request would kill the connection
         * 3. The main service only needs restart on main branch deployments
         */

        return {
            deployment: null,
            message: `Update failed: ${message}`,
            success: false,
        }
    }
}

/**
 * Update PR deployment by merging main into the PR branch
 * Returns true if merge was successful and deployment updated, false if conflicts or errors
 */
async function updatePRDeploymentWithMain(deployment: PRDeployment): Promise<boolean> {
    const repoDir = path.join(deployment.directory, 'repo')

    // Verify repo directory exists
    if (!existsSync(repoDir)) {
        // eslint-disable-next-line no-console
        console.warn(`[pr-deploy] Repository directory not found for PR #${deployment.number}: ${repoDir}`)
        return false
    }

    const originalCwd = process.cwd()

    try {
        process.chdir(repoDir)

        /**
         * Get the repo name from the git remote (or use default)
         * Default fallback
         */
        let repoFullName = 'garage44/garage44'
        const remoteUrlResult = await $`git remote get-url origin`.nothrow()
        if (remoteUrlResult.exitCode === 0) {
            const remoteUrl = remoteUrlResult.stdout?.toString().trim() || ''
            // Extract repo name from URL (e.g., "https://github.com/owner/repo.git" -> "owner/repo")
            const match = remoteUrl.match(/github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?$/)
            if (match) {
                repoFullName = `${match[1]}/${match[2]}`
            }
        }

        // Ensure remote is set correctly
        const githubUrl = `https://github.com/${repoFullName}.git`
        await $`git remote set-url origin ${githubUrl}`.nothrow()

        // Fetch latest from origin
        // eslint-disable-next-line no-console
        console.log(`[pr-deploy] Fetching latest from origin for PR #${deployment.number}...`)
        const fetchResult = await $`git fetch origin main ${deployment.head_ref}`.nothrow()
        if (fetchResult.exitCode !== 0) {
            const stderr = fetchResult.stderr?.toString() || ''
            // eslint-disable-next-line no-console
            console.warn(`[pr-deploy] Failed to fetch for PR #${deployment.number}: ${stderr}`)
            return false
        }

        // Checkout the PR branch (or create it if it doesn't exist locally)
        // eslint-disable-next-line no-console
        console.log(`[pr-deploy] Checking out branch ${deployment.head_ref} for PR #${deployment.number}...`)
        // First try to checkout the branch
        let checkoutResult = await $`git checkout ${deployment.head_ref}`.nothrow()
        if (checkoutResult.exitCode !== 0) {
            // Branch might not exist locally, try to create it from the remote branch
            checkoutResult = await $`git checkout -b ${deployment.head_ref} origin/${deployment.head_ref}`.nothrow()
            if (checkoutResult.exitCode !== 0) {
                // If that fails, try checking out the commit SHA directly
                checkoutResult = await $`git checkout ${deployment.head_sha}`.nothrow()
                if (checkoutResult.exitCode !== 0) {
                    const stderr = checkoutResult.stderr?.toString() || ''
                    // eslint-disable-next-line no-console
                    console.warn(`[pr-deploy] Failed to checkout branch/commit for PR #${deployment.number}: ${stderr}`)
                    return false
                }
            }
        }

        // Try to merge main into the PR branch
        // eslint-disable-next-line no-console
        console.log(`[pr-deploy] Attempting to merge main into ${deployment.head_ref} for PR #${deployment.number}...`)
        const mergeResult = await $`git merge origin/main --no-edit`.nothrow()

        if (mergeResult.exitCode !== 0) {
            // Check if it's a merge conflict
            const stderr = mergeResult.stderr?.toString() || ''
            const stdout = mergeResult.stdout?.toString() || ''
            const output = (stderr + stdout).toLowerCase()

            if (output.includes('conflict') || output.includes('merge conflict')) {
                // eslint-disable-next-line no-console
                console.log(`[pr-deploy] Merge conflicts detected for PR #${deployment.number}, skipping update`)
                // Abort the merge
                await $`git merge --abort`.nothrow()
                return false
            }

            // Other merge errors
            // eslint-disable-next-line no-console
            console.warn(`[pr-deploy] Merge failed for PR #${deployment.number}: ${stderr || stdout}`)
            // Try to abort the merge if it's in progress
            await $`git merge --abort`.nothrow()
            return false
        }

        // Merge successful! Get the new SHA
        const newShaResult = await $`git rev-parse HEAD`.nothrow()
        if (newShaResult.exitCode !== 0) {
            // eslint-disable-next-line no-console
            console.warn(`[pr-deploy] Failed to get new SHA for PR #${deployment.number}`)
            return false
        }
        const newSha = newShaResult.stdout?.toString().trim() || ''

        // eslint-disable-next-line no-console
        console.log(`[pr-deploy] Successfully merged main into PR #${deployment.number}, new SHA: ${newSha}`)

        // Now rebuild and redeploy
        // eslint-disable-next-line no-console
        console.log(`[pr-deploy] Installing dependencies for PR #${deployment.number}...`)
        const installResult = await $`bun install`.nothrow()
        if (installResult.exitCode !== 0) {
            const stderr = installResult.stderr?.toString() || ''
            // eslint-disable-next-line no-console
            console.warn(`[pr-deploy] Failed to install dependencies for PR #${deployment.number}: ${stderr}`)
            return false
        }

        // eslint-disable-next-line no-console
        console.log(`[pr-deploy] Building packages for PR #${deployment.number}...`)
        const buildResult = await $`bun run build`.nothrow()
        if (buildResult.exitCode !== 0) {
            const stderr = buildResult.stderr?.toString() || ''
            // eslint-disable-next-line no-console
            console.warn(`[pr-deploy] Build failed for PR #${deployment.number}: ${stderr}`)
            return false
        }

        // Discover which packages to deploy
        const packagesToDeploy = discoverPackagesToDeploy(repoDir)
        // eslint-disable-next-line no-console
        console.log(`[pr-deploy] Discovered packages to restart for PR #${deployment.number}: ${packagesToDeploy.join(', ')}`)

        // Regenerate systemd service files
        // eslint-disable-next-line no-console
        console.log(`[pr-deploy] Regenerating systemd service files for PR #${deployment.number}...`)
        await generateSystemdServices(deployment, packagesToDeploy)

        // Regenerate nginx configs
        // eslint-disable-next-line no-console
        console.log(`[pr-deploy] Regenerating nginx configurations for PR #${deployment.number}...`)
        await generateNginxConfig(deployment, packagesToDeploy)

        // Stop services first
        // eslint-disable-next-line no-console
        console.log(`[pr-deploy] Stopping services for PR #${deployment.number}...`)
        for (const packageName of packagesToDeploy) {
            const port = deployment.ports[packageName as keyof typeof deployment.ports] || deployment.ports.nonlinear
            const serviceName = `pr-${deployment.number}-${packageName}.service`

            const stopResult = await $`sudo /usr/bin/systemctl stop ${serviceName}`.nothrow()
            if (stopResult.exitCode !== 0) {
                // Try to kill processes on the port
                await $`sudo fuser -k ${port}/tcp`.nothrow()
            }
        }

        // Wait for processes to stop
        await new Promise<void>((resolve): void => {
            setTimeout((): void => {
                resolve()
            }, 2000)
        })

        // Start services
        // eslint-disable-next-line no-console
        console.log(`[pr-deploy] Starting services for PR #${deployment.number}...`)
        for (const packageName of packagesToDeploy) {
            const startResult = await $`sudo /usr/bin/systemctl start pr-${deployment.number}-${packageName}.service`.nothrow()
            if (startResult.exitCode !== 0) {
                const stderr = startResult.stderr?.toString() || ''
                // eslint-disable-next-line no-console
                console.warn(`[pr-deploy] Failed to start ${packageName} service for PR #${deployment.number}: ${stderr}`)
                // Continue with other services
            }
        }

        // Update deployment record with new SHA
        await updatePRDeployment(deployment.number, {
            head_sha: newSha,
            status: 'running',
        })

        // eslint-disable-next-line no-console
        console.log(`[pr-deploy] PR #${deployment.number} successfully updated with main branch changes`)
        return true
    } catch(error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        // eslint-disable-next-line no-console
        console.error(`[pr-deploy] Error updating PR #${deployment.number} with main: ${message}`)
        return false
    } finally {
        process.chdir(originalCwd)
    }
}

/**
 * Update all active PR deployments with latest main branch changes
 * Only updates deployments where merge is successful (no conflicts)
 */
export async function updateAllPRDeploymentsWithMain(): Promise<{
    failed: number
    message: string
    skipped: number
    updated: number
}> {
    try {
        // eslint-disable-next-line no-console
        console.log('[pr-deploy] Checking for active PR deployments to update with main...')

        // Fetch main repository to ensure we have latest
        await fetchMainRepository()

        const activeDeployments = await listActivePRDeployments()

        if (activeDeployments.length === 0) {
            // eslint-disable-next-line no-console
            console.log('[pr-deploy] No active PR deployments to update')
            return {
                failed: 0,
                message: 'No active PR deployments to update',
                skipped: 0,
                updated: 0,
            }
        }

        // eslint-disable-next-line no-console
        console.log(`[pr-deploy] Found ${activeDeployments.length} active PR deployment(s) to update`)

        let updated = 0
        let skipped = 0
        const failed = 0

        // Update each deployment
        for (const deployment of activeDeployments) {
            // eslint-disable-next-line no-console
            console.log(`[pr-deploy] Updating PR #${deployment.number} (${deployment.head_ref})...`)

            const success = await updatePRDeploymentWithMain(deployment)

            if (success) {
                updated += 1
                // eslint-disable-next-line no-console
                console.log(`[pr-deploy] ✅ PR #${deployment.number} updated successfully`)
            } else {
                /*
                 * Check if it was skipped due to conflicts or failed due to errors
                 * For now, we'll count merge conflicts as skipped and other errors as failed
                 */
                skipped += 1
                // eslint-disable-next-line no-console
                console.log(`[pr-deploy] ⏭️  PR #${deployment.number} skipped (merge conflicts or errors)`)
            }
        }

        const message = `Updated ${updated} PR deployment(s), skipped ${skipped} (conflicts or errors)`
        // eslint-disable-next-line no-console
        console.log(`[pr-deploy] ${message}`)

        return {
            failed,
            message,
            skipped,
            updated,
        }
    } catch(error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        // eslint-disable-next-line no-console
        console.error(`[pr-deploy] Error updating PR deployments with main: ${message}`)
        return {
            failed: 0,
            message: `Failed to update PR deployments: ${message}`,
            skipped: 0,
            updated: 0,
        }
    }
}

/**
 * Discover which packages should be deployed for a PR
 */
function discoverPackagesToDeploy(repoDir: string): string[] {
    const allPackages = extractWorkspacePackages(repoDir)
    const appPackages = allPackages.filter((pkg): boolean => isApplicationPackage(pkg))
    // Always include nonlinear
    return [...appPackages, 'nonlinear']
}

/**
 * Generate systemd service files for PR deployment
 */
async function generateSystemdServices(deployment: PRDeployment, packagesToDeploy: string[]): Promise<void> {
    // Map package names to port allocations
    const portMap: Record<string, number> = {
        expressio: deployment.ports.expressio,
        nonlinear: deployment.ports.nonlinear,
        pyrite: deployment.ports.pyrite,
    }

    for (const packageName of packagesToDeploy) {
        const port = portMap[packageName] || deployment.ports.nonlinear
        const workdir = path.join(deployment.directory, `repo/packages/${packageName}`)

        // Check if package directory exists
        if (!existsSync(workdir)) {
            // eslint-disable-next-line no-console
            console.warn(`[pr-deploy] Package directory not found: ${workdir}, skipping ${packageName}`)
            continue
        }

        const serviceFile = `/etc/systemd/system/pr-${deployment.number}-${packageName}.service`
        // Use isolated database and config paths for PR deployments
        const prDataDir = path.join(deployment.directory, 'data')
        const dbPath = path.join(prDataDir, `${packageName}.db`)
        const configPath = path.join(prDataDir, `.${packageName}rc`)
        // Use absolute path to service.ts to avoid path resolution issues
        const serviceTsPath = path.join(workdir, 'service.ts')

        const content = `[Unit]
Description=PR #${deployment.number} ${packageName} service
After=network.target

[Service]
Type=simple
User=garage44
Group=garage44
WorkingDirectory=${workdir}
Environment="NODE_ENV=production"
Environment="BUN_ENV=production"
Environment="DB_PATH=${dbPath}"
Environment="CONFIG_PATH=${configPath}"
Environment="PATH=/home/garage44/.bun/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
ExecStart=/home/garage44/.bun/bin/bun ${serviceTsPath} start --port ${port}
Restart=no
StandardOutput=journal
StandardError=journal

# Resource limits for PR deployments
MemoryMax=512M
MemoryHigh=400M
CPUQuota=50%
TasksMax=100

[Install]
WantedBy=multi-user.target
`

        /*
         * Write service file using sudo (required for /etc/systemd/system/)
         * Use a temporary file and then move it with sudo to avoid shell escaping issues
         */
        const tempFile = `/tmp/pr-${deployment.number}-${packageName}.service`
        await Bun.write(tempFile, content)
        const writeResult = await $`sudo mv ${tempFile} ${serviceFile}`.nothrow()
        if (writeResult.exitCode !== 0) {
            const stderr = writeResult.stderr?.toString() || ''
            const stdout = writeResult.stdout?.toString() || ''
            // Clean up temp file if move failed
            try {
                if (await Bun.file(tempFile).exists()) {
                    await Bun.file(tempFile).unlink()
                }
            } catch {
                // Ignore cleanup errors
            }
            throw new Error(`Failed to write systemd service file: ${stderr || stdout}`)
        }
        // eslint-disable-next-line no-console
        console.log(`[pr-deploy] Generated systemd service for ${packageName}`)
    }

    // Reload systemd
    const reloadResult = await $`sudo systemctl daemon-reload`.nothrow()
    if (reloadResult.exitCode !== 0) {
        const stderr = reloadResult.stderr?.toString() || ''
        const stdout = reloadResult.stdout?.toString() || ''
        throw new Error(`Failed to reload systemd daemon: ${stderr || stdout || 'Unknown error'}`)
    }
    // eslint-disable-next-line no-console
    console.log('[pr-deploy] Systemd daemon reloaded')
}

/**
 * Generate nginx configuration for PR deployment
 * Public access for contributor PRs (no token required)
 * Creates separate subdomains for each package: pr-{number}.{package}.garage44.org
 */
async function generateNginxConfig(deployment: PRDeployment, packagesToDeploy: string[]): Promise<void> {
    const prNumber = deployment.number
    const baseDomain = 'garage44.org'

    // Port mapping for packages
    const portMap: Record<string, number> = {
        expressio: deployment.ports.expressio,
        nonlinear: deployment.ports.nonlinear,
        pyrite: deployment.ports.pyrite,
    }

    // Validate that ports are different (sanity check)
    const uniquePorts = new Set(Object.values(portMap))
    if (uniquePorts.size !== Object.keys(portMap).length) {
        // eslint-disable-next-line no-console
        console.warn(`[pr-deploy] WARNING: Some packages have duplicate ports! Ports: ${JSON.stringify(portMap)}`)
    }

    // Packages that need WebSocket support
    const websocketPackages = new Set(['expressio', 'pyrite', 'nonlinear'])

    // Generate nginx config for each package
    for (const packageName of packagesToDeploy) {
        const port = portMap[packageName] || deployment.ports.nonlinear

        // Validate port is in the expected range
        if (port < PR_PORT_BASE || port >= PR_PORT_BASE + PR_PORT_RANGE) {
            // eslint-disable-next-line no-console
            console.warn(
                `[pr-deploy] WARNING: Port ${port} for ${packageName} is outside expected range [${
                    PR_PORT_BASE
                }, ${PR_PORT_BASE + PR_PORT_RANGE})`,
            )
        }

        // Log port mapping for debugging
        // eslint-disable-next-line no-console
        console.log(
            `[pr-deploy] Generating nginx config for ${packageName}: port ${port} ` +
            `(subdomain: pr-${prNumber}-${packageName}.${baseDomain})`,
        )

        // Use single-level subdomain (pr-999-nonlinear.garage44.org) to work with *.garage44.org wildcard cert
        const subdomain = `pr-${prNumber}-${packageName}.${baseDomain}`
        const configFile = `/etc/nginx/sites-available/${subdomain}`
        const enabledLink = `/etc/nginx/sites-enabled/${subdomain}`

        let content = `# PR #${prNumber} - ${packageName} service (subdomain: ${subdomain})
# Note: Rate limiting can be added by defining limit_req_zone in main nginx.conf
# limit_req_zone $binary_remote_addr zone=pr_public:10m rate=10r/s;

# HTTP to HTTPS redirect
server {
    listen 80;
    server_name ${subdomain};
    return 301 https://$server_name$request_uri;
}

# HTTPS server
server {
    listen 443 ssl;
    http2 on;
    server_name ${subdomain};

    # Wildcard SSL certificate
    ssl_certificate /etc/letsencrypt/live/garage44.org/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/garage44.org/privkey.pem;

    # SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # Prevent search engine indexing
    add_header X-Robots-Tag "noindex, nofollow, noarchive" always;

    # PR deployment indicator
    add_header X-PR-Deployment "${prNumber}" always;

    # Rate limiting for public access (uncomment if zone is defined in main nginx.conf)
    # limit_req zone=pr_public burst=20 nodelay;
    # limit_req_status 429;
`

        // Add WebSocket support for packages that need it
        if (websocketPackages.has(packageName)) {
            if (packageName === 'pyrite') {
                // Pyrite has both /ws and /sfu endpoints
                content += `
    # SFU WebSocket endpoint (Galène)
    location /sfu {
        proxy_pass http://localhost:${port};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
    }
`
            }

            content += `
    # WebSocket endpoint
    location /ws {
        proxy_pass http://localhost:${port};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
    }
`
        }

        // Main location block
        content += `
    # Main location
    location / {
        proxy_pass http://localhost:${port};
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
`

        // Add WebSocket headers to main location for WebSocket packages
        if (websocketPackages.has(packageName)) {
            content += `        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
`
        }

        content += `    }
}
`

        /*
         * Write nginx config file using sudo (required for /etc/nginx/)
         * Use a temporary file and then move it with sudo to avoid shell escaping issues
         */
        const tempNginxFile = `/tmp/pr-${prNumber}-${packageName}.nginx.conf`
        await Bun.write(tempNginxFile, content)
        const nginxWriteResult = await $`sudo mv ${tempNginxFile} ${configFile}`.nothrow()
        if (nginxWriteResult.exitCode !== 0) {
            const stderr = nginxWriteResult.stderr?.toString() || ''
            const stdout = nginxWriteResult.stdout?.toString() || ''
            // Clean up temp file if move failed
            try {
                if (await Bun.file(tempNginxFile).exists()) {
                    await Bun.file(tempNginxFile).unlink()
                }
            } catch {
                // Ignore cleanup errors
            }
            throw new Error(`Failed to write nginx config file: ${stderr || stdout}`)
        }

        // Create symlink if it doesn't exist
        if (!existsSync(enabledLink)) {
            await $`sudo ln -s ${configFile} ${enabledLink}`.quiet()
        }
    }

    // Reload nginx
    const nginxReloadResult = await $`sudo nginx -s reload`.nothrow()
    if (nginxReloadResult.exitCode !== 0) {
        const stderr = nginxReloadResult.stderr?.toString() || ''
        const stdout = nginxReloadResult.stdout?.toString() || ''
        // Check nginx config for syntax errors
        const testResult = await $`sudo nginx -t`.nothrow()
        const testOutput = testResult.stdout?.toString() || testResult.stderr?.toString() || ''
        throw new Error(`Failed to reload nginx: ${stderr || stdout || 'Unknown error'}\nNginx config test: ${testOutput}`)
    }
    // eslint-disable-next-line no-console
    console.log('[pr-deploy] Nginx reloaded successfully')
}

/**
 * Regenerate nginx configs for an existing PR deployment
 * Useful for fixing incorrect port mappings without redeploying
 */
export async function regeneratePRNginx(prNumber: number): Promise<{
    message: string
    success: boolean
}> {
    try {
        const deployment = await getPRDeployment(prNumber)
        if (!deployment) {
            return {
                message: `PR #${prNumber} deployment not found`,
                success: false,
            }
        }

        if (deployment.status !== 'running') {
            return {
                message: `PR #${prNumber} deployment is not running (status: ${deployment.status})`,
                success: false,
            }
        }

        // eslint-disable-next-line no-console
        console.log(`[pr-deploy] Regenerating nginx configs for PR #${prNumber}...`)

        const repoDir = path.join(deployment.directory, 'repo')

        // Discover which packages are deployed
        const packagesToDeploy = discoverPackagesToDeploy(repoDir)
        // eslint-disable-next-line no-console
        console.log(`[pr-deploy] Discovered packages: ${packagesToDeploy.join(', ')}`)

        // Regenerate nginx configs
        await generateNginxConfig(deployment, packagesToDeploy)

        // eslint-disable-next-line no-console
        console.log(`[pr-deploy] Nginx configs regenerated successfully for PR #${prNumber}`)

        return {
            message: `Nginx configs regenerated successfully for PR #${prNumber}`,
            success: true,
        }
    } catch(error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        // eslint-disable-next-line no-console
        console.error(`[pr-deploy] Failed to regenerate nginx configs: ${message}`)
        return {
            message: `Failed to regenerate nginx configs: ${message}`,
            success: false,
        }
    }
}
