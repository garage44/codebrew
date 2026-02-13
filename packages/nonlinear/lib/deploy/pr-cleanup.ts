/* eslint-disable @stylistic/max-len */
import {$} from 'bun'
import {existsSync} from 'node:fs'
import {
    getPRDeployment,
    loadPRRegistry,
    removePRDeployment,
    updatePRDeployment,
} from './pr-registry'
import {extractWorkspacePackages, isApplicationPackage} from './workspace'

/**
 * Restart the main nonlinear service after cleanup completes
 * This ensures nonlinear is running with the latest code
 */
async function restartNonlinearService(): Promise<void> {
    // eslint-disable-next-line no-console
    console.log('[pr-cleanup] Restarting main nonlinear service...')
    try {
        const restartResult = await $`sudo /usr/bin/systemctl restart nonlinear.service`.nothrow()
        if (restartResult.exitCode === 0) {
            // eslint-disable-next-line no-console
            console.log('[pr-cleanup] Nonlinear service restarted successfully')
        } else {
            const stderr = restartResult.stderr?.toString() || ''
            const stdout = restartResult.stdout?.toString() || ''
            // eslint-disable-next-line no-console
            console.warn(`[pr-cleanup] Failed to restart nonlinear service (non-fatal): ${stderr || stdout || 'Unknown error'}`)
        }
    } catch(error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        // eslint-disable-next-line no-console
        console.warn(`[pr-cleanup] Error restarting nonlinear service (non-fatal): ${message}`)
    }
}

/**
 * Cleanup a specific PR deployment
 */
export async function cleanupPRDeployment(prNumber: number): Promise<{
    message: string
    success: boolean
}> {
    try {
        // eslint-disable-next-line no-console
        console.log(`[pr-cleanup] Cleaning up PR #${prNumber}...`)

        const deployment = await getPRDeployment(prNumber)
        if (!deployment) {
            return {
                message: `PR #${prNumber} not found`,
                success: false,
            }
        }

        // Update status
        await updatePRDeployment(prNumber, {status: 'cleaning'})

        // Find all PR services (use wildcard pattern)
        // eslint-disable-next-line no-console
        console.log(`[pr-cleanup] Stopping all services for PR #${prNumber}...`)
        try {
            // First, disable services to prevent auto-restart (critical for Restart=always services)
            await $`sudo systemctl disable pr-${prNumber}-*.service 2>/dev/null || true`.quiet()
            // eslint-disable-next-line no-console
            console.log('[pr-cleanup] Disabled all services')

            // Stop all services matching pattern
            await $`sudo systemctl stop pr-${prNumber}-*.service 2>/dev/null || true`.quiet()
            // eslint-disable-next-line no-console
            console.log('[pr-cleanup] Stopped all services')

            // Wait a moment for processes to fully stop
            await new Promise<void>((resolve): void => {
                setTimeout((): void => {
                    resolve()
                }, 1000)
            })

            /*
             * Kill any remaining processes that might be holding ports
             * Discover which packages were deployed to determine ports
             */
            const repoDir = `${deployment.directory}/repo`
            let packagesToClean: string[] = []

            if (existsSync(repoDir)) {
                const allPackages = extractWorkspacePackages(repoDir)
                const appPackages = allPackages.filter((pkg): boolean => isApplicationPackage(pkg))
                // Always include nonlinear
                packagesToClean = [...appPackages, 'nonlinear']
            } else {
                // Fallback: use known packages if repo directory doesn't exist
                packagesToClean = ['expressio', 'pyrite', 'nonlinear']
            }

            // Kill any processes on PR ports
            const portMap: Record<string, number> = {
                expressio: deployment.ports.expressio,
                nonlinear: deployment.ports.nonlinear,
                pyrite: deployment.ports.pyrite,
            }

            for (const packageName of packagesToClean) {
                const port = portMap[packageName as keyof typeof portMap] || deployment.ports.nonlinear
                // Try to kill processes on the port (fuser might not be available, so use nothrow)
                // eslint-disable-next-line no-await-in-loop
                await $`sudo fuser -k ${port}/tcp 2>/dev/null || true`.quiet().nothrow()
            }
            // eslint-disable-next-line no-console
            console.log('[pr-cleanup] Killed any remaining processes on PR ports')
        } catch(error: unknown) {
            // eslint-disable-next-line no-console
            console.warn('[pr-cleanup] Failed to stop services:', error)
        }

        // Remove all systemd units matching pattern
        try {
            const rmResult = await $`sudo rm -f /etc/systemd/system/pr-${prNumber}-*.service`.quiet().nothrow()
            if (rmResult.exitCode === 0) {
                // eslint-disable-next-line no-console
                console.log('[pr-cleanup] Removed all systemd units')
            } else {
                const stderr = rmResult.stderr?.toString() || ''
                // Check if it's just a "no matches" error (non-fatal)
                if (stderr.includes('no matches found')) {
                    // eslint-disable-next-line no-console
                    console.warn(`[pr-cleanup] No systemd units found for PR #${prNumber} (may have been removed already)`)
                } else {
                    // eslint-disable-next-line no-console
                    console.warn('[pr-cleanup] Failed to remove systemd units:', stderr)
                }
            }
        } catch(error: unknown) {
            // eslint-disable-next-line no-console
            console.warn('[pr-cleanup] Failed to remove systemd units:', error)
        }

        // Reload systemd after removing service files
        await $`sudo systemctl daemon-reload`.quiet()

        // Remove nginx configurations for all package subdomains
        try {
            // Discover which packages were deployed to determine subdomains
            const repoDir = `${deployment.directory}/repo`
            let packagesToClean: string[] = []

            if (existsSync(repoDir)) {
                const allPackages = extractWorkspacePackages(repoDir)
                const appPackages = allPackages.filter((pkg): boolean => isApplicationPackage(pkg))
                // Always include nonlinear
                packagesToClean = [...appPackages, 'nonlinear']
            } else {
                // Fallback: use known packages if repo directory doesn't exist
                packagesToClean = ['expressio', 'pyrite', 'nonlinear']
            }

            /*
             * Remove nginx configs for each package subdomain
             * Replace with a "deployment removed" page instead of deleting
             */
            for (const packageName of packagesToClean) {
                const subdomain = `pr-${prNumber}-${packageName}.garage44.org`
                const configFile = `/etc/nginx/sites-available/${subdomain}`
                const enabledLink = `/etc/nginx/sites-enabled/${subdomain}`

                // Create a "deployment removed" config instead of deleting

                const removedContent = `# PR #${prNumber} - ${packageName} deployment removed
# HTTP to HTTPS redirect
server {
    listen 80;
    server_name ${subdomain};
    return 301 https://$server_name$request_uri;
}

# HTTPS server - Deployment removed
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

    # Return 410 Gone (resource permanently removed) with HTML response
    return 410 '<!DOCTYPE html><html><head><title>PR Deployment Removed</title><style>body{font-family:system-ui,sans-serif;text-align:center;padding:50px;background:#f5f5f5}.container{max-width:600px;margin:0 auto;background:white;padding:40px;border-radius:8px;box-shadow:0 2px 4px rgba(0,0,0,0.1)}h1{color:#333;margin-bottom:20px}p{color:#666;line-height:1.6}</style></head><body><div class="container"><h1>PR Deployment Removed</h1><p>This PR deployment (PR #${prNumber}) has been removed.</p><p>PR deployments are automatically cleaned up when the PR is closed or after 7 days.</p></div></body></html>';
    add_header Content-Type "text/html" always;
}
`

                // Write the "removed" config
                const tempFile = `/tmp/pr-${prNumber}-${packageName}-removed.nginx.conf`
                // eslint-disable-next-line no-await-in-loop
                await Bun.write(tempFile, removedContent)
                // eslint-disable-next-line no-await-in-loop
                await $`sudo mv ${tempFile} ${configFile}`.quiet()

                // Ensure symlink exists
                if (!existsSync(enabledLink)) {
                    // eslint-disable-next-line no-await-in-loop
                    await $`sudo ln -s ${configFile} ${enabledLink}`.quiet()
                }
            }

            await $`sudo nginx -s reload`.quiet()
            // eslint-disable-next-line no-console
            console.log(
                `[pr-cleanup] Updated nginx configurations to show "deployment removed" for ${packagesToClean.length} package(s)`,
            )
        } catch(error: unknown) {
            // eslint-disable-next-line no-console
            console.warn('[pr-cleanup] Failed to remove nginx configs:', error)
        }

        // Remove deployment directory
        try {
            await $`rm -rf ${deployment.directory}`.quiet()
            // eslint-disable-next-line no-console
            console.log('[pr-cleanup] Removed deployment directory')
        } catch(error: unknown) {
            // eslint-disable-next-line no-console
            console.warn('[pr-cleanup] Failed to remove directory:', error)
        }

        // Remove from registry
        await removePRDeployment(prNumber)

        // eslint-disable-next-line no-console
        console.log(`[pr-cleanup] PR #${prNumber} cleaned up successfully`)

        // Restart main nonlinear service after cleanup completes
        await restartNonlinearService()

        return {
            message: `PR #${prNumber} cleaned up successfully`,
            success: true,
        }
    } catch(error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        // eslint-disable-next-line no-console
        console.error(`[pr-cleanup] Cleanup failed: ${message}`)

        // Restart main nonlinear service even on failure to ensure it's running
        await restartNonlinearService()

        return {
            message: `Cleanup failed: ${message}`,
            success: false,
        }
    }
}

/**
 * Cleanup stale PR deployments (older than maxAge)
 */
export async function cleanupStaleDeployments(
    maxAgeDays = 7,
): Promise<{cleaned: number; message: string}> {
    try {
        // eslint-disable-next-line no-console
        console.log(`[pr-cleanup] Checking for stale deployments (max age: ${maxAgeDays} days)...`)

        const registry = await loadPRRegistry()
        const maxAge = maxAgeDays * 24 * 60 * 60 * 1000
        const now = Date.now()

        let cleaned = 0
        for (const [prNumber, deployment] of Object.entries(registry)) {
            const age = now - deployment.created
            if (age > maxAge) {
                // eslint-disable-next-line no-console
                console.log(`[pr-cleanup] PR #${prNumber} is stale (${Math.round(age / (24 * 60 * 60 * 1000)) as number} days old)`)
                // eslint-disable-next-line no-await-in-loop
                const result = await cleanupPRDeployment(Number(prNumber))
                if (result.success) {
                    cleaned += 1
                }
            }
        }

        const message = cleaned > 0 ?
            `Cleaned up ${cleaned} stale deployment(s)` :
            'No stale deployments found'

        // eslint-disable-next-line no-console
        console.log(`[pr-cleanup] ${message}`)

        return {cleaned, message}
    } catch(error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        // eslint-disable-next-line no-console
        console.error(`[pr-cleanup] Stale cleanup failed: ${message}`)
        return {cleaned: 0, message: `Cleanup failed: ${message}`}
    }
}

/**
 * List all PR deployments
 */
export async function listPRDeployments(): Promise<void> {
    const registry = await loadPRRegistry()
    const deployments = Object.values(registry)

    if (deployments.length === 0) {
        // eslint-disable-next-line no-console
        console.log('No active PR deployments')
        return
    }

    // eslint-disable-next-line no-console
    console.log(`\nActive PR Deployments (${deployments.length}):\n`)

    for (const deployment of deployments) {
        const ageHours = Math.round((Date.now() - deployment.created) / (60 * 60 * 1000))

        // Discover which packages were deployed
        const repoDir = `${deployment.directory}/repo`
        let packagesToShow: string[] = []

        if (existsSync(repoDir)) {
            const allPackages = extractWorkspacePackages(repoDir)
            const appPackages = allPackages.filter((pkg): boolean => isApplicationPackage(pkg))
            // Always include nonlinear
            packagesToShow = [...appPackages, 'nonlinear']
        } else {
            // Fallback: use known packages if repo directory doesn't exist
            packagesToShow = ['expressio', 'pyrite', 'nonlinear']
        }

        // eslint-disable-next-line no-console
        console.log(`PR #${deployment.number}:`)
        // eslint-disable-next-line no-console
        console.log(`  Branch: ${deployment.head_ref}`)
        // eslint-disable-next-line no-console
        console.log(`  Author: ${deployment.author}`)
        // eslint-disable-next-line no-console
        console.log(`  Age: ${ageHours} hours`)

        // Show URLs for each package
        // eslint-disable-next-line no-console
        console.log('  URLs:')
        for (const packageName of packagesToShow) {
            const port = deployment.ports[packageName as keyof typeof deployment.ports] || deployment.ports.nonlinear
            // eslint-disable-next-line no-console
            console.log(`    ${packageName}: https://pr-${deployment.number}-${packageName}.garage44.org (port ${port})`)
        }

        // eslint-disable-next-line no-console
        console.log(`  Status: ${deployment.status}`)
        // eslint-disable-next-line no-console
        console.log('')
    }
}
