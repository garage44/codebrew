import {existsSync, readFileSync, writeFileSync} from 'node:fs'
import {homedir} from 'node:os'
import path from 'node:path'

const REGISTRY_PATH = path.join(homedir(), '.pr-deployments.json')

export interface PRDeployment {
    author: string
    created: number
    directory: string
    head_ref: string
    head_sha: string
    number: number
    ports: {
        expressio: number
        nonlinear: number
        pyrite: number
    }
    status: 'deploying' | 'running' | 'failed' | 'cleaning'
    token: string
    updated: number
}

export interface PRRegistry {
    [prNumber: string]: PRDeployment
}

export async function loadPRRegistry(): Promise<PRRegistry> {
    if (!existsSync(REGISTRY_PATH)) {
        return {}
    }

    try {
        const content = readFileSync(REGISTRY_PATH, 'utf8')
        return JSON.parse(content)
    } catch(error) {
        console.error('[pr-registry] Failed to load registry:', error)
        return {}
    }
}

export async function savePRRegistry(registry: PRRegistry): Promise<void> {
    try {
        writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2), 'utf8')
    } catch(error) {
        console.error('[pr-registry] Failed to save registry:', error)
        throw error
    }
}

export async function addPRDeployment(deployment: PRDeployment): Promise<void> {
    const registry = await loadPRRegistry()
    registry[deployment.number] = deployment
    await savePRRegistry(registry)
}

export async function updatePRDeployment(
    prNumber: number,
    updates: Partial<PRDeployment>,
): Promise<void> {
    const registry = await loadPRRegistry()
    if (registry[prNumber]) {
        registry[prNumber] = {
            ...registry[prNumber],
            ...updates,
            updated: Date.now(),
        }
        await savePRRegistry(registry)
    }
}

export async function removePRDeployment(prNumber: number): Promise<void> {
    const registry = await loadPRRegistry()
    delete registry[prNumber]
    await savePRRegistry(registry)
}

export async function getPRDeployment(prNumber: number): Promise<PRDeployment | null> {
    const registry = await loadPRRegistry()
    return registry[prNumber] || null
}

export async function listActivePRDeployments(): Promise<PRDeployment[]> {
    const registry = await loadPRRegistry()
    return Object.values(registry).filter((d) => d.status === 'running')
}
