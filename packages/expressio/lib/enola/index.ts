import type {EnolaConfig, EnolaEngine, EnolaLogger, EnolaTag, TargetLanguage} from './types.ts'
import {copyObject, keyMod} from '@garage44/common/lib/utils.ts'
import {source, target} from './languages.ts'
import Anthropic from './engines/anthropic.ts'
import Deepl from './engines/deepl.ts'

/**
 * Enola is a wrapper around translation services like Deepl and Claude;
 * exposing a common interface for translation software like Expressio to use.
 */
export class Enola {

    config:EnolaConfig = {
        engines:{},
        languages: {
            source,
            target: target.map((lang) => ({
                formality: Array.isArray(lang.formality) && lang.formality.length > 0,
                id: lang.id,
                name: lang.name,
            })),
        },
    }

    engines: Record<string, EnolaEngine> = {}

    logger: EnolaLogger

    serviceKeyException = new Error('API translator key required for auto-translate')

    async init(enolaConfig, logger) {
        this.logger = logger
        const available_services = {
            anthropic: Anthropic,
            deepl: Deepl,
        }

        for (const [engine, options] of Object.entries(enolaConfig.engines)) {
            this.engines[engine] = new available_services[engine]()
            await this.engines[engine].init(options as {api_key: string; base_url: string}, this.logger)
            this.config.engines[engine] = this.engines[engine].config
        }
    }

    getConfig(admin = false) {
        const engines = copyObject(this.config.engines)
        // Make sure not to expose API keys to non-admin users.
        Object.values(engines).forEach((engine) => {
            if (!admin) {
                delete engine.api_key
                delete engine.base_url
            }
        })

        return {
            engines,
            languages: this.config.languages,
        }
    }

    async suggestion(engine, i18n, tagPath, sourceText) {
        // Gather example translations only from the same group
        const parentPath = tagPath.slice(0, -1)
        const parentGroup = parentPath.join('.')
        const similarTranslations = []
        keyMod(i18n, (ref, _id, refPath) => {
            const refGroup = refPath.slice(0, -1).join('.')
            if (ref &&
                'source' in ref &&
                !ref._redundant &&
                !ref._soft &&
                refGroup === parentGroup) {
                similarTranslations.push({
                    path: refPath,
                    source: ref.source,
                })
            }
        })
        const engineInstance = this.engines[engine]
        if (engineInstance.suggestion) {
            return await engineInstance.suggestion(tagPath, sourceText, similarTranslations)
        }
        throw new Error(`Engine ${engine} does not support suggestions`)
    }

    async translate(engine, tag:EnolaTag, targetLanguage:TargetLanguage) {
        return await this.engines[engine].translate(tag, targetLanguage)
    }

    async translateBatch(engine, tags:EnolaTag[], targetLanguage:TargetLanguage) {
        return await this.engines[engine].translateBatch(tags, targetLanguage)
    }

    async usage(engine) {
        return await this.engines[engine].usage()
    }
}
