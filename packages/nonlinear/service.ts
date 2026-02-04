#!/usr/bin/env bun
import {URL, fileURLToPath} from 'node:url'
import {createBunWebSocketHandler} from '@garage44/common/lib/ws-server'
import {bunchyArgs, bunchyService} from '@garage44/bunchy'
import {
    createRuntime,
    createWelcomeBanner,
    setupBunchyConfig,
    createWebSocketManagers,
    service,
    loggerTransports,
} from '@garage44/common/service'
import {hideBin} from 'yargs/helpers'
import path from 'node:path'
import yargs from 'yargs'
import {initDatabase} from './lib/database.ts'
import {initMiddleware} from './lib/middleware.ts'
import {config, initConfig} from './lib/config.ts'

export const serviceDir = fileURLToPath(new URL('.', import.meta.url))

const runtime = createRuntime(serviceDir, path.join(serviceDir, 'package.json'))

function welcomeBanner() {
    return createWelcomeBanner('Nonlinear', 'AI-Powered Automated Project Management', runtime.version)
}

// In case we start in development mode.
let bunchyConfig = null

const logger = loggerTransports(config.logger, 'service')

const BUN_ENV = process.env.BUN_ENV || 'production'

const cli = yargs(hideBin(process.argv))
cli.scriptName('nonlinear')

if (BUN_ENV === 'development') {
    bunchyConfig = setupBunchyConfig({
        logPrefix: 'N',
        serviceDir: runtime.service_dir,
        version: runtime.version,
    })

    bunchyArgs(cli, bunchyConfig)
}

void cli.usage('Usage: $0 [task]')
    .detectLocale(false)
    .command('start', 'Start the Nonlinear service', (yargs) => {
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
    }, async(argv) => {
        await initConfig(config)

        // Initialize database
        const database = initDatabase()

        /*
         * Initialize common service (including UserManager) with database
         * This will automatically create default admin user if database is empty
         */
        const configPath = process.env.CONFIG_PATH || '~/.nonlinearrc'
        await service.init({appName: 'nonlinear', configPath, useBcrypt: false}, database)

        // Initialize middleware and WebSocket server
        const {handleRequest, sessionMiddleware} = await initMiddleware(bunchyConfig)

        // Create WebSocket managers
        const {bunchyManager, wsManager} = createWebSocketManagers(undefined, sessionMiddleware)

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
        const {initAgentScheduler} = await import('./lib/agent/scheduler.ts')
        const {initAgentAvatars} = await import('./lib/agent/avatars.ts')
        const {initTokenUsageTracking} = await import('./lib/agent/token-usage.ts')
        const {initAgentCommentBroadcasting} = await import('./lib/agent/comments.ts')
        const {initAgentTicketUpdateBroadcasting} = await import('./lib/agent/ticket-updates.ts')

        initAgentStatusTracking(wsManager)
        initAgentAvatars()
        initTokenUsageTracking(wsManager)
        initAgentCommentBroadcasting(wsManager)
        initAgentTicketUpdateBroadcasting(wsManager)
        await initAgentScheduler()

        // Start Bun server
        const server = Bun.serve({
            fetch: (req, server) => {
                return handleRequest(req, server)
            },
            hostname: argv.host,
            port: argv.port,
            websocket: enhancedWebSocketHandler,
        })

        if (BUN_ENV === 'development') {
            await bunchyService(server, bunchyConfig, bunchyManager)
        }

        logger.info(`Nonlinear service started on http://${argv.host}:${argv.port}`)
    })
    .command('deploy-pr', 'Deploy a PR branch manually (for Cursor agent)', (yargs) =>
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
            })
    , async (argv) => {
        const {deployPR} = await import('./lib/deploy/pr-deploy')

        const pr = {
            author: argv.author,
            head_ref: argv.branch,
            head_sha: argv.sha || undefined,
            is_fork: false,
            number: argv.number,
            repo_full_name: 'garage44/garage44',
        }

        const result = await deployPR(pr)

        if (result.success && result.deployment) {
            console.log('\n✅ PR Deployment Successful!\n')

            const {extractWorkspacePackages, isApplicationPackage} = await import('./lib/deploy/workspace')
            const repoDir = `${result.deployment.directory}/repo`
            const {existsSync} = await import('fs')
            let packagesToShow: string[] = []

            if (existsSync(repoDir)) {
                const allPackages = extractWorkspacePackages(repoDir)
                const appPackages = allPackages.filter((pkg) => isApplicationPackage(pkg))
                packagesToShow = [...appPackages, 'nonlinear']
            } else {
                packagesToShow = ['expressio', 'pyrite', 'nonlinear']
            }

            console.log(`URLs:`)
            for (const packageName of packagesToShow) {
                const port = result.deployment.ports[packageName as keyof typeof result.deployment.ports] || result.deployment.ports.nonlinear
                console.log(`  ${packageName}: https://pr-${argv.number}-${packageName}.garage44.org (port ${port})`)
            }

            console.log(`\nNote: Deployment is publicly accessible (no token required)`)
        } else {
            console.error(`\n❌ Deployment failed: ${result.message}`)
            process.exit(1)
        }
    })
    .command('list-pr-deployments', 'List all active PR deployments', async () => {
        const {listPRDeployments} = await import('./lib/deploy/pr-cleanup')
        await listPRDeployments()
    })
    .command('cleanup-pr', 'Cleanup a specific PR deployment', (yargs) =>
        yargs.option('number', {
            demandOption: true,
            describe: 'PR number to cleanup',
            type: 'number',
        })
    , async (argv) => {
        const {cleanupPRDeployment} = await import('./lib/deploy/pr-cleanup')
        const result = await cleanupPRDeployment(argv.number)
        console.log(result.message)
        process.exit(result.success ? 0 : 1)
    })
    .command('cleanup-stale-prs', 'Cleanup stale PR deployments', (yargs) =>
        yargs.option('max-age-days', {
            default: 7,
            describe: 'Maximum age in days',
            type: 'number',
        })
    , async (argv) => {
        const {cleanupStaleDeployments} = await import('./lib/deploy/pr-cleanup')
        const result = await cleanupStaleDeployments(argv.maxAgeDays)
        console.log(result.message)
    })
    .command('regenerate-pr-nginx', 'Regenerate nginx configs for an existing PR deployment', (yargs) =>
        yargs.option('number', {
            demandOption: true,
            describe: 'PR number to regenerate nginx configs for',
            type: 'number',
        })
    , async (argv) => {
        const {regeneratePRNginx} = await import('./lib/deploy/pr-deploy')
        const result = await regeneratePRNginx(argv.number)
        console.log(result.message)
        process.exit(result.success ? 0 : 1)
    })
    .command('generate-systemd', 'Generate systemd service files', (yargs) =>
        yargs
            .option('domain', {
                demandOption: true,
                describe: 'Domain name (e.g., garage44.org)',
                type: 'string',
            })
    , async (argv) => {
        const {generateSystemd} = await import('./lib/deploy/deploy/systemd')
        const output = await generateSystemd(argv.domain)
        console.log(output)
    })
    .command('generate-nginx', 'Generate nginx configuration', (yargs) =>
        yargs
            .option('domain', {
                demandOption: true,
                describe: 'Domain name (e.g., garage44.org)',
                type: 'string',
            })
    , async (argv) => {
        const {generateNginx} = await import('./lib/deploy/deploy/nginx')
        const output = generateNginx(argv.domain)
        console.log(output)
    })
    .command('publish', 'Publish all workspace packages to npm', async () => {
        const {publish} = await import('./lib/deploy/publish')
        await publish()
    })
    .command('init', 'Initialize Cursor rules and AGENTS.md', async () => {
        const {init} = await import('./lib/deploy/init')
        const {rules} = await import('./lib/deploy/rules')
        await init()
        await rules()
        console.log('\n✅ Cursor setup complete!')
    })
    .command('rules', 'Create symlink from .cursor/rules to nonlinear/lib/fixtures/rules', async () => {
        const {rules} = await import('./lib/deploy/rules')
        await rules()
    })
    .command('indexing', 'Start the indexing service (processes indexing jobs)', async () => {
        await initConfig(config)
        initDatabase()

        const {IndexingService} = await import('./lib/indexing/service.ts')
        const {loggerTransports} = await import('@garage44/common/service')
        const service = new IndexingService()

        // Initialize logger after config is loaded
        const loggerInstance = loggerTransports(config.logger, 'service')
        service.setLogger(loggerInstance)

        // Handle graceful shutdown
        process.on('SIGINT', () => {
            loggerInstance.info('[IndexingService] Received SIGINT, shutting down...')
            service.stop()
            process.exit(0)
        })

        process.on('SIGTERM', () => {
            loggerInstance.info('[IndexingService] Received SIGTERM, shutting down...')
            service.stop()
            process.exit(0)
        })

        service.start()

        // Keep process alive and log status periodically
        setInterval(() => {
            const status = service.getStatus()
            loggerInstance.info(`[IndexingService] Status: ${status.pendingJobs} pending, ${status.processingJobs} processing, ${status.failedJobs} failed`)
        }, 60000) // Log status every minute
    })
    .command('agent', 'Run an agent interactively', (yargs) =>
        yargs
            .option('ticket-id', {
                alias: 't',
                describe: 'Ticket ID to work on',
                type: 'string',
            })
            .option('agent-type', {
                alias: 'a',
                describe: 'Agent type (developer, prioritizer, reviewer)',
                type: 'string',
                default: 'developer',
            })
            .option('interactive', {
                alias: 'i',
                describe: 'Run in interactive mode with real-time reasoning',
                type: 'boolean',
                default: true,
            })
    , async (argv) => {
        await initConfig(config)
        await initDatabase()

        const {getAgent} = await import('./lib/agent/index.ts')
        const {runAgentInteractive, formatReasoningMessage, formatToolExecution, formatToolResult} = await import('./lib/cli/interactive.ts')

        const agentType = argv.agentType as 'developer' | 'prioritizer' | 'reviewer'
        const agent = getAgent(agentType)

        if (!agent) {
            console.error(`❌ Agent type not found: ${agentType}`)
            process.exit(1)
        }

        const context: Record<string, unknown> = {}
        if (argv.ticketId) {
            context.ticketId = argv.ticketId
        }

        if (argv.interactive) {
            console.log(`\n🚀 Starting ${agentType} agent interactively...\n`)

            await runAgentInteractive({
                agent,
                context,
                onReasoning: (message) => {
                    process.stdout.write(formatReasoningMessage(message))
                },
                onToolExecution: (toolName, params) => {
                    process.stdout.write(formatToolExecution(toolName, params))
                },
                onToolResult: (toolName, result) => {
                    process.stdout.write(formatToolResult(toolName, result.success, result.error))
                },
            })
        } else {
            // Non-interactive mode
            const result = await agent.process(context)
            if (result.success) {
                console.log(`✅ Agent completed: ${result.message}`)
            } else {
                console.error(`❌ Agent failed: ${result.error || result.message}`)
                process.exit(1)
            }
        }
    })
    .command('agent:list', 'List all available agents', async () => {
        await initConfig(config)
        await initDatabase()

        const {db} = await import('./lib/database.ts')
        const agents = db.prepare('SELECT * FROM agents ORDER BY type, name').all() as Array<{
            id: string
            name: string
            type: string
            enabled: number
        }>

        console.log('\n📋 Available Agents:\n')
        for (const agent of agents) {
            const status = agent.enabled ? '✅ Enabled' : '❌ Disabled'
            console.log(`  ${agent.name} (${agent.type}) - ${status}`)
        }
        console.log()
    })
    .command('agent:trigger', 'Trigger an agent to process work', (yargs) =>
        yargs
            .option('agent-id', {
                alias: 'a',
                describe: 'Agent ID',
                type: 'string',
                demandOption: true,
            })
            .option('ticket-id', {
                alias: 't',
                describe: 'Ticket ID (optional)',
                type: 'string',
            })
    , async (argv) => {
        await initConfig(config)
        await initDatabase()

        const {db} = await import('./lib/database.ts')
        const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(argv.agentId) as {
            id: string
            name: string
            type: 'prioritizer' | 'developer' | 'reviewer'
            enabled: number
        } | undefined

        if (!agent) {
            console.error(`❌ Agent not found: ${argv.agentId}`)
            process.exit(1)
        }

        if (!agent.enabled) {
            console.error(`❌ Agent is disabled: ${agent.name}`)
            process.exit(1)
        }

        const {getAgent} = await import('./lib/agent/index.ts')
        const agentInstance = getAgent(agent.type)

        if (!agentInstance) {
            console.error(`❌ Agent instance not found: ${agent.type}`)
            process.exit(1)
        }

        const context: Record<string, unknown> = {}
        if (argv.ticketId) {
            context.ticketId = argv.ticketId
        }

        console.log(`\n🚀 Triggering agent: ${agent.name} (${agent.type})\n`)
        const result = await agentInstance.process(context)

        if (result.success) {
            console.log(`✅ Agent completed: ${result.message}`)
        } else {
            console.error(`❌ Agent failed: ${result.error || result.message}`)
            process.exit(1)
        }
    })
    .demandCommand()
    .help('help')
    .showHelpOnFail(true)
    .parse()

export {
    logger,
    runtime,
}
