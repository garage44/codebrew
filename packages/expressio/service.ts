#!/usr/bin/env bun
import {bunchyArgs, bunchyService} from '@garage44/bunchy'
import {initDatabase} from '@garage44/common/lib/database'
import {devContext} from '@garage44/common/lib/dev-context'
import {pathCreate, pathRef} from '@garage44/common/lib/paths'
import {hash, keyMod, keyPath, padLeft} from '@garage44/common/lib/utils.ts'
import {createBunWebSocketHandler} from '@garage44/common/lib/ws-server'
import {
    createRuntime,
    createWebSocketManagers,
    createWelcomeBanner,
    loggerTransports,
    service,
    setupBunchyConfig,
} from '@garage44/common/service'
import {i18nFormat} from '@garage44/expressio/lib/i18n'
import fs from 'fs-extra'
import path from 'node:path'
import {URL, fileURLToPath} from 'node:url'
import pc from 'picocolors'
import yargs from 'yargs'
import {hideBin} from 'yargs/helpers'

import type {EnolaConfig} from './lib/enola/types.ts'

import {registerI18nWebSocketApiRoutes} from './api/i18n.ts'
import {registerWorkspacesWebSocketApiRoutes} from './api/workspaces.ts'
import {config, initConfig} from './lib/config.ts'
import {Enola} from './lib/enola/index.ts'
import {lintWorkspace} from './lib/lint.ts'
import {initMiddleware} from './lib/middleware.ts'
import {translate_tag} from './lib/translate.ts'
import {Workspace} from './lib/workspace.ts'
import {Workspaces} from './lib/workspaces.ts'

export const serviceDir = fileURLToPath(new URL('.', import.meta.url))

const runtime = createRuntime(serviceDir, path.join(serviceDir, 'package.json'))

function welcomeBanner(): string {
    return createWelcomeBanner('Expressio', 'I18n for humans, through AI...', runtime.version)
}

// In case we start in development mode.
let bunchyConfig: {
    common: string
    logPrefix: string
    reload_ignore: string[]
    separateAssets?: string[]
    version: string
    workspace: string
} | null = null

const logger = loggerTransports(
    {
        file: config.logger.file || 'expressio.log',
        level: (config.logger.level || 'debug') as 'error' | 'warn' | 'info' | 'success' | 'verbose' | 'debug',
    },
    'service',
)
if (import.meta.main) {
    logger.info('initialized')
}
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    bunchyArgs(cli as any, bunchyConfig)
}

// eslint-disable-next-line no-void
void cli
    .usage('Usage: $0 [task]')
    .detectLocale(false)
    .command(
        'init',
        'Initialize a new .expressio.json workspace file',
        (yargs): typeof yargs =>
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
                }),
        async (argv): Promise<void> => {
            const outputPath = path.resolve(argv.output as string)

            if (await fs.pathExists(outputPath)) {
                logger.error(`file already exists: ${outputPath}`)
                logger.info('use a different output path or remove the existing file')
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

            await fs.writeFile(outputPath, `${JSON.stringify(template, null, 2)}\n`, 'utf8')
            logger.info(`created workspace file: ${outputPath}`)
            logger.info(`workspace id: ${argv.workspaceId}`)
            logger.info(`source language: ${argv.sourceLanguage}`)
            logger.info('edit the file to add your translations and configure target languages')
        },
    )
    .command(
        'import',
        'Import source translations from i18next file',
        (yargs): typeof yargs =>
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
                }),
        async (argv): Promise<void> => {
            const workspace = new Workspace()
            await workspace.init(
                {
                    source_file: path.resolve(argv.workspace as string),
                },
                false,
            )

            const inputFile = path.resolve(argv.input as string)
            logger.info(`importing from: ${inputFile}`)

            if (!(await fs.pathExists(inputFile))) {
                logger.error(`input file not found: ${inputFile}`)
                process.exit(1)
            }

            const importData = JSON.parse(await fs.readFile(inputFile, 'utf8')) as Record<string, unknown>
            const createTags: string[][] = []
            const skipTags: string[] = []

            keyMod(importData, (sourceRef: Record<string, unknown>, key: string | null, refPath: string[]): void => {
                if (!key) {
                    return
                }
                // The last string in refPath must not be a reserved keyword (.e.g source/target)
                const last = refPath.at(-1)
                if (last === 'source' || last === 'target' || last === 'cache') {
                    logger.warn(`skipping reserved keyword: ${last} (refPath: ${refPath.join('.')})`)
                    skipTags.push(refPath.join('.'))
                    return
                }

                // Skip internal properties
                if (key.startsWith('_')) {
                    return
                }

                const sourceValue = sourceRef[key]
                if (typeof sourceValue === 'string') {
                    // Check if tag already exists
                    const existingRef = keyPath(workspace.i18n, refPath)

                    if (existingRef && 'source' in existingRef && !argv.merge) {
                        logger.debug(`skipping existing tag: ${refPath.join('.')}`)
                        skipTags.push(refPath.join('.'))
                        return
                    }

                    createTags.push(refPath)
                    pathCreate(
                        workspace.i18n,
                        [...refPath],
                        {
                            source: sourceValue,
                            target: {},
                        },
                        workspace.config.languages.target as unknown as {
                            engine: 'anthropic' | 'deepl'
                            formality: 'default' | 'more' | 'less'
                            id: string
                            name: string
                        }[],
                    )
                }
            })

            await workspace.save()
            logger.info(`imported: ${createTags.length} tags`)
            if (skipTags.length) {
                logger.info(`skipped: ${skipTags.length} tags (existing or invalid)`)
            }

            // Auto-translate if requested
            if (argv.translate && createTags.length > 0) {
                logger.info('starting automatic translation...')
                await enola.init({...config.enola, languages: enola.config.languages} as unknown as EnolaConfig, logger)

                // eslint-disable-next-line no-await-in-loop
                for (const tagPath of createTags) {
                    try {
                        const pathRefResult = pathRef(workspace.i18n, tagPath)
                        if (pathRefResult?.id) {
                            const tagRef = pathRefResult.ref[pathRefResult.id] as {source?: string} | undefined
                            if (tagRef?.source) {
                                logger.info(`translating: ${tagPath.join('.')}`)
                                // eslint-disable-next-line no-await-in-loop
                                await translate_tag(workspace, tagPath, tagRef.source, true)
                            }
                        }
                    } catch {
                        logger.error(`failed to translate ${tagPath.join('.')}`)
                    }
                }

                await workspace.save()
                logger.info('translation complete!')
            }
        },
    )
    .command(
        'translate-all',
        'Translate all untranslated or outdated tags',
        (yargs): typeof yargs =>
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
                }),
        async (argv): Promise<void> => {
            const workspace = new Workspace()
            await workspace.init(
                {
                    source_file: path.resolve(argv.workspace as string),
                },
                false,
            )

            await enola.init({...config.enola, languages: enola.config.languages} as unknown as EnolaConfig, logger)

            const tagsToTranslate: string[][] = []

            // Collect all tags that need translation
            keyMod(workspace.i18n, (ref: Record<string, unknown>, key: string | null, refPath: string[]): void => {
                if (!key) {
                    return
                }
                if (
                    ref &&
                    typeof ref === 'object' &&
                    ref !== null &&
                    'source' in ref &&
                    typeof (ref as Record<string, unknown>).source === 'string'
                ) {
                    const refRecord = ref as Record<string, unknown>
                    // Skip soft tags
                    if (refRecord._soft) {
                        return
                    }

                    const sourceText = refRecord.source as string
                    const needsTranslation =
                        argv.force ||
                        !refRecord.cache ||
                        refRecord.cache !== hash(sourceText) ||
                        workspace.config.languages.target.some((lang): boolean => {
                            const target = refRecord.target as Record<string, unknown> | undefined
                            return !target || !target[lang.id]
                        })

                    if (needsTranslation) {
                        tagsToTranslate.push(refPath)
                    }
                }
            })

            if (tagsToTranslate.length === 0) {
                logger.info('all tags are up to date!')
                process.exit(0)
            }

            logger.info(`found ${tagsToTranslate.length} tags to translate`)

            // eslint-disable-next-line no-await-in-loop
            for (const [index, tagPath] of tagsToTranslate.entries()) {
                try {
                    const pathRefResult = pathRef(workspace.i18n, tagPath)
                    if (pathRefResult?.id) {
                        const tagRef = pathRefResult.ref[pathRefResult.id] as {source?: string} | undefined
                        if (tagRef?.source) {
                            logger.info(`[${index + 1}/${tagsToTranslate.length}] translating: ${tagPath.join('.')}`)
                            // eslint-disable-next-line no-await-in-loop
                            await translate_tag(workspace, tagPath, tagRef.source, true)
                        }
                    }
                } catch {
                    logger.error(`failed to translate ${tagPath.join('.')}`)
                }
            }

            await workspace.save()
            logger.info('translation complete!')
        },
    )
    .command(
        'stats',
        'Show translation statistics',
        (yargs): typeof yargs =>
            yargs.option('workspace', {
                alias: 'w',
                default: './src/.expressio.json',
                describe: 'Workspace file to use',
                type: 'string',
            }),
        async (argv): Promise<void> => {
            const workspace = new Workspace()
            await workspace.init(
                {
                    source_file: path.resolve(argv.workspace as string),
                },
                false,
            )

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
            const statsTranslatedInit = stats.translated as Record<string, number>
            const statsUntranslatedInit = stats.untranslated as Record<string, number>
            for (const lang of workspace.config.languages.target) {
                statsTranslatedInit[lang.id] = 0
                statsUntranslatedInit[lang.id] = 0
            }

            keyMod(workspace.i18n, (ref: Record<string, unknown>, key: string | null, refPath: string[]): void => {
                if (!key) {
                    return
                }
                if (ref && typeof ref === 'object' && ref !== null) {
                    const refRecord = ref as Record<string, unknown>
                    if ('source' in refRecord && typeof refRecord.source === 'string') {
                        stats.tags += 1

                        if (refRecord._soft) {
                            stats.soft += 1
                        }

                        if (refRecord._redundant) {
                            stats.redundant += 1
                        }

                        const sourceText = refRecord.source as string
                        const currentHash = hash(sourceText)
                        if (refRecord.cache && refRecord.cache !== currentHash) {
                            stats.outdated += 1
                        }

                        // Check translation status per language
                        const target = refRecord.target as Record<string, unknown> | undefined
                        for (const lang of workspace.config.languages.target) {
                            const langId = lang.id
                            if (target && target[langId] && target[langId] !== key) {
                                statsTranslatedInit[langId] += 1
                            } else {
                                statsUntranslatedInit[langId] += 1
                            }
                        }
                    } else {
                        stats.groups += 1
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
            const statsTranslated = stats.translated as Record<string, number>
            const statsUntranslated = stats.untranslated as Record<string, number>
            for (const lang of workspace.config.languages.target) {
                const langId = lang.id
                const total = statsTranslated[langId] + statsUntranslated[langId]
                const percentage = total > 0 ? Math.round((statsTranslated[langId] / total) * 100) : 0
                const bar = '█'.repeat(Math.floor(percentage / 2)) + '░'.repeat(50 - Math.floor(percentage / 2))
                const langWithName = lang as typeof lang & {name: string}

                // oxlint-disable-next-line no-console
                console.log(`  ${langWithName.name} (${lang.id}):`)
                // oxlint-disable-next-line no-console
                console.log(`    ${bar} ${percentage}%`)
                // oxlint-disable-next-line no-console
                console.log(
                    `    ${pc.green(statsTranslated[langId])} translated, ${pc.yellow(statsUntranslated[langId])} remaining`,
                )
            }

            // oxlint-disable-next-line no-console
            console.log('')
        },
    )
    .command(
        'export',
        'Export target translations to i18next format',
        (yargs): typeof yargs =>
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
                }),
        async (argv): Promise<void> => {
            const workspace = new Workspace()
            await workspace.init(
                {
                    source_file: path.resolve(argv.workspace as string),
                },
                false,
            )

            const outputPath = argv.output as string
            const outputDir = path.dirname(path.resolve(outputPath))
            const outputBase = path.basename(outputPath, path.extname(outputPath))
            const outputExt = path.extname(outputPath) || '.json'

            await fs.mkdirp(outputDir)

            const languagesToExport = argv.language
                ? workspace.config.languages.target.filter((lang): boolean => lang.id === argv.language)
                : workspace.config.languages.target

            if (argv.language && languagesToExport.length === 0) {
                logger.error(`language '${argv.language}' not found in workspace`)
                process.exit(1)
            }

            if (argv.split) {
                // Export each language to a separate file
                // eslint-disable-next-line no-await-in-loop
                for (const language of languagesToExport) {
                    const outputFile = path.join(outputDir, `${outputBase}.${language.id}${outputExt}`)
                    const translations = i18nFormat(workspace.i18n, [language])
                    const langWithName = language as typeof language & {name: string}

                    // eslint-disable-next-line no-await-in-loop
                    await fs.writeFile(outputFile, JSON.stringify(translations, null, 2), 'utf8')
                    logger.info(`exported ${langWithName.name} to: ${outputFile}`)
                }
            } else {
                // Export all languages to a single file
                const bundleTarget = path.resolve(outputDir, `${outputBase}${outputExt}`)
                const translations = i18nFormat(workspace.i18n, languagesToExport)

                await fs.writeFile(bundleTarget, JSON.stringify(translations, null, 2), 'utf8')
                logger.info(`exported to: ${bundleTarget}`)
            }

            logger.info('export complete!')
        },
    )
    .command(
        'lint',
        'Lint translations',
        (yargs): typeof yargs =>
            yargs.option('workspace', {
                alias: 'w',
                default: './src/.expressio.json',
                describe: 'Workspace file to use',
                type: 'string',
            }),
        async (argv): Promise<void> => {
            const workspace = new Workspace()
            await workspace.init(
                {
                    source_file: path.resolve(argv.workspace as string),
                },
                false,
            )

            const lintResult = await lintWorkspace(
                workspace as {
                    config: {languages: {target: {id: string}[]}; source_file: string; sync: {dir: string; suggestions?: boolean}}
                    i18n: Record<string, unknown>
                },
                'lint',
            )

            if (lintResult) {
                const typedLintResult = lintResult as {
                    create_tags: {file: string; groups: {line: number; column: number; match: string[]}[]}[]
                    delete_tags: {group: string; tags: {path: string[]}[]}[]
                }
                const maxPadding =
                    Math.max(
                        ...typedLintResult.create_tags.map((fileGroup): number =>
                            Math.max(...fileGroup.groups.map((tag): number => `${tag.line}:${tag.column}`.length)),
                        ),
                    ) + 2

                for (const fileGroup of typedLintResult.create_tags) {
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

                if (typedLintResult.delete_tags.length) {
                    for (const deleteTag of typedLintResult.delete_tags) {
                        // oxlint-disable-next-line no-console
                        console.log(pc.underline(`\n${deleteTag.group}`))
                        for (const tag of deleteTag.tags) {
                            // oxlint-disable-next-line no-console
                            console.log(`  ${pc.red('error')} ${tag.path.join('.')} in workspace, but not found in source code`)
                        }
                    }
                }

                const problems = typedLintResult.create_tags.length + typedLintResult.delete_tags.length
                // oxlint-disable-next-line no-console
                console.log(`\n✖ Found ${problems} issues`)
                process.exit(1)
            }

            // oxlint-disable-next-line no-console
            console.log('\n✔ No issues found')
            process.exit(0)
        },
    )
    .command(
        'start',
        'Start the Expressio service',
        (yargs): typeof yargs => {
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
        },
        async (argv): Promise<void> => {
            await initConfig(config)

            // Initialize database (creates users table)
            // eslint-disable-next-line no-undefined
            const database = initDatabase(undefined, 'expressio', logger)

            // Initialize common service (including UserManager) with database
            // Use environment variable for config path if set (for PR deployments)
            const configPath = process.env.CONFIG_PATH || '~/.expressiorc'
            await service.init({appName: 'expressio', configPath, useBcrypt: false}, database)

            // Initialize enola first
            await enola.init({...config.enola, languages: enola.config.languages} as unknown as EnolaConfig, logger)

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
                fetch: async (req: Request, server: unknown): Promise<Response> => {
                    const url = new URL(req.url)
                    if (url.pathname === '/dev/snapshot') {
                        return Response.json(
                            devContext.snapshot({
                                version: runtime.version,
                                workspace: 'expressio',
                            }),
                        )
                    }
                    const response = await handleRequest(req, server)
                    return response || new Response('Not Found', {status: 404})
                },
                hostname: argv.host as string | undefined,
                port: argv.port as number | undefined,
                websocket: enhancedWebSocketHandler,
            })

            if (BUN_ENV === 'development' && bunchyConfig) {
                await bunchyService(
                    server,
                    bunchyConfig,
                    bunchyManager as {
                        api?: {
                            post?: (
                                path: string,
                                handler: (ctx: unknown, req: {data?: unknown}) => Promise<unknown>,
                                middlewares?: unknown[],
                            ) => void
                        }
                        broadcast: (url: string, data: unknown, method?: string) => void
                    },
                )
            }

            logger.info(`service: http://${argv.host}:${argv.port}`)
        },
    )
    .demandCommand()
    .help('help')
    .showHelpOnFail(true)

// When loaded as a dependency (e.g. by codebrew), don't run our CLI
if (!process.argv[1]?.includes('codebrew')) {
    // eslint-disable-next-line no-void
    void cli.parse()
}

export {enola, logger, runtime, workspaces}
