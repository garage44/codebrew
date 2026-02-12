import {copyObject, randomId} from '@garage44/common/lib/utils'
import fs from 'fs-extra'
import {homedir} from 'node:os'
import path from 'node:path'
import rc from 'rc'

const config = rc('codebrew', {
    logger: {
        file: 'codebrew.log',
        level: 'debug',
    },
    session: {
        cookie: {maxAge: 1000 * 60 * 60 * 24},
        resave: false,
        saveUninitialized: true,
        secret: randomId(32),
    },
})

async function initConfig() {
    const envConfigPath = process.env.CONFIG_PATH
    const configPath = envConfigPath || path.join(homedir(), '.codebrewrc')
    if (!await fs.pathExists(configPath)) {
        await saveConfig()
    }
    return config
}

async function saveConfig() {
    const envConfigPath = process.env.CONFIG_PATH
    const configPath = envConfigPath || path.join(homedir(), '.codebrewrc')
    const data = copyObject(config)
    delete data.configs
    delete data.config
    delete data._
    await fs.writeFile(configPath, JSON.stringify(data, null, 4))
}

export {
    config,
    initConfig,
    saveConfig,
}
