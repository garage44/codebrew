import {copyObject, randomId} from '@garage44/common/lib/utils'
import fs from 'fs-extra'
import {homedir} from 'node:os'
import path from 'node:path'
import rc from 'rc'

import {logger} from '../service.ts'

// Default config structure
const defaultConfig = {
    agents: {
        // Set to true to autostart all enabled agents, or array of agent IDs
        autostart: false,
        developer: {
            enabled: true,
            maxConcurrent: 3,
        },
        planner: {
            // 5 minutes
            checkInterval: 300000,
            enabled: true,
        },
        reviewer: {
            enabled: true,
            maxConcurrent: 2,
        },
    },
    anthropic: {
        apiKey: process.env.ANTHROPIC_API_KEY || '',
        model: 'claude-3-5-sonnet-20241022',
        // Default: 1M tokens per month
        tokenLimit: parseInt(process.env.ANTHROPIC_TOKEN_LIMIT || '1000000', 10),
    },
    ci: {
        maxFixAttempts: 3,
        // 10 minutes
        timeout: 600000,
    },
    embeddings: {
        chunkOverlap: 200,
        chunkSize: 1000,
        // Local model dimension (Xenova/all-MiniLM-L6-v2)
        dimension: 384,
        local: {
            dimension: 384,
            model: 'Xenova/all-MiniLM-L6-v2',
        },
        openai: {
            apiKey: process.env.OPENAI_API_KEY || '',
            dimension: 1536,
            model: 'text-embedding-3-small',
        },
        // 'voyageai' | 'local' | 'openai'
        provider: 'local',
        voyageai: {
            apiKey: process.env.VOYAGE_API_KEY || '',
            model: 'voyage-3',
        },
    },
    git: {
        defaultPlatform: 'github',
        github: {
            token: process.env.GITHUB_TOKEN || '',
        },
        gitlab: {
            token: process.env.GITLAB_TOKEN || '',
            url: 'https://gitlab.com',
        },
    },
    logger: {
        file: 'nonlinear.log',
        level: 'debug',
    },
    public: {
        // Show Planning board to non-authenticated users
        showPlanning: true,
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
}

// Load config with error handling
let config: typeof defaultConfig
try {
    config = rc('nonlinear', defaultConfig)
} catch (error) {
    logger.error(`[config] Failed to load config file: ${error}`)
    logger.warn('[config] Using default config. Fix the config file and restart.')
    // Use defaults if config file is invalid
    config = defaultConfig
    // Try to backup the bad config file (async, non-blocking)
    const envConfigPath = process.env.CONFIG_PATH
    const configPath = envConfigPath || path.join(homedir(), '.nonlinearrc')
    fs.pathExists(configPath)
        .then((exists) => {
            if (exists) {
                return fs
                    .copyFile(configPath, `${configPath}.backup.${Date.now()}`)
                    .then(() => {
                        logger.info(`[config] Backed up invalid config to ${configPath}.backup.${Date.now()}`)
                    })
                    .catch(() => {
                        // Backup failed, ignore
                    })
            }
        })
        .catch(() => {
            // Ignore errors during backup attempt
        })
}

async function initConfig(config) {
    // Check for environment variable first (for PR deployments and isolated instances)
    const envConfigPath = process.env.CONFIG_PATH
    const configPath = envConfigPath || path.join(homedir(), '.nonlinearrc')
    // Check if the config file exists
    if (!(await fs.pathExists(configPath))) {
        await saveConfig()
    }
    return config
}

async function saveConfig() {
    // Check for environment variable first (for PR deployments and isolated instances)
    const envConfigPath = process.env.CONFIG_PATH
    const configPath = envConfigPath || path.join(homedir(), '.nonlinearrc')
    const data = copyObject(config) as Record<string, unknown>
    delete data.configs
    delete data.config
    delete data._

    // Validate JSON before writing
    let jsonString: string
    try {
        jsonString = JSON.stringify(data, null, 4)
        // Validate by parsing it back
        JSON.parse(jsonString)
    } catch (error) {
        logger.error(`[config] Failed to serialize config: ${error}`)
        throw new Error(`Config serialization failed: ${error instanceof Error ? error.message : String(error)}`, {cause: error})
    }

    await fs.writeFile(configPath, jsonString)
    logger.info(`[config] saved config to ${configPath}`)
}

export {config, saveConfig, initConfig}
