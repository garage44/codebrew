#!/usr/bin/env bun
import {URL, fileURLToPath} from 'node:url'
import {createBunWebSocketHandler} from '@garage44/common/lib/ws-server'
import {bunchyArgs, bunchyService} from '@garage44/bunchy'
import {config, initConfig} from './lib/config.ts'
import {hash, keyMod, keyPath, padLeft} from '@garage44/common/lib/utils.ts'
import {Enola} from './lib/enola/index.ts'
import {Workspace} from './lib/workspace.ts'
import {Workspaces} from './lib/workspaces.ts'
import {translate_tag} from './lib/translate.ts'
import {createRuntime, createWelcomeBanner, setupBunchyConfig, createWebSocketManagers, service, loggerTransports} from '@garage44/common/service'
import {initDatabase} from '@garage44/common/lib/database'
import fs from 'fs-extra'
import {hideBin} from 'yargs/helpers'
import {i18nFormat} from '@garage44/expressio/lib/i18n'
import {initMiddleware} from './lib/middleware.ts'
import {lintWorkspace} from './lib/lint.ts'
import path from 'node:path'
import {pathCreate, pathRef} from '@garage44/common/lib/paths'
import pc from 'picocolors'
import {registerI18nWebSocketApiRoutes} from './api/i18n.ts'
import {registerWorkspacesWebSocketApiRoutes} from './api/workspaces.ts'
import yargs from 'yargs'
import {devContext} from '@garage44/common/lib/dev-context'

export const serviceDir = fileURLToPath(new URL('.', import.meta.url))

const runtime = createRuntime(serviceDir, path.join(serviceDir, 'package.json'))

function welcomeBanner() {
    return createWelcomeBanner('Expressio', 'I18n for humans, through AI...', runtime.version)
}

// In case we start in development mode.
let bunchyConfig = null

const logger = loggerTransports(config.logger, 'service')
const enola = new Enola()
const workspaces = new Workspaces()

const BUN_ENV = process.env.BUN_ENV || 'production'

const cli = yargs(hideBin(process.argv))
cli.scriptName('expressio')

if (BUN_ENV === 'development') {
    bunchyConfig = setupBunchyConfig({
        logPrefix: 'B',
        serviceDir: runtime.service_dir,
        version: runtime.version,
    })

    bunchyArgs(cli, bunchyConfig)
}

void cli.usage('Usage: $0 [task]')
    .detectLocale(false)
    .command('init', 'Initialize a new .expressio.json workspace file', (yargs) =>
        yargs
            .option('output', {
                alias: 'o',
                default: './src/.expressio.json',
                describe: 'Output path for the workspace file',
                type: 'string',
            })
            .option('workspace-id', {
                alias: 'w',
                default: 'my-app',
                describe: 'Workspace identifier',
                type: 'string',
            })
            .option('source-language', {
                alias: 's',
                default: 'eng-gbr',
                describe: 'Source language code',
                type: 'string',
            })
    , async(argv) => {
        const outputPath = path.resolve(argv.output)

        if (await fs.pathExists(outputPath)) {
            logger.error(`File already exists: ${outputPath}`)
            logger.info('Use a different output path or remove the existing file')
            process.exit(1)
        }

        // Create directory if it doesn't exist
        const outputDir = path.dirname(outputPath)
        await fs.ensureDir(outputDir)

        // Create template workspace file
        const template = {
            config: {
                languages: {
                    source: argv.sourceLanguage,
                    target: [
                        {
                            engine: 'deepl',
                            formality: 'informal',
                            id: 'deu',
                        },
                        {
                            engine: 'deepl',
                            formality: 'informal',
                            id: 'fra',
                        },
                    ],
                },
                source_file: null,
                sync: {
                    dir: '**/*.{ts,tsx}',
                    enabled: false,
                    suggestions: false,
                },
                workspace_id: argv.workspaceId,
            },
            i18n: {
                menu: {
                    settings: {
                        source: 'Settings',
                        target: {
                            deu: '',
                            fra: '',
                        },
                    },
                },
                welcome: {
                    source: 'Welcome',
                    target: {
                        deu: '',
                        fra: '',
                    },
                },
            },
        }

        await fs.writeFile(outputPath, JSON.stringify(template, null, 2) + '\n', 'utf8')
        logger.info(`Created workspace file: ${outputPath}`)
        logger.info(`Workspace ID: ${argv.workspaceId}`)
        logger.info(`Source language: ${argv.sourceLanguage}`)
        logger.info('Edit the file to add your translations and configure target languages')
    })
    .command('import', 'Import source translations from i18next file', (yargs) =>
        yargs
            .option('workspace', {
                alias: 'w',
                default: './src/.expressio.json',
                describe: 'Workspace file to use',
                type: 'string',
            })
            .option('input', {
                alias: 'i',
                default: 'en.json',
                describe: 'I18next file for input',
                type: 'string',
            })
            .option('merge', {
                alias: 'm',
                default: false,
                describe: 'Merge with existing translations instead of replacing',
                type: 'boolean',
            })
            .option('translate', {
                alias: 't',
                default: false,
                describe: 'Automatically translate imported tags',
                type: 'boolean',
            })
    , async(argv) => {
        const workspace = new Workspace()
        await workspace.init({
            source_file: path.resolve(argv.workspace),
        }, false)

        const inputFile = path.resolve(argv.input)
        logger.info(`Importing from: ${inputFile}`)

        if (!await fs.pathExists(inputFile)) {
            logger.error(`Input file not found: ${inputFile}`)
            process.exit(1)
        }

        const importData = JSON.parse((await fs.readFile(inputFile, 'utf8')))
        const createTags = []
        const skipTags = []

        keyMod(importData, (sourceRef, id, refPath) => {
            // The last string in refPath must not be a reserved keyword (.e.g source/target)
            const last = refPath.at(-1)
            if (last === 'source' || last === 'target' || last === 'cache') {
                logger.warn(`skipping reserved keyword: ${last} (refPath: ${refPath.join('.')})`)
                skipTags.push(refPath.join('.'))
                return
            }

            // Skip internal properties
            if (id.startsWith('_')) {
                return
            }

            if (typeof sourceRef[id] === 'string') {
                // Check if tag already exists
                const existingRef = keyPath(workspace.i18n, refPath)

                if (existingRef && 'source' in existingRef && !argv.merge) {
                    logger.debug(`skipping existing tag: ${refPath.join('.')}`)
                    skipTags.push(refPath.join('.'))
                    return
                }

                createTags.push(refPath)
                pathCreate(workspace.i18n, [...refPath], {
                    source: sourceRef[id],
                }, workspace.config.languages.target)
            }
        })

        await workspace.save()
        logger.info(`Imported: ${createTags.length} tags`)
        if (skipTags.length) {
            logger.info(`Skipped: ${skipTags.length} tags (existing or invalid)`)
        }

        // Auto-translate if requested
        if (argv.translate && createTags.length > 0) {
            logger.info('Starting automatic translation...')
            await enola.init(config.enola, logger)

            for (const tagPath of createTags) {
                try {
                    const {id, ref} = pathRef(workspace.i18n, tagPath)
                    const sourceText = ref[id].source

                    logger.info(`Translating: ${tagPath.join('.')}`)
                    await translate_tag(workspace, tagPath, sourceText, true)
                } catch (error) {
                    logger.error(`Failed to translate ${tagPath.join('.')}: ${error.message}`)
                }
            }

            await workspace.save()
            logger.info('Translation complete!')
        }
    })
    .command('translate-all', 'Translate all untranslated or outdated tags', (yargs) =>
        yargs
            .option('workspace', {
                alias: 'w',
                default: './src/.expressio.json',
                describe: 'Workspace file to use',
                type: 'string',
            })
            .option('force', {
                alias: 'f',
                default: false,
                describe: 'Force retranslation of all tags (ignore cache)',
                type: 'boolean',
            })
    , async(argv) => {
        const workspace = new Workspace()
        await workspace.init({
            source_file: path.resolve(argv.workspace),
        }, false)

        await enola.init(config.enola, logger)

        const tagsToTranslate = []

        // Collect all tags that need translation
        keyMod(workspace.i18n, (ref, id, refPath) => {
            if (ref && 'source' in ref && typeof ref.source === 'string') {
                // Skip soft tags
                if (ref._soft) {
                    return
                }

                const needsTranslation = argv.force ||
                    !ref.cache ||
                    ref.cache !== hash(ref.source) ||
                    workspace.config.languages.target.some((lang) => !ref.target[lang.id])

                if (needsTranslation) {
                    tagsToTranslate.push(refPath)
                }
            }
        })

        if (tagsToTranslate.length === 0) {
            logger.info('All tags are up to date!')
            process.exit(0)
        }

        logger.info(`Found ${tagsToTranslate.length} tags to translate`)

        for (const [index, tagPath] of tagsToTranslate.entries()) {
            try {
                const {id, ref} = pathRef(workspace.i18n, tagPath)
                const sourceText = ref[id].source

                logger.info(`[${index + 1}/${tagsToTranslate.length}] Translating: ${tagPath.join('.')}`)
                await translate_tag(workspace, tagPath, sourceText, true)
            } catch (error) {
                logger.error(`Failed to translate ${tagPath.join('.')}: ${error.message}`)
            }
        }

        await workspace.save()
        logger.info('Translation complete!')
    })
    .command('stats', 'Show translation statistics', (yargs) =>
        yargs
            .option('workspace', {
                alias: 'w',
                default: './src/.expressio.json',
                describe: 'Workspace file to use',
                type: 'string',
            })
    , async(argv) => {
        const workspace = new Workspace()
        await workspace.init({
            source_file: path.resolve(argv.workspace),
        }, false)

        const stats = {
            groups: 0,
            languages: workspace.config.languages.target.length,
            outdated: 0,
            redundant: 0,
            soft: 0,
            tags: 0,
            translated: {},
            untranslated: {},
        }

        // Initialize language stats
        workspace.config.languages.target.forEach((lang) => {
            stats.translated[lang.id] = 0
            stats.untranslated[lang.id] = 0
        })

        keyMod(workspace.i18n, (ref, id, refPath) => {
            if (ref && typeof ref === 'object') {
                if ('source' in ref && typeof ref.source === 'string') {
                    stats.tags++

                    if (ref._soft) {
                        stats.soft++
                    }

                    if (ref._redundant) {
                        stats.redundant++
                    }

                    const currentHash = hash(ref.source)
                    if (ref.cache && ref.cache !== currentHash) {
                        stats.outdated++
                    }

                    // Check translation status per language
                    workspace.config.languages.target.forEach((lang) => {
                        if (ref.target[lang.id] && ref.target[lang.id] !== id) {
                            stats.translated[lang.id]++
                        } else {
                            stats.untranslated[lang.id]++
                        }
                    })
                } else if (!refPath.length || refPath.length > 0) {
                    stats.groups++
                }
            }
        })

        // Display statistics
        // oxlint-disable-next-line no-console
        console.log(pc.bold(pc.cyan('\n📊 Translation Statistics\n')))
        // oxlint-disable-next-line no-console
        console.log(pc.bold('Overview:'))
        // oxlint-disable-next-line no-console
        console.log(`  Groups: ${pc.green(stats.groups)}`)
        // oxlint-disable-next-line no-console
        console.log(`  Tags: ${pc.green(stats.tags)}`)
        // oxlint-disable-next-line no-console
        console.log(`  Languages: ${pc.green(stats.languages)}`)

        if (stats.soft > 0) {
            // oxlint-disable-next-line no-console
            console.log(`  Soft tags: ${pc.yellow(stats.soft)}`)
        }

        if (stats.redundant > 0) {
            // oxlint-disable-next-line no-console
            console.log(`  Redundant tags: ${pc.yellow(stats.redundant)}`)
        }

        if (stats.outdated > 0) {
            // oxlint-disable-next-line no-console
            console.log(`  Outdated translations: ${pc.yellow(stats.outdated)}`)
        }

        // oxlint-disable-next-line no-console
        console.log(pc.bold('\nTranslation Progress:'))
        workspace.config.languages.target.forEach((lang) => {
            const total = stats.translated[lang.id] + stats.untranslated[lang.id]
            const percentage = total > 0 ? Math.round((stats.translated[lang.id] / total) * 100) : 0
            const bar = '█'.repeat(Math.floor(percentage / 2)) + '░'.repeat(50 - Math.floor(percentage / 2))

            // oxlint-disable-next-line no-console
            console.log(`  ${lang.name} (${lang.id}):`)
            // oxlint-disable-next-line no-console
            console.log(`    ${bar} ${percentage}%`)
            // oxlint-disable-next-line no-console
            console.log(`    ${pc.green(stats.translated[lang.id])} translated, ${pc.yellow(stats.untranslated[lang.id])} remaining`)
        })

        // oxlint-disable-next-line no-console
        console.log('')
    })
    .command('export', 'Export target translations to i18next format', (yargs) =>
        yargs
            .option('workspace', {
                alias: 'w',
                default: './src/.expressio.json',
                describe: 'Workspace file to use',
                type: 'string',
            })
            .option('output', {
                alias: 'o',
                default: './i18next.json',
                describe: 'Output file path',
                type: 'string',
            })
            .option('format', {
                alias: 'f',
                choices: ['i18next', 'flat', 'nested'],
                default: 'i18next',
                describe: 'Export format',
                type: 'string',
            })
            .option('language', {
                alias: 'l',
                describe: 'Export specific language (default: all languages)',
                type: 'string',
            })
            .option('split', {
                alias: 's',
                default: false,
                describe: 'Split translations into separate files per language',
                type: 'boolean',
            })
    , async(argv) => {
        const workspace = new Workspace()
        await workspace.init({
            source_file: path.resolve(argv.workspace),
        }, false)

        const outputDir = path.dirname(path.resolve(argv.output))
        const outputBase = path.basename(argv.output, path.extname(argv.output))
        const outputExt = path.extname(argv.output) || '.json'

        await fs.mkdirp(outputDir)

        const languagesToExport = argv.language
            ? workspace.config.languages.target.filter((lang) => lang.id === argv.language)
            : workspace.config.languages.target

        if (argv.language && languagesToExport.length === 0) {
            logger.error(`Language '${argv.language}' not found in workspace`)
            process.exit(1)
        }

        if (argv.split) {
            // Export each language to a separate file
            for (const language of languagesToExport) {
                const outputFile = path.join(outputDir, `${outputBase}.${language.id}${outputExt}`)
                const translations = i18nFormat(workspace.i18n, [language])

                await fs.writeFile(outputFile, JSON.stringify(translations, null, 2), 'utf8')
                logger.info(`Exported ${language.name} to: ${outputFile}`)
            }
        } else {
            // Export all languages to a single file
            const bundleTarget = path.resolve(outputDir, `${outputBase}${outputExt}`)
            const translations = i18nFormat(workspace.i18n, languagesToExport)

            await fs.writeFile(bundleTarget, JSON.stringify(translations, null, 2), 'utf8')
            logger.info(`Exported to: ${bundleTarget}`)
        }

        logger.info('Export complete!')
    })
    .command('lint', 'Lint translations', (yargs) => {
        yargs.option('workspace', {
            alias: 'w',
            default: './src/.expressio.json',
            describe: 'Workspace file to use',
            type: 'string',
        })
    }, async(argv) => {
        const workspace = new Workspace()
        await workspace.init({
            source_file: path.resolve(argv.workspace),
        }, false)

        const lintResult = await lintWorkspace(workspace, 'lint')

        if (lintResult) {
            const maxPadding = Math.max(...lintResult.create_tags.map((fileGroup) =>
                Math.max(...fileGroup.groups.map((tag) => `${tag.line}:${tag.column}`.length)),
            )) + 2

            for (const fileGroup of lintResult.create_tags) {
                if (fileGroup.groups.length) {
                    // oxlint-disable-next-line no-console
                    console.log(pc.underline(`\n${fileGroup.file}`))
                    for (const tag of fileGroup.groups) {
                        // oxlint-disable-next-line no-console
                        console.log(
                            `${padLeft(`${tag.line}:${tag.column}`, maxPadding, ' ')} ${pc.red('error')} ${tag.match[0]} found in source code, but not in workspace`,
                        )
                    }
                }
            }

            if (lintResult.delete_tags.length) {
                for (const {group, tags} of lintResult.delete_tags) {
                    // oxlint-disable-next-line no-console
                    console.log(pc.underline(`\n${group}`))
                    for (const tag of tags) {
                        // oxlint-disable-next-line no-console
                        console.log(`  ${pc.red('error')} ${tag.path.join('.')} in workspace, but not found in source code`)
                    }
                }
            }

            const problems = lintResult.create_tags.length + lintResult.delete_tags.length
            // oxlint-disable-next-line no-console
            console.log(`\n✖ Found ${problems} issues`)
            process.exit(1)
        }

        // oxlint-disable-next-line no-console
        console.log('\n✔ No issues found')
        process.exit(0)
    })
    .command('start', 'Start the Expressio service', (yargs) => {
        // oxlint-disable-next-line no-console
        console.log(welcomeBanner())
        return yargs
            .option('host', {
                alias: 'h',
                default: 'localhost',
                describe: 'hostname to listen on',
                type: 'string',
            })
            .option('port', {
                alias: 'p',
                default: 3030,
                describe: 'port to run the Expression service on',
                type: 'number',
            })
    }, async(argv) => {
        await initConfig(config)

        // Initialize database (creates users table)
        const database = initDatabase(undefined, 'expressio', logger)

        // Initialize common service (including UserManager) with database
        // Use environment variable for config path if set (for PR deployments)
        const configPath = process.env.CONFIG_PATH || '~/.expressiorc'
        await service.init({appName: 'expressio', configPath, useBcrypt: false}, database)

        // Initialize enola first
        await enola.init(config.enola, logger)

        // Initialize middleware and WebSocket server
        const {handleRequest} = await initMiddleware(bunchyConfig)

        // Create WebSocket managers
        const {bunchyManager, wsManager} = createWebSocketManagers(config.authOptions, config.sessionMiddleware)

        // Set the WebSocket manager for workspaces and then initialize
        workspaces.setWebSocketManager(wsManager)
        await workspaces.init(config.workspaces)

        // Map of endpoint to manager for the handler
        const wsManagers = new Map([
            ['/ws', wsManager],
            ['/bunchy', bunchyManager],
        ])

        const enhancedWebSocketHandler = createBunWebSocketHandler(wsManagers)
        registerI18nWebSocketApiRoutes(wsManager)
        registerWorkspacesWebSocketApiRoutes(wsManager)

        // Start Bun.serve server
        const server = Bun.serve({
            fetch: (req, server) => {
                const url = new URL(req.url)
                if (url.pathname === '/dev/snapshot') {
                    return new Response(JSON.stringify(devContext.snapshot({
                        version: runtime.version,
                        workspace: 'expressio',
                    })), {headers: {'Content-Type': 'application/json'}})
                }
                return handleRequest(req, server)
            },
            hostname: argv.host,
            port: argv.port,
            websocket: enhancedWebSocketHandler,
        })

        if (BUN_ENV === 'development') {
            await bunchyService(server, bunchyConfig, bunchyManager)
        }

        logger.info(`service: http://${argv.host}:${argv.port}`)
    })
    .demandCommand()
    .help('help')
    .showHelpOnFail(true)
    .argv

export {
    enola,
    logger,
    runtime,
    workspaces,
}