/**
 * Build PluginContext for Codebrew plugins
 * @see ADR-035: Codebrew Plugin Architecture
 */

import type {CodebrewPluginContext} from '@garage44/common/lib/codebrew-registry'

interface CreatePluginContextOptions {
    config: Record<string, unknown>
    database: unknown
    logger: CodebrewPluginContext['logger']
    router: CodebrewPluginContext['router']
}

export function createPluginContext(options: CreatePluginContextOptions): CodebrewPluginContext {
    return {
        config: options.config,
        database: options.database,
        logger: options.logger,
        router: options.router,
    }
}
