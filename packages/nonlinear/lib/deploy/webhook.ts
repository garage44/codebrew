import {$} from 'bun'
import {homedir} from 'node:os'
import {existsSync, unlinkSync} from 'fs'
import {join as pathJoin} from 'path'
import {findWorkspaceRoot, extractWorkspacePackages, isApplicationPackage} from './workspace'
import {cleanupPRDeployment} from './pr-cleanup'
import {deployPR, type PRMetadata, updateAllPRDeploymentsWithMain} from './pr-deploy'
import {updatePRDeployment, getPRDeployment} from './pr-registry'
import {
    waitForService,
    waitForPort,
    waitForHttpEndpoint,
    type HealthCheckResult,
} from './health-check'

interface PullRequestWebhookEvent {
    action?: string
    pull_request?: {
        head?: {
            ref?: string
            repo?: {
                fork: boolean
                full_name: string
            }
            sha?: string
        }
        number?: number
        user?: {
            login: string
        }
    }
}

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || ''
const REPO_PATH = process.env.REPO_PATH || findWorkspaceRoot() || process.cwd()

/**
 * Validate GitHub webhook signature
 */
export async function validateSignature(payload: string, signature: string, secret: string): Promise<boolean> {
    if (!secret) {
        console.error('[webhook] WEBHOOK_SECRET not configured')
        return false
    }

    if (!signature) {
        return false
    }

    // GitHub sends signature as "sha256=<hash>"
    const sigHash = signature.replace('sha256=', '')

    // Calculate HMAC SHA-256 using Bun's built-in crypto
    const encoder = new TextEncoder()
    const keyData = encoder.encode(secret)
    const payloadData = encoder.encode(payload)

    const key = await crypto.subtle.importKey(
        'raw',
        keyData,
        {hash: 'SHA-256', name: 'HMAC'},
        false,
        ['sign'],
    )

    const hmacSignature = await crypto.subtle.sign('HMAC', key, payloadData)
    const calculatedHash = Array.from(new Uint8Array(hmacSignature))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')

    // Use constant-time comparison to prevent timing attacks
    if (calculatedHash.length !== sigHash.length) {
        return false
    }

    let result = 0
    for (let i = 0; i < calculatedHash.length; i++) {
        const calculatedCode = calculatedHash.codePointAt(i) ?? 0
        const sigCode = sigHash.codePointAt(i) ?? 0
        result |= calculatedCode ^ sigCode
    }

    return result === 0
}

/**
 * Remove database files to ensure clean state
 */
function removeDatabases(): void {
    console.log('[deploy] Removing database files...')

    const dbFiles = [
        `${homedir()}/.pyrite.db`,
        `${homedir()}/.expressio.db`,
    ]

    // Also remove WAL and SHM files if they exist
    const walShmFiles = [
        `${homedir()}/.pyrite.db-wal`,
        `${homedir()}/.pyrite.db-shm`,
        `${homedir()}/.expressio.db-wal`,
        `${homedir()}/.expressio.db-shm`,
    ]

    for (const file of [...dbFiles, ...walShmFiles]) {
        if (existsSync(file)) {
            try {
                unlinkSync(file)
                console.log(`[deploy] Removed ${file}`)
            } catch(error: unknown) {
                const message = error instanceof Error ? error.message : String(error)
                console.warn(`[deploy] Failed to remove ${file}: ${message}`)
            }
        }
    }
}

/**
 * Deploy packages: pull code, remove databases, build, restart services
 * Nonlinear is always restarted asynchronously after the function returns
 * to avoid killing active connections (e.g., webhook requests)
 */
export async function deploy(): Promise<{message: string; success: boolean}> {
    try {
        console.log('[deploy] Starting deployment...')
        console.log(`[deploy] Repository path: ${REPO_PATH}`)
        console.log(`[deploy] Current working directory: ${process.cwd()}`)

        // Verify repository path exists
        if (!existsSync(REPO_PATH)) {
            throw new Error(`Repository path does not exist: ${REPO_PATH}`)
        }
        console.log(`[deploy] Repository path verified: ${REPO_PATH}`)

        // Change to repository directory
        try {
            process.chdir(REPO_PATH)
            console.log(`[deploy] Changed to repository directory: ${process.cwd()}`)
        } catch(error: unknown) {
            const message = error instanceof Error ? error.message : String(error)
            throw new Error(`Failed to change to repository directory: ${message}`, {cause: error})
        }

        // Verify git repository
        if (!existsSync(pathJoin(REPO_PATH, '.git'))) {
            throw new Error(`Not a git repository: ${REPO_PATH}`)
        }
        console.log('[deploy] Git repository verified')

        // Pull latest code from main branch
        console.log('[deploy] Pulling latest code from main branch...')
        const pullResult = await $`git fetch origin main && git reset --hard origin/main`.nothrow()
        if (pullResult.exitCode !== 0) {
            const stderr = pullResult.stderr?.toString() || ''
            const stdout = pullResult.stdout?.toString() || ''
            console.error(`[deploy] Git pull failed with exit code ${pullResult.exitCode}`)
            console.error(`[deploy] Git pull stderr: ${stderr}`)
            console.error(`[deploy] Git pull stdout: ${stdout}`)
            throw new Error(`Failed to pull latest code: ${stderr || stdout || 'Unknown error'}`)
        }
        console.log('[deploy] Code pulled successfully')

        // Verify bun is available
        try {
            const bunVersionResult = await $`bun --version`.nothrow()
            if (bunVersionResult.exitCode !== 0) {
                throw new Error('Bun is not available or not in PATH')
            }
            const bunVersion = bunVersionResult.stdout?.toString().trim() || 'unknown'
            console.log(`[deploy] Bun version: ${bunVersion}`)
        } catch(error: unknown) {
            const message = error instanceof Error ? error.message : String(error)
            throw new Error(`Failed to verify bun installation: ${message}`, {cause: error})
        }

        // Remove database files
        console.log('[deploy] Removing database files...')
        removeDatabases()
        console.log('[deploy] Database files removed')

        // Verify package.json exists
        const packageJsonPath = pathJoin(REPO_PATH, 'package.json')
        if (!existsSync(packageJsonPath)) {
            throw new Error(`package.json not found at ${packageJsonPath}`)
        }
        console.log('[deploy] package.json verified')

        // Install dependencies (must be run from workspace root)
        console.log('[deploy] Installing dependencies...')
        console.log(`[deploy] Installing from: ${process.cwd()}`)
        const installResult = await $`bun install`.nothrow()
        if (installResult.exitCode !== 0) {
            const stderr = installResult.stderr?.toString() || ''
            const stdout = installResult.stdout?.toString() || ''
            const errorDetails = stderr || stdout || 'Unknown install error'
            console.error(`[deploy] Install failed with exit code ${installResult.exitCode}`)
            console.error(`[deploy] Install stderr: ${stderr}`)
            console.error(`[deploy] Install stdout: ${stdout}`)
            throw new Error(`Failed to install dependencies: ${errorDetails.slice(0, 500)}`)
        }
        console.log('[deploy] Dependencies installed successfully')

        // Build all packages
        console.log('[deploy] Building all packages...')
        console.log('[deploy] Build command: bun run build')
        console.log(`[deploy] Working directory: ${process.cwd()}`)
        const buildResult = await $`bun run build`.nothrow()
        if (buildResult.exitCode !== 0) {
            const stderr = buildResult.stderr?.toString() || ''
            const stdout = buildResult.stdout?.toString() || ''
            const errorOutput = stderr || stdout || 'Unknown build error'
            console.error(`[deploy] Build failed with exit code ${buildResult.exitCode}`)
            console.error(`[deploy] Build stderr (first 2000 chars): ${stderr.slice(0, 2000)}`)
            console.error(`[deploy] Build stdout (first 2000 chars): ${stdout.slice(0, 2000)}`)
            if (stderr.length > 2000) {
                console.error(`[deploy] Build stderr (truncated, total length: ${stderr.length})`)
            }
            if (stdout.length > 2000) {
                console.error(`[deploy] Build stdout (truncated, total length: ${stdout.length})`)
            }
            throw new Error(`Build failed: ${errorOutput.slice(0, 1000)}`)
        }
        console.log('[deploy] Build completed successfully')

        // Auto-discover packages from workspace
        console.log('[deploy] Discovering packages to deploy...')
        const workspaceRoot = findWorkspaceRoot() || REPO_PATH
        console.log(`[deploy] Workspace root: ${workspaceRoot}`)
        const allPackages = extractWorkspacePackages(workspaceRoot)
        console.log(`[deploy] All packages found: ${allPackages.join(', ')}`)
        const appPackages = allPackages.filter((pkg) => isApplicationPackage(pkg))
        console.log(`[deploy] Application packages: ${appPackages.join(', ')}`)

        // Always include nonlinear in deployment
        const packagesToDeploy = [...appPackages, 'nonlinear']
        console.log(`[deploy] Packages to deploy: ${packagesToDeploy.join(', ')}`)

        const otherPackages = packagesToDeploy.filter((pkg) => pkg !== 'nonlinear')
        const nonlinearPackage = packagesToDeploy.find((pkg) => pkg === 'nonlinear')

        // Restart systemd services for all packages except nonlinear
        console.log('[deploy] Restarting systemd services (excluding nonlinear)...')
        for (const packageName of otherPackages) {
            try {
                console.log(`[deploy] Restarting ${packageName} service...`)
                const restartResult = await $`sudo /usr/bin/systemctl restart ${packageName}.service`.nothrow()
                if (restartResult.exitCode === 0) {
                    console.log(`[deploy] ${packageName} service restarted successfully`)
                } else {
                    const stderr = restartResult.stderr?.toString() || ''
                    const stdout = restartResult.stdout?.toString() || ''
                    console.warn(`[deploy] Failed to restart ${packageName} service (exit code ${restartResult.exitCode})`)
                    console.warn(`[deploy] ${packageName} restart stderr: ${stderr}`)
                    console.warn(`[deploy] ${packageName} restart stdout: ${stdout}`)
                }
            } catch(error: unknown) {
                const message = error instanceof Error ? error.message : String(error)
                console.warn(`[deploy] Error restarting ${packageName}: ${message}`)
            }
        }

        console.log('[deploy] Deployment completed successfully')

        if (nonlinearPackage) {
            console.log('[deploy] Scheduling nonlinear service restart (after function returns)...')
            queueMicrotask(async() => {
                try {
                    console.log('[deploy] Restarting nonlinear service...')
                    const restartResult = await $`sudo /usr/bin/systemctl restart ${nonlinearPackage}.service`.nothrow()
                    if (restartResult.exitCode === 0) {
                        console.log(`[deploy] ✅ ${nonlinearPackage} service restarted successfully`)
                    } else {
                        const stderr = restartResult.stderr?.toString() || ''
                        const stdout = restartResult.stdout?.toString() || ''
                        console.error(`[deploy] ❌ Failed to restart ${nonlinearPackage} service (${restartResult.exitCode})`)
                        console.error(`[deploy] ${nonlinearPackage} restart stderr: ${stderr}`)
                        console.error(`[deploy] ${nonlinearPackage} restart stdout: ${stdout}`)
                    }
                } catch(error: unknown) {
                    const errorMessage = error instanceof Error ? error.message : String(error)
                    console.error(`[deploy] ❌ Error restarting ${nonlinearPackage}: ${errorMessage}`)
                }
            })
        }

        return {message: 'Deployment completed successfully', success: true}
    } catch(error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        const stack = error instanceof Error ? error.stack : undefined
        console.error(`[deploy] Deployment failed: ${message}`)
        if (stack) {
            console.error(`[deploy] Stack trace: ${stack}`)
        }
        return {message: `Deployment failed: ${message}`, success: false}
    }
}

/**
 * Handle pull request events
 */
async function handlePullRequestEvent(event: PullRequestWebhookEvent): Promise<Response> {
    const action = event.action
    const pullRequest = event.pull_request
    const prNumber = pullRequest?.number

    if (!prNumber) {
        return new Response(JSON.stringify({error: 'Missing PR number'}), {
            headers: {'Content-Type': 'application/json'},
            status: 400,
        })
    }

    console.log(`[webhook] PR #${prNumber} event: ${action}`)

    // Handle PR close/merge - cleanup
    if (action === 'closed') {
        const result = await cleanupPRDeployment(prNumber)
        return new Response(JSON.stringify(result), {
            headers: {'Content-Type': 'application/json'},
            status: result.success ? 200 : 500,
        })
    }

    // Handle PR open/sync - deploy
    if (action === 'opened' || action === 'synchronize' || action === 'reopened') {
        if (
            !pullRequest?.head?.ref ||
            !pullRequest.head.sha ||
            !pullRequest.head.repo?.full_name ||
            typeof pullRequest.head.repo.fork !== 'boolean' ||
            !pullRequest.user?.login
        ) {
            return new Response(JSON.stringify({error: 'Incomplete pull request payload'}), {
                headers: {'Content-Type': 'application/json'},
                status: 422,
            })
        }

        const pr: PRMetadata = {
            author: pullRequest.user.login,
            head_ref: pullRequest.head.ref,
            head_sha: pullRequest.head.sha,
            is_fork: pullRequest.head.repo.fork,
            number: prNumber,
            repo_full_name: pullRequest.head.repo.full_name,
        }

        // Deploy synchronously and wait for completion
        try {
            console.log(`[webhook] Starting deployment for PR #${prNumber}...`)
            const deployResult = await deployPR(pr)

            if (!deployResult.success) {
                console.error(`[webhook] PR #${prNumber} deployment failed: ${deployResult.message}`)
                if (deployResult.deployment) {
                    await updatePRDeployment(prNumber, {status: 'failed'}).catch((err) => {
                        console.error('[webhook] Failed to update deployment status:', err)
                    })
                }

                return new Response(JSON.stringify({
                    message: `Deployment failed: ${deployResult.message}`,
                    prNumber,
                    success: false,
                    timestamp: new Date().toISOString(),
                }), {
                    headers: {'Content-Type': 'application/json'},
                    status: 500,
                })
            }

            if (!deployResult.deployment) {
                return new Response(JSON.stringify({
                    message: 'Deployment completed but no deployment record was created',
                    prNumber,
                    success: false,
                    timestamp: new Date().toISOString(),
                }), {
                    headers: {'Content-Type': 'application/json'},
                    status: 500,
                })
            }

            console.log(`[webhook] PR #${prNumber} deployment completed, verifying health...`)

            // Get the deployment record to check packages
            const deployment = await getPRDeployment(prNumber)
            if (!deployment) {
                return new Response(JSON.stringify({
                    message: 'Deployment completed but deployment record not found',
                    prNumber,
                    success: false,
                    timestamp: new Date().toISOString(),
                }), {
                    headers: {'Content-Type': 'application/json'},
                    status: 500,
                })
            }

            // Discover packages to verify
            const repoDir = pathJoin(deployment.directory, 'repo')
            const allPackages = extractWorkspacePackages(repoDir)
            const appPackages = allPackages.filter((pkg) => isApplicationPackage(pkg))
            const packagesToDeploy = [...appPackages, 'nonlinear']

            // Wait for services to start (with timeout)
            console.log(`[webhook] Waiting for services to start for PR #${prNumber}...`)
            const serviceChecks: Array<{name: string; result: HealthCheckResult}> = []
            const portMap: Record<string, number> = {
                expressio: deployment.ports.expressio,
                nonlinear: deployment.ports.nonlinear,
                pyrite: deployment.ports.pyrite,
            }

            for (const packageName of packagesToDeploy) {
                const serviceName = `pr-${prNumber}-${packageName}.service`
                const port = portMap[packageName] || deployment.ports.nonlinear

                console.log(`[webhook] Waiting for ${serviceName} to become active...`)
                const serviceCheck = await waitForService(serviceName, 60000, 2000)
                serviceChecks.push({name: serviceName, result: serviceCheck})

                if (serviceCheck.healthy) {
                    console.log(`[webhook] Waiting for port ${port} to become listening...`)
                    const portCheck = await waitForPort(port, 60000, 2000)
                    serviceChecks.push({name: `port-${port}`, result: portCheck})
                }
            }

            // Wait for HTTP endpoints to become accessible
            console.log(`[webhook] Waiting for HTTP endpoints to become accessible for PR #${prNumber}...`)
            const baseDomain = 'garage44.org'
            const httpChecks: Array<{name: string; result: HealthCheckResult}> = []

            for (const packageName of packagesToDeploy) {
                const subdomain = `pr-${prNumber}-${packageName}.${baseDomain}`
                const httpsUrl = `https://${subdomain}`

                console.log(`[webhook] Checking HTTP endpoint: ${httpsUrl}`)
                const httpCheck = await waitForHttpEndpoint(httpsUrl, 120000, 3000, 10000)
                httpChecks.push({name: httpsUrl, result: httpCheck})
            }

            // Combine all checks
            const allChecks = [...serviceChecks, ...httpChecks]
            const allHealthy = allChecks.every((check) => check.result.healthy)
            const failedChecks = allChecks.filter((check) => !check.result.healthy)

            if (!allHealthy) {
                console.error(`[webhook] PR #${prNumber} health checks failed:`, failedChecks.map((c) => c.name))
                await updatePRDeployment(prNumber, {status: 'failed'}).catch((err) => {
                    console.error('[webhook] Failed to update deployment status:', err)
                })

                return new Response(JSON.stringify({
                    allChecks: allChecks.map((c) => ({
                        healthy: c.result.healthy,
                        message: c.result.message,
                        name: c.name,
                    })),
                    failedChecks: failedChecks.map((c) => ({
                        details: c.result.details,
                        message: c.result.message,
                        name: c.name,
                    })),
                    message: 'Deployment completed but health checks failed',
                    prNumber,
                    success: false,
                    timestamp: new Date().toISOString(),
                }), {
                    headers: {'Content-Type': 'application/json'},
                    status: 500,
                })
            }

            console.log(`[webhook] PR #${prNumber} deployment successful and healthy`)
            return new Response(JSON.stringify({
                deployment: {
                    packages: packagesToDeploy,
                    ports: deployment.ports,
                    url: `https://pr-${prNumber}-nonlinear.${baseDomain}`,
                },
                healthChecks: allChecks.map((c) => ({
                    healthy: c.result.healthy,
                    message: c.result.message,
                    name: c.name,
                })),
                message: `PR #${prNumber} deployed successfully and verified`,
                prNumber,
                success: true,
                timestamp: new Date().toISOString(),
            }), {
                headers: {'Content-Type': 'application/json'},
                status: 200,
            })
        } catch(error) {
            const errorMessage = error instanceof Error ? error.message : String(error)
            const errorStack = error instanceof Error ? error.stack : undefined
            console.error(`[webhook] PR #${prNumber} deployment error:`, errorMessage)
            if (errorStack) {
                console.error('[webhook] Stack trace:', errorStack)
            }

            // Update deployment status to failed
            await updatePRDeployment(prNumber, {status: 'failed'}).catch((err) => {
                console.error('[webhook] Failed to update deployment status:', err)
            })

            return new Response(JSON.stringify({
                error: errorMessage,
                message: `Deployment error: ${errorMessage}`,
                prNumber,
                success: false,
                timestamp: new Date().toISOString(),
            }), {
                headers: {'Content-Type': 'application/json'},
                status: 500,
            })
        }
    }

    // Ignore other actions
    return new Response(JSON.stringify({
        message: `Ignored PR action: ${action}`,
    }), {
        headers: {'Content-Type': 'application/json'},
        status: 200,
    })
}

/**
 * Handle webhook request
 */
export async function handleWebhook(req: Request): Promise<Response> {
    // Only accept POST requests
    if (req.method !== 'POST') {
        return new Response(JSON.stringify({error: 'Method not allowed'}), {
            headers: {'Content-Type': 'application/json'},
            status: 405,
        })
    }

    // Get signature from headers
    const signature = req.headers.get('x-hub-signature-256')
    if (!signature) {
        return new Response(JSON.stringify({error: 'Missing signature'}), {
            headers: {'Content-Type': 'application/json'},
            status: 401,
        })
    }

    // Read request body
    const payload = await req.text()

    // Validate signature
    const isValid = await validateSignature(payload, signature, WEBHOOK_SECRET)
    if (!isValid) {
        console.error('[webhook] Invalid signature')
        return new Response(JSON.stringify({error: 'Invalid signature'}), {
            headers: {'Content-Type': 'application/json'},
            status: 401,
        })
    }

    // Parse webhook payload
    let event
    try {
        event = JSON.parse(payload)
    } catch {
        return new Response(JSON.stringify({error: 'Invalid JSON payload'}), {
            headers: {'Content-Type': 'application/json'},
            status: 400,
        })
    }

    // Check event type
    const eventType = req.headers.get('x-github-event')

    // Handle pull request events
    if (eventType === 'pull_request') {
        return await handlePullRequestEvent(event)
    }

    // Handle push events (main branch deployment)
    if (eventType !== 'push') {
        return new Response(JSON.stringify({message: `Ignored: event type ${eventType}`}), {
            headers: {'Content-Type': 'application/json'},
            status: 200,
        })
    }

    // Only process push events to main branch
    if (event.ref !== 'refs/heads/main' && event.ref) {
        return new Response(JSON.stringify({message: 'Ignored: not main branch'}), {
            headers: {'Content-Type': 'application/json'},
            status: 200,
        })
    }

    /*
     * Process deployment synchronously
     * Nonlinear restart is handled asynchronously inside deploy() to avoid killing the connection
     */
    console.log('[webhook] Received push event to main branch, starting deployment...')
    const deploymentResult = await deploy()

    if (deploymentResult.success) {
        console.log('[webhook] Deployment successful')
    } else {
        console.error(`[webhook] Deployment failed: ${deploymentResult.message}`)
    }

    /*
     * Update all active PR deployments with main branch changes
     * This runs asynchronously and doesn't block the response
     */
    console.log('[webhook] Updating active PR deployments with main branch changes...')
    updateAllPRDeploymentsWithMain().then((result) => {
        console.log(`[webhook] PR deployments update: ${result.message}`)
    }).catch((error) => {
        const errorMessage = error instanceof Error ? error.message : String(error)
        console.error(`[webhook] Error updating PR deployments: ${errorMessage}`)
    })

    // Return deployment result immediately (before nonlinear restart)
    return new Response(JSON.stringify({
        message: deploymentResult.message,
        success: deploymentResult.success,
        timestamp: new Date().toISOString(),
    }), {
        headers: {'Content-Type': 'application/json'},
        status: deploymentResult.success ? 200 : 500,
    })
}
