#!/usr/bin/env bun
import type {LoggerConfig} from '@garage44/common/types'

import {bunchyArgs, bunchyService} from '@garage44/bunchy'
import {createBunWebSocketHandler} from '@garage44/common/lib/ws-server'
import {
    createRuntime,
    createWebSocketManagers,
    createWelcomeBanner,
    loggerTransports,
    service,
    setupBunchyConfig,
} from '@garage44/common/service'
import path from 'node:path'
import {URL, fileURLToPath} from 'node:url'
import yargs from 'yargs'
import {hideBin} from 'yargs/helpers'

import type {PRMetadata} from './lib/deploy/pr-deploy'

import {config, initConfig} from './lib/config.ts'
import {initDatabase} from './lib/database.ts'
import {initMiddleware} from './lib/middleware.ts'

export const serviceDir = fileURLToPath(new URL('.', import.meta.url))

const runtime = createRuntime(serviceDir, path.join(serviceDir, 'package.json'))

function welcomeBanner(): string {
    return createWelcomeBanner('Nonlinear', 'AI-Powered Automated Project Management', runtime.version)
}

// In case we start in development mode.
let bunchyConfig = null

const logger = loggerTransports(config.logger as LoggerConfig, 'service')
if (import.meta.main) {
    logger.info('initialized')
}

const BUN_ENV = process.env.BUN_ENV || 'production'

const cli = yargs(hideBin(process.argv))
cli.scriptName('nonlinear')

if (BUN_ENV === 'development') {
    bunchyConfig = setupBunchyConfig({
        logPrefix: 'N',
        serviceDir: runtime.service_dir,
        version: runtime.version,
    })

    bunchyArgs(cli as Parameters<typeof bunchyArgs>[0], bunchyConfig)
}

cli.usage('Usage: $0 [task]')
    .detectLocale(false)
    .command(
        'start',
        'Start the Nonlinear service',
        (yargs): typeof yargs => {
            // eslint-disable-line @typescript-eslint/no-floating-promises
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
                    default: 3032,
                    describe: 'port to run the Nonlinear service on',
                    type: 'number',
                })
                .option('autostart', {
                    alias: 'a',
                    describe: 'autostart agents (true to start all enabled, or comma-separated agent IDs)',
                    type: 'string',
                })
        },
        async (argv): Promise<void> => {
            // eslint-disable-line @typescript-eslint/no-floating-promises
            await initConfig(config)

            // Initialize database
            // eslint-disable-next-line no-undefined -- pass undefined to use default db path while providing logger
            const database = initDatabase(undefined, logger)

            /*
             * Initialize common service (including UserManager) with database
             * This will automatically create default admin user if database is empty
             */
            const configPath = process.env.CONFIG_PATH || '~/.nonlinearrc'
            await service.init({appName: 'nonlinear', configPath, useBcrypt: false}, database)

            // Initialize middleware and WebSocket server
            const {handleRequest, sessionMiddleware} = await initMiddleware(bunchyConfig)

            // Create WebSocket managers
            const {bunchyManager, wsManager} = createWebSocketManagers(null, sessionMiddleware)

            // Map of endpoint to manager for the handler
            const wsManagers = new Map([
                ['/ws', wsManager],
                ['/bunchy', bunchyManager],
            ])

            const enhancedWebSocketHandler = createBunWebSocketHandler(wsManagers)

            // Register WebSocket API routes
            const {registerTicketsWebSocketApiRoutes} = await import('./api/tickets.ts')
            const {registerRepositoriesWebSocketApiRoutes} = await import('./api/repositories.ts')
            const {registerAgentsWebSocketApiRoutes} = await import('./api/agents.ts')
            const {registerCIWebSocketApiRoutes} = await import('./api/ci.ts')
            const {registerLabelsWebSocketApiRoutes} = await import('./api/labels.ts')
            const {registerDocsWebSocketApiRoutes} = await import('./api/docs.ts')
            const {registerDeployWebSocketApiRoutes} = await import('./api/deploy.ts')

            registerTicketsWebSocketApiRoutes(wsManager)
            registerRepositoriesWebSocketApiRoutes(wsManager)
            registerAgentsWebSocketApiRoutes(wsManager)
            registerCIWebSocketApiRoutes(wsManager)
            registerLabelsWebSocketApiRoutes(wsManager)
            registerDocsWebSocketApiRoutes(wsManager)
            registerDeployWebSocketApiRoutes(wsManager)

            // Initialize agent system
            const {initAgentStatusTracking} = await import('./lib/agent/status.ts')
            const {initAgentStateTracking} = await import('./lib/agent/state.ts')
            const {initAgentScheduler: _initAgentScheduler} = await import('./lib/agent/scheduler.ts')
            const {initAgentAvatars} = await import('./lib/agent/avatars.ts')
            const {initTokenUsageTracking} = await import('./lib/agent/token-usage.ts')
            const {initAgentCommentBroadcasting} = await import('./lib/agent/comments.ts')
            const {initAgentTicketUpdateBroadcasting} = await import('./lib/agent/ticket-updates.ts')

            initAgentStatusTracking(wsManager)
            initAgentStateTracking(wsManager)
            initAgentAvatars()
            initTokenUsageTracking(wsManager)
            initAgentCommentBroadcasting(wsManager)
            initAgentTicketUpdateBroadcasting(wsManager)

            // Start Bun server
            const server = Bun.serve({
                fetch: async (req: Request, srv: unknown): Promise<Response> => {
                    const res = await handleRequest(req, srv)
                    return res ?? new Response('Not Found', {status: 404})
                },
                hostname: argv.host as string,
                port: argv.port as number,
                websocket: enhancedWebSocketHandler,
            })

            if (BUN_ENV === 'development' && bunchyConfig) {
                await bunchyService(server, bunchyConfig, bunchyManager as Parameters<typeof bunchyService>[2])
            }

            logger.info(`nonlinear service started on http://${argv.host}:${argv.port}`)

            // Autostart agents if configured (command-line option takes precedence)
            const {autostartAgents} = await import('./api/agents.ts')
            // eslint-disable-next-line init-declarations -- set in conditional below
            let autostartValue: boolean | string[] | undefined
            const autostartOpt = argv.autostart
            if ('autostart' in argv && autostartOpt !== null) {
                if (autostartOpt === 'true' || autostartOpt === '1') {
                    autostartValue = true
                } else if (autostartOpt === 'false' || autostartOpt === '0') {
                    autostartValue = false
                } else if (typeof autostartOpt === 'string') {
                    autostartValue = autostartOpt
                        .split(',')
                        .map((id: string): string => id.trim())
                        .filter((id: string): boolean => id.length > 0)
                }
            }
            await autostartAgents(wsManager, autostartValue)
        },
    )
    .command(
        'deploy-pr',
        'Deploy a PR branch manually (for Cursor agent)',
        (yargs): typeof yargs =>
            yargs
                .option('number', {
                    demandOption: true,
                    describe: 'PR number to deploy',
                    type: 'number',
                })
                .option('branch', {
                    demandOption: true,
                    describe: 'Branch name (e.g., feature/new-ui)',
                    type: 'string',
                })
                .option('sha', {
                    describe: 'Commit SHA (defaults to latest)',
                    type: 'string',
                })
                .option('author', {
                    default: 'local',
                    describe: 'Author name',
                    type: 'string',
                }),
        async (argv): Promise<void> => {
            const {deployPR} = await import('./lib/deploy/pr-deploy')

            const pr: PRMetadata = {
                author: argv.author as string,
                head_ref: argv.branch as string,
                head_sha: (argv.sha as string) ?? '',
                is_fork: false,
                number: argv.number as number,
                repo_full_name: 'garage44/garage44',
            }

            const result = await deployPR(pr)

            if (result.success && result.deployment) {
                // eslint-disable-next-line no-console
                console.log('\n✅ PR Deployment Successful!\n')

                const {extractWorkspacePackages, isApplicationPackage} = await import('./lib/deploy/workspace')
                const repoDir = `${result.deployment.directory}/repo`
                const {existsSync} = await import('node:fs')
                let packagesToShow: string[] = []

                if (existsSync(repoDir)) {
                    const allPackages = extractWorkspacePackages(repoDir)
                    const appPackages = allPackages.filter((pkg): boolean => isApplicationPackage(pkg))
                    packagesToShow = [...appPackages, 'nonlinear']
                } else {
                    packagesToShow = ['expressio', 'pyrite', 'nonlinear']
                }

                // eslint-disable-next-line no-console
                console.log('URLs:')
                for (const packageName of packagesToShow) {
                    const port =
                        result.deployment.ports[packageName as keyof typeof result.deployment.ports] ||
                        result.deployment.ports.nonlinear
                    // eslint-disable-next-line no-console
                    console.log(`  ${packageName}: https://pr-${argv.number}-${packageName}.garage44.org (port ${port})`)
                }

                // eslint-disable-next-line no-console
                console.log('\nNote: Deployment is publicly accessible (no token required)')
            } else {
                // eslint-disable-next-line no-console
                console.error(`\n❌ Deployment failed: ${result.message}`)
                process.exit(1)
            }
        },
    )
    .command('list-pr-deployments', 'List all active PR deployments', async (): Promise<void> => {
        const {listPRDeployments} = await import('./lib/deploy/pr-cleanup')
        await listPRDeployments()
    })
    .command(
        'cleanup-pr',
        'Cleanup a specific PR deployment',
        (yargs): typeof yargs =>
            yargs.option('number', {
                demandOption: true,
                describe: 'PR number to cleanup',
                type: 'number',
            }),
        async (argv): Promise<void> => {
            const {cleanupPRDeployment} = await import('./lib/deploy/pr-cleanup')
            const result = await cleanupPRDeployment(argv.number as number)
            // eslint-disable-next-line no-console
            console.log(result.message)
            process.exit(result.success ? 0 : 1)
        },
    )
    .command(
        'cleanup-stale-prs',
        'Cleanup stale PR deployments',
        (yargs): typeof yargs =>
            yargs.option('max-age-days', {
                default: 7,
                describe: 'Maximum age in days',
                type: 'number',
            }),
        async (argv): Promise<void> => {
            const {cleanupStaleDeployments} = await import('./lib/deploy/pr-cleanup')
            const result = await cleanupStaleDeployments(argv.maxAgeDays as number)
            // eslint-disable-next-line no-console
            console.log(result.message)
        },
    )
    .command(
        'regenerate-pr-nginx',
        'Regenerate nginx configs for an existing PR deployment',
        (yargs): typeof yargs =>
            yargs.option('number', {
                demandOption: true,
                describe: 'PR number to regenerate nginx configs for',
                type: 'number',
            }),
        async (argv): Promise<void> => {
            const {regeneratePRNginx} = await import('./lib/deploy/pr-deploy')
            const result = await regeneratePRNginx(argv.number as number)
            // eslint-disable-next-line no-console
            console.log(result.message)
            process.exit(result.success ? 0 : 1)
        },
    )
    .command(
        'generate-systemd',
        'Generate systemd service files',
        (yargs): typeof yargs =>
            yargs.option('domain', {
                demandOption: true,
                describe: 'Domain name (e.g., garage44.org)',
                type: 'string',
            }),
        async (argv): Promise<void> => {
            const {generateSystemd} = await import('./lib/deploy/deploy/systemd')
            const output = await generateSystemd(argv.domain as string)
            // eslint-disable-next-line no-console
            console.log(output)
        },
    )
    .command(
        'generate-nginx',
        'Generate nginx configuration',
        (yargs): typeof yargs =>
            yargs.option('domain', {
                demandOption: true,
                describe: 'Domain name (e.g., garage44.org)',
                type: 'string',
            }),
        async (argv): Promise<void> => {
            const {generateNginx} = await import('./lib/deploy/deploy/nginx')
            const output = generateNginx(argv.domain as string)
            // eslint-disable-next-line no-console
            console.log(output)
        },
    )
    .command('publish', 'Publish all workspace packages to npm', async (): Promise<void> => {
        const {publish} = await import('./lib/deploy/publish')
        await publish()
    })
    .command('init', 'Initialize Cursor rules and AGENTS.md', async (): Promise<void> => {
        const {init} = await import('./lib/deploy/init')
        const {rules} = await import('./lib/deploy/rules')
        await init()
        await rules()
        // eslint-disable-next-line no-console
        console.log('\n✅ Cursor setup complete!')
    })
    .command('rules', 'Create symlink from .cursor/rules to nonlinear/lib/fixtures/rules', async (): Promise<void> => {
        const {rules} = await import('./lib/deploy/rules')
        await rules()
    })
    .command('indexing', 'Start the indexing service (processes indexing jobs)', async (): Promise<void> => {
        await initConfig(config)
        initDatabase()

        const {IndexingService} = await import('./lib/indexing/service.ts')
        const {loggerTransports} = await import('@garage44/common/service')
        const service = new IndexingService()

        // Initialize logger after config is loaded
        const loggerInstance = loggerTransports(
            config.logger as LoggerConfig,
            'service',
            process.env.CODEBREW_PLUGIN_ID,
            process.env.CODEBREW_PLUGIN_COLOR,
        )
        service.setLogger(loggerInstance)

        // Handle graceful shutdown
        process.on('SIGINT', (): void => {
            loggerInstance.info('[idx] received sigint, shutting down...')
            service.stop()
            process.exit(0)
        })

        process.on('SIGTERM', (): void => {
            loggerInstance.info('[idx] received sigterm, shutting down...')
            service.stop()
            process.exit(0)
        })

        service.start()

        /*
         * Keep process alive and log status periodically
         * Log status every minute
         */
        setInterval((): void => {
            const status = service.getStatus()
            loggerInstance.info(
                `[idx] status: ${status.pendingJobs} pending, ` +
                    `${status.processingJobs} processing, ${status.failedJobs} failed`,
            )
        }, 60_000)
    })
    .command(
        'agent',
        'Run an agent interactively',
        (yargs): typeof yargs =>
            yargs
                .option('ticket-id', {
                    alias: 't',
                    describe: 'Ticket ID to work on',
                    type: 'string',
                })
                .option('agent-type', {
                    alias: 'a',
                    default: 'developer',
                    describe: 'Agent type (developer, planner, reviewer)',
                    type: 'string',
                })
                .option('interactive', {
                    alias: 'i',
                    default: true,
                    describe: 'Run in interactive mode with real-time reasoning',
                    type: 'boolean',
                }),
        async (argv): Promise<void> => {
            await initConfig(config)
            await initDatabase()

            const {getAgent} = await import('./lib/agent/index.ts')
            const {formatReasoningMessage, formatToolExecution, formatToolResult, runAgentInteractive} =
                await import('./lib/cli/interactive.ts')

            const agentType = argv.agentType as 'developer' | 'planner' | 'reviewer'
            const agent = getAgent(agentType)

            if (!agent) {
                // eslint-disable-next-line no-console
                console.error(`❌ Agent type not found: ${agentType}`)
                process.exit(1)
            }

            const context: Record<string, unknown> = {}
            if (argv.ticketId) {
                context.ticketId = argv.ticketId
            }

            if (argv.interactive) {
                // eslint-disable-next-line no-console
                console.log(`\n🚀 Starting ${agentType} agent interactively...\n`)

                await runAgentInteractive({
                    agent,
                    context,
                    onReasoning: (message): void => {
                        process.stdout.write(formatReasoningMessage(message))
                    },
                    onToolExecution: (toolName: string, params: unknown): void => {
                        process.stdout.write(formatToolExecution(toolName, params as Record<string, unknown>))
                    },
                    onToolResult: (toolName: string, result: {success: boolean; error?: unknown}): void => {
                        process.stdout.write(formatToolResult(toolName, result.success, result.error as string | undefined))
                    },
                })
            } else {
                // Non-interactive mode
                const result = await agent.process(context)
                if (result.success) {
                    // eslint-disable-next-line no-console
                    console.log(`✅ Agent completed: ${result.message}`)
                } else {
                    // eslint-disable-next-line no-console
                    console.error(`❌ Agent failed: ${result.error || result.message}`)
                    process.exit(1)
                }
            }
        },
    )
    .command(
        'agent:service',
        'Run an agent as background service',
        (yargs): typeof yargs =>
            yargs.option('agent-id', {
                alias: 'a',
                demandOption: true,
                describe: 'Agent ID from database',
                type: 'string',
            }),
        async (argv): Promise<void> => {
            await initConfig(config)
            initDatabase()

            const {AgentService} = await import('./lib/agent/service.ts')
            const agentId = argv.agentId as string
            const {loggerTransports} = await import('@garage44/common/service')
            const service = new AgentService(agentId)

            // Initialize logger after config is loaded
            const loggerInstance = loggerTransports(config.logger as LoggerConfig, 'service')
            service.setLogger(loggerInstance)

            // Handle graceful shutdown
            process.on('SIGINT', (): void => {
                loggerInstance.info(`[agent] received sigint, shutting down agent ${agentId}...`)
                service.stop()
                process.exit(0)
            })

            process.on('SIGTERM', (): void => {
                loggerInstance.info(`[agent] received sigterm, shutting down agent ${agentId}...`)
                service.stop()
                process.exit(0)
            })

            service.start()

            // Keep process alive and log status periodically
            setInterval((): void => {
                // Log status every minute
                const status = service.getStatus()
                loggerInstance.info(`[agent] status: ${JSON.stringify(status)}`)
            }, 60_000)
        },
    )
    .command(
        'agent:run',
        'Run an agent interactively in foreground',
        (yargs): typeof yargs =>
            yargs
                .option('agent-id', {
                    alias: 'a',
                    demandOption: true,
                    describe: 'Agent ID from database',
                    type: 'string',
                })
                .option('interactive', {
                    alias: 'i',
                    default: true,
                    describe: 'Run in interactive REPL mode (default: true)',
                    type: 'boolean',
                })
                .option('instruction', {
                    describe: 'Single instruction to execute (non-interactive mode)',
                    type: 'string',
                })
                .option('ticket-id', {
                    alias: 't',
                    describe: 'Ticket ID to work on',
                    type: 'string',
                }),
        async (argv): Promise<void> => {
            await initConfig(config)
            initDatabase()

            const {getAgentById} = await import('./lib/agent/index.ts')
            const {runAgentInteractive, runAgentOneShot} = await import('./lib/cli/interactive.ts')
            const {runAgent} = await import('./lib/agent/scheduler.ts')

            const agentId = argv.agentId as string
            const agent = getAgentById(agentId)

            if (!agent) {
                // eslint-disable-next-line no-console
                console.error(`❌ Agent not found: ${argv.agentId}`)
                process.exit(1)
            }

            const context: Record<string, unknown> = {}
            const ticketId = argv.ticketId as string | undefined
            if (ticketId) {
                context.ticketId = ticketId
            }

            if (argv.interactive) {
                // REPL mode - starts idle, waits for instructions
                await runAgentInteractive({
                    agent,
                    context,
                })
            } else if (argv.instruction) {
                // One-shot mode - execute single instruction
                const response = await runAgentOneShot(agent, argv.instruction as string, context)
                process.exit(response.success ? 0 : 1)
            } else {
                // Legacy mode - run agent.process() once
                await runAgent(agentId, context)
            }
        },
    )
    .command('agent:list', 'List all available agents', async (): Promise<void> => {
        await initConfig(config)
        await initDatabase()

        const {getDb} = await import('./lib/database.ts')
        const agents = getDb().prepare('SELECT * FROM agents ORDER BY type, name').all() as {
            enabled: number
            id: string
            name: string
            type: string
        }[]

        // eslint-disable-next-line no-console
        console.log('\n📋 Available Agents:\n')
        for (const agent of agents) {
            const status = agent.enabled ? '✅ Enabled' : '❌ Disabled'
            // eslint-disable-next-line no-console
            console.log(`  ${agent.name} (${agent.type})`)
            // eslint-disable-next-line no-console
            console.log(`    ID: ${agent.id}`)
            // eslint-disable-next-line no-console
            console.log(`    Status: ${status}\n`)
        }
    })
    .command(
        'agent:trigger',
        'Trigger an agent to process work',
        (yargs): typeof yargs =>
            yargs
                .option('agent-id', {
                    alias: 'a',
                    demandOption: true,
                    describe: 'Agent ID or name (case-insensitive)',
                    type: 'string',
                })
                .option('ticket-id', {
                    alias: 't',
                    describe: 'Ticket ID (optional)',
                    type: 'string',
                })
                .option('interactive', {
                    alias: 'i',
                    default: false,
                    describe: 'Run in interactive mode with real-time reasoning (like Claude Code)',
                    type: 'boolean',
                }),
        async (argv): Promise<void> => {
            await initConfig(config)
            await initDatabase()

            const {getDb} = await import('./lib/database.ts')
            const agentIdArg = argv.agentId as string
            // Try to find agent by ID first, then by name (case-insensitive)
            const agent = getDb()
                .prepare(`
            SELECT * FROM agents
            WHERE id = ? OR LOWER(name) = LOWER(?)
        `)
                .get(agentIdArg, agentIdArg) as
                | {
                      enabled: number
                      id: string
                      name: string
                      type: 'planner' | 'developer' | 'reviewer'
                  }
                | undefined

            if (!agent) {
                // eslint-disable-next-line no-console
                console.error(`❌ Agent not found: ${argv.agentId}`)
                process.exit(1)
            }

            if (!agent.enabled) {
                // eslint-disable-next-line no-console
                console.error(`❌ Agent is disabled: ${agent.name}`)
                process.exit(1)
            }

            const {getAgent} = await import('./lib/agent/index.ts')
            const agentInstance = getAgent(agent.type)

            if (!agentInstance) {
                // eslint-disable-next-line no-console
                console.error(`❌ Agent instance not found: ${agent.type}`)
                process.exit(1)
            }

            const context: Record<string, unknown> = {}
            const ticketIdArg = argv.ticketId as string | undefined
            if (ticketIdArg) {
                context.ticketId = ticketIdArg
            }

            if (argv.interactive) {
                // Interactive mode with real-time reasoning display
                const {formatReasoningMessage, formatToolExecution, formatToolResult, runAgentInteractive} =
                    await import('./lib/cli/interactive.ts')

                // eslint-disable-next-line no-console
                console.log(`\n🚀 Starting ${agent.name} (${agent.type}) agent interactively...\n`)

                await runAgentInteractive({
                    agent: agentInstance,
                    context,
                    onReasoning: (message): void => {
                        process.stdout.write(formatReasoningMessage(message))
                    },
                    onToolExecution: (toolName: string, params: unknown): void => {
                        process.stdout.write(formatToolExecution(toolName, params as Record<string, unknown>))
                    },
                    onToolResult: (toolName: string, result: {success: boolean; error?: unknown}): void => {
                        process.stdout.write(formatToolResult(toolName, result.success, result.error as string | undefined))
                    },
                })
            } else {
                // Non-interactive mode
                // eslint-disable-next-line no-console
                console.log(`\n🚀 Triggering agent: ${agent.name} (${agent.type})\n`)
                const result = await agentInstance.process(context)

                if (result.success) {
                    // eslint-disable-next-line no-console
                    console.log(`✅ Agent completed: ${result.message}`)
                } else {
                    // eslint-disable-next-line no-console
                    console.error(`❌ Agent failed: ${result.error || result.message}`)
                    process.exit(1)
                }
            }
        },
    )
    .demandCommand()
    .help('help')
    .showHelpOnFail(true)

// When loaded as a dependency (e.g. by codebrew), don't run our CLI
if (!process.argv[1]?.includes('codebrew')) {
    cli.parse()
}

export {logger, runtime, service}
