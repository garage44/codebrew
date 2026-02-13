import {copyObject, randomId} from '@garage44/common/lib/utils'
import fs from 'fs-extra'
import {homedir} from 'node:os'
import path from 'node:path'
import rc from 'rc'

import {logger} from '../service.ts'

const config = rc('pyrite', {
    listen: {
        host: '0.0.0.0',
        port: 3030,
    },
    logger: {
        file: 'pyrite.log',
        level: 'debug',
    },
    session: {
        // One day
        cookie: {maxAge: 1000 * 60 * 60 * 24},
        resave: false,
        saveUninitialized: true,
        secret: randomId(32),
    },
    sfu: {
        path: null,
        url: 'http://localhost:8443',
    },
    users: [
        {
            admin: true,
            name: 'admin',
            password: 'admin',
        },
    ],
})

async function initConfig(config: Record<string, unknown>) {
    // Check for environment variable first (for PR deployments and isolated instances)
    const envConfigPath = process.env.CONFIG_PATH
    const configPath = envConfigPath || path.join(homedir(), '.pyriterc')
    // Check if the config file exists
    if (!(await fs.pathExists(configPath))) {
        await saveConfig()
    }
    return config
}

async function saveConfig() {
    // Check for environment variable first (for PR deployments and isolated instances)
    const envConfigPath = process.env.CONFIG_PATH
    const configPath = envConfigPath || path.join(homedir(), '.pyriterc')
    const data = copyObject(config) as Record<string, unknown> & {configs?: unknown; config?: unknown; _?: unknown}
    delete data.configs
    delete data.config
    delete data._

    await fs.writeFile(configPath, JSON.stringify(data, null, 4))
    logger.info(`[config] saved config to ${configPath}`)
}

export function getSfuPath(): string {
    const p = (config as {sfu?: {path?: string | null}}).sfu?.path
    if (!p) {
        throw new Error('config.sfu.path is not configured')
    }
    return p
}

export {config, initConfig, saveConfig}
