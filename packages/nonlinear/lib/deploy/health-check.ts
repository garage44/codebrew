import {$} from 'bun'
import type {PRDeployment} from './pr-registry'

export interface HealthCheckResult {
    details?: Record<string, unknown>
    healthy: boolean
    message: string
}

/**
 * Check if a systemd service is running
 */
export async function checkServiceStatus(serviceName: string): Promise<HealthCheckResult> {
    try {
        const statusResult = await $`sudo systemctl is-active ${serviceName}`.quiet().nothrow()
        if (statusResult.exitCode === 0) {
            const status = statusResult.stdout?.toString().trim() || ''
            if (status === 'active') {
                return {
                    healthy: true,
                    message: `Service ${serviceName} is active`,
                }
            }
            return {
                healthy: false,
                message: `Service ${serviceName} is not active (status: ${status})`,
            }
        }

        // Get detailed status for debugging
        const detailedStatus = await $`sudo systemctl status ${serviceName} --no-pager -l`.nothrow()
        const statusOutput = detailedStatus.stdout?.toString() || detailedStatus.stderr?.toString() || 'Unknown error'

        return {
            details: {
                exitCode: statusResult.exitCode,
                // Limit output size
                statusOutput: statusOutput.slice(0, 1000),
            },
            healthy: false,
            message: `Service ${serviceName} check failed`,
        }
    } catch(error) {
        const message = error instanceof Error ? error.message : String(error)
        return {
            healthy: false,
            message: `Failed to check service ${serviceName}: ${message}`,
        }
    }
}

/**
 * Check if a port is listening
 */
export async function checkPortListening(port: number): Promise<HealthCheckResult> {
    try {
        // Use ss or netstat to check if port is listening
        const checkResult = await $`ss -tln | grep :${port}`.quiet().nothrow()
        if (checkResult.exitCode === 0 && checkResult.stdout?.toString().trim()) {
            return {
                healthy: true,
                message: `Port ${port} is listening`,
            }
        }

        // Fallback to netstat if ss is not available
        const netstatResult = await $`netstat -tln | grep :${port}`.quiet().nothrow()
        if (netstatResult.exitCode === 0 && netstatResult.stdout?.toString().trim()) {
            return {
                healthy: true,
                message: `Port ${port} is listening`,
            }
        }

        return {
            healthy: false,
            message: `Port ${port} is not listening`,
        }
    } catch(error) {
        const message = error instanceof Error ? error.message : String(error)
        return {
            healthy: false,
            message: `Failed to check port ${port}: ${message}`,
        }
    }
}

/**
 * Check if an HTTP endpoint is accessible
 */
export async function checkHttpEndpoint(url: string, timeoutMs = 10000): Promise<HealthCheckResult> {
    try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

        try {
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Nonlinear-HealthCheck/1.0',
                },
                method: 'GET',
                signal: controller.signal,
            })

            clearTimeout(timeoutId)

            if (response.ok || response.status < 500) {
                /*
                 * Accept 2xx, 3xx, and 4xx as "healthy" (service is responding)
                 * Only 5xx indicates service problems
                 */
                return {
                    details: {
                        status: response.status,
                        statusText: response.statusText,
                    },
                    healthy: true,
                    message: `HTTP endpoint ${url} is accessible (status: ${response.status})`,
                }
            }

            return {
                details: {
                    status: response.status,
                    statusText: response.statusText,
                },
                healthy: false,
                message: `HTTP endpoint ${url} returned error status: ${response.status}`,
            }
        } catch(fetchError) {
            clearTimeout(timeoutId)

            if (fetchError instanceof Error && fetchError.name === 'AbortError') {
                return {
                    healthy: false,
                    message: `HTTP endpoint ${url} timed out after ${timeoutMs}ms`,
                }
            }

            throw fetchError
        }
    } catch(error) {
        const message = error instanceof Error ? error.message : String(error)
        return {
            healthy: false,
            message: `Failed to check HTTP endpoint ${url}: ${message}`,
        }
    }
}

/**
 * Wait for a service to become active with retries
 */
export async function waitForService(
    serviceName: string,
    maxWaitMs = 60000,
    checkIntervalMs = 2000,
): Promise<HealthCheckResult> {
    const startTime = Date.now()

    while (Date.now() - startTime < maxWaitMs) {
        const check = await checkServiceStatus(serviceName)
        if (check.healthy) {
            return {
                healthy: true,
                message: `Service ${serviceName} became active after ${Date.now() - startTime}ms`,
            }
        }

        // Wait before next check
        await new Promise((resolve) => setTimeout(resolve, checkIntervalMs))
    }

    // Final check
    const finalCheck = await checkServiceStatus(serviceName)
    if (finalCheck.healthy) {
        return finalCheck
    }

    return {
        details: finalCheck.details,
        healthy: false,
        message: `Service ${serviceName} did not become active within ${maxWaitMs}ms`,
    }
}

/**
 * Wait for a port to become listening with retries
 */
export async function waitForPort(
    port: number,
    maxWaitMs = 60000,
    checkIntervalMs = 2000,
): Promise<HealthCheckResult> {
    const startTime = Date.now()

    while (Date.now() - startTime < maxWaitMs) {
        const check = await checkPortListening(port)
        if (check.healthy) {
            return {
                healthy: true,
                message: `Port ${port} became listening after ${Date.now() - startTime}ms`,
            }
        }

        // Wait before next check
        await new Promise((resolve) => setTimeout(resolve, checkIntervalMs))
    }

    // Final check
    const finalCheck = await checkPortListening(port)
    if (finalCheck.healthy) {
        return finalCheck
    }

    return {
        healthy: false,
        message: `Port ${port} did not become listening within ${maxWaitMs}ms`,
    }
}

/**
 * Wait for an HTTP endpoint to become accessible with retries
 */
export async function waitForHttpEndpoint(
    url: string,
    maxWaitMs = 120000,
    checkIntervalMs = 3000,
    timeoutMs = 10000,
): Promise<HealthCheckResult> {
    const startTime = Date.now()

    while (Date.now() - startTime < maxWaitMs) {
        const check = await checkHttpEndpoint(url, timeoutMs)
        if (check.healthy) {
            return {
                details: check.details,
                healthy: true,
                message: `HTTP endpoint ${url} became accessible after ${Date.now() - startTime}ms`,
            }
        }

        // Wait before next check
        await new Promise((resolve) => setTimeout(resolve, checkIntervalMs))
    }

    // Final check
    const finalCheck = await checkHttpEndpoint(url, timeoutMs)
    if (finalCheck.healthy) {
        return finalCheck
    }

    return {
        details: finalCheck.details,
        healthy: false,
        message: `HTTP endpoint ${url} did not become accessible within ${maxWaitMs}ms`,
    }
}

/**
 * Comprehensive health check for a PR deployment
 */
export async function checkPRDeploymentHealth(
    deployment: PRDeployment,
    packagesToDeploy: string[],
): Promise<{
    checks: Array<{name: string; result: HealthCheckResult}>
    healthy: boolean
    message: string
}> {
    const checks: Array<{name: string; result: HealthCheckResult}> = []
    const baseDomain = 'garage44.org'

    // Port mapping for packages
    const portMap: Record<string, number> = {
        expressio: deployment.ports.expressio,
        nonlinear: deployment.ports.nonlinear,
        pyrite: deployment.ports.pyrite,
    }

    // Check each service
    for (const packageName of packagesToDeploy) {
        const serviceName = `pr-${deployment.number}-${packageName}.service`
        const port = portMap[packageName] || deployment.ports.nonlinear
        const subdomain = `pr-${deployment.number}-${packageName}.${baseDomain}`
        const httpsUrl = `https://${subdomain}`

        // Check service status
        const serviceCheck = await checkServiceStatus(serviceName)
        checks.push({
            name: `Service: ${serviceName}`,
            result: serviceCheck,
        })

        // Check port
        const portCheck = await checkPortListening(port)
        checks.push({
            name: `Port: ${port} (${packageName})`,
            result: portCheck,
        })

        // Check HTTP endpoint
        const httpCheck = await checkHttpEndpoint(httpsUrl, 10000)
        checks.push({
            name: `HTTP: ${httpsUrl}`,
            result: httpCheck,
        })
    }

    const allHealthy = checks.every((check) => check.result.healthy)
    const failedChecks = checks.filter((check) => !check.result.healthy)

    return {
        checks,
        healthy: allHealthy,
        message: allHealthy ?
            'All health checks passed' :
            `${failedChecks.length} health check(s) failed: ${failedChecks.map((c) => c.name).join(', ')}`,
    }
}
