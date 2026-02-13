import type {EnolaConfig, EnolaEngine, EnolaEngineConfig, EnolaLogger, EnolaTag, TargetLanguage} from './types.ts'
import {copyObject, keyMod} from '@garage44/common/lib/utils.ts'
import {source, target} from './languages.ts'
import Anthropic from './engines/anthropic.ts'
import Deepl from './engines/deepl.ts'

/**
 * Enola is a wrapper around translation services like Deepl and Claude;
 * exposing a common interface for translation software like Expressio to use.
 */
export class Enola {
    config: EnolaConfig = {
        engines: {},
        languages: {
            source,
            target: target.map((lang): {formality: boolean; id: string; name: string} => ({
                formality: Array.isArray(lang.formality) && lang.formality.length > 0,
                id: lang.id,
                name: lang.name,
            })),
        },
    }

    engines: Record<string, EnolaEngine> = {}

    logger: EnolaLogger

    serviceKeyException = new Error('API translator key required for auto-translate')

    async init(enolaConfig: EnolaConfig, logger: EnolaLogger): Promise<void> {
        this.logger = logger
        const available_services: Record<string, new() => EnolaEngine> = {
            anthropic: Anthropic,
            deepl: Deepl,
        }

        const initPromises = Object.entries(enolaConfig.engines).map(async([engine, options]): Promise<void> => {
            this.engines[engine] = new available_services[engine]()
            await this.engines[engine].init(options as {api_key: string; base_url: string}, this.logger)
            this.config.engines[engine] = this.engines[engine].config
        })
        await Promise.all(initPromises)
    }

    getConfig(admin = false): {engines: Record<string, EnolaEngineConfig>; languages: EnolaConfig['languages']} {
        const engines = copyObject(this.config.engines)
        // Make sure not to expose API keys to non-admin users.
        for (const engine of Object.values(engines)) {
            if (!admin) {
                delete engine.api_key
                delete engine.base_url
            }
        }

        return {
            engines,
            languages: this.config.languages,
        }
    }

    async suggestion(engine: string, i18n: Record<string, unknown>, tagPath: string[], sourceText: string): Promise<string> {
        // Gather example translations only from the same group
        const parentPath = tagPath.slice(0, -1)
        const parentGroup = parentPath.join('.')
        const similarTranslations: {path: string[]; source: string}[] = []
        keyMod(i18n, (ref: unknown, _id: string, refPath: string[]): void => {
            const refGroup = refPath.slice(0, -1).join('.')
            if (ref &&
                typeof ref === 'object' &&
                ref !== null &&
                'source' in ref &&
                typeof (ref as Record<string, unknown>)._redundant !== 'boolean' &&
                typeof (ref as Record<string, unknown>)._soft !== 'boolean' &&
                refGroup === parentGroup) {
                const refRecord = ref as Record<string, unknown>
                if (typeof refRecord.source === 'string') {
                    similarTranslations.push({
                        path: refPath,
                        source: refRecord.source,
                    })
                }
            }
        })
        const engineInstance = this.engines[engine]
        if (engineInstance.suggestion) {
            return await engineInstance.suggestion(tagPath, sourceText, similarTranslations)
        }
        throw new Error(`Engine ${engine} does not support suggestions`)
    }

    async translate(engine: string, tag: EnolaTag, targetLanguage: TargetLanguage): Promise<string> {
        return await this.engines[engine].translate(tag, targetLanguage)
    }

    async translateBatch(engine: string, tags: EnolaTag[], targetLanguage: TargetLanguage): Promise<string[]> {
        return await this.engines[engine].translateBatch(tags, targetLanguage)
    }

    async usage(engine: string): Promise<{count: number; limit: number}> {
        return await this.engines[engine].usage()
    }
}
