import {copyObject, randomId} from '@garage44/common/lib/utils.ts'
import fs from 'fs-extra'
import {homedir} from 'node:os'
import path from 'node:path'
import rc from 'rc'

import {logger, workspaces} from '../service.ts'

const config = rc('expressio', {
    enola: {
        engines: {
            anthropic: {
                api_key: '',
                base_url: 'https://api.anthropic.com/v1',
            },
            deepl: {
                api_key: '',
                base_url: 'https://api-free.deepl.com/v2',
            },
        },
    },
    language_ui: 'eng-gbr',
    logger: {
        file: 'expressio.log',
        level: 'debug',
    },
    session: {
        // One day
        cookie: {maxAge: 1000 * 60 * 60 * 24},
        resave: false,
        saveUninitialized: true,
        secret: randomId(32),
    },
    users: [
        {
            password: {
                key: 'admin',
                type: 'plaintext',
            },
            permissions: {
                admin: true,
            },
            profile: {
                displayName: 'Admin',
            },
            updatedAt: new Date().toISOString(),
            username: 'admin',
        },
    ],
    workspaces: [],
})

async function initConfig(_cfg?: unknown): Promise<void> {
    // Check for environment variable first (for PR deployments and isolated instances)
    const envConfigPath = process.env.CONFIG_PATH
    const configPath = envConfigPath || path.join(homedir(), '.expressiorc')
    // Check if the config file exists
    if (!(await fs.pathExists(configPath))) {
        await saveConfig()
    }
}

async function saveConfig() {
    // Check for environment variable first (for PR deployments and isolated instances)
    const envConfigPath = process.env.CONFIG_PATH
    const configPath = envConfigPath || path.join(homedir(), '.expressiorc')
    const data = copyObject(config) as Record<string, unknown>
    delete (data as {configs?: unknown}).configs
    delete (data as {config?: unknown}).config
    delete (data as {_?: unknown})._
    delete (data as {source_file?: unknown}).source_file
    const enolaData = data.enola as {languages?: unknown}
    if ('languages' in enolaData) {
        delete enolaData.languages
    }
    ;(data as {workspaces: string[]}).workspaces = workspaces.workspaces
        .map((i) => i.config.source_file)
        .filter((f): f is string => f !== null)

    for (const engine of Object.values((data.enola as {engines: Record<string, unknown>}).engines)) {
        const engineData = engine as {active?: unknown; usage?: unknown}
        delete engineData.usage
        delete engineData.active
    }

    await fs.writeFile(configPath, JSON.stringify(data, null, 4))
    logger.info(`[config] saved config to ${configPath}`)
}

export {config, saveConfig, initConfig}
