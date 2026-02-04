import type {EnolaEngine, EnolaEngineConfig, EnolaLogger, EnolaTag, TargetLanguage} from '../types.ts'
import {decode} from 'html-entities'
import {toIso6391} from '../iso-codes.ts'


const ignoreXTagRegex = /<x>[\w]*<\/x>/g
const ignoreITagRegex = /<i>[\w]*<\/i>/g
// The <x> tag is used to label {{placeholders}} as untranslatable for Deepl.
// These are replaced afterwards with the correct i18n format. The <i> tag
// is used to mark text to ignore; it will be stripped from the translation.
const placeholderRegex = /{{[\w]*}}/g

interface FetchOptions extends RequestInit {
    data?: {
        formality?: string
        ignore_tags?: string[]
        source_lang?: string
        tag_handling?: string
        target_lang: string
        text: string[]
    }
    params?: Record<string, string>
}

export default class Deepl implements EnolaEngine {

    config:EnolaEngineConfig = {
        active: false,
        api_key: '',
        base_url: 'https://api-free.deepl.com/v2',
        name: 'deepl',
        usage: {
            count: 0,
            limit: 0,
        },
    }

    logger: EnolaLogger

    async init(engine_config, logger) {
        this.logger = logger

        if (engine_config.api_key) {
            this.activate(engine_config)
        }
    }

    async activate(engine_config) {
        this.config.base_url = engine_config.base_url
        this.config.api_key = engine_config.api_key
        try {
            this.logger.info('[enola-deepl] activating...')
            await this.usage()
        } catch (error) {
            this.logger.error(`Deepl initialization failed (${error})`)
            process.exit(1)
        }
        this.config.active = true
    }

    async deactivate() {
        this.logger.info('[enola-deepl] deactivating...')
        this.config.api_key = ''
        this.config.active = false
    }

    async suggestion(_tagPath: string[], _sourceText: string, _similarTranslations: Array<{path: string[]; source: string}>): Promise<string> {
        throw new Error('Deepl does not support LLM queries for context')
    }

    async fetch(endpoint: string, options: FetchOptions = {}) {
        const url = new URL(`${this.config.base_url}${endpoint}`)
        if (options && options.params) {
            Object.keys(options.params).forEach((key) => url.searchParams.append(key, options.params[key]))
        }

        const headers = {
            Authorization: `DeepL-Auth-Key ${this.config.api_key}`,
            ...(options.method === 'GET' ?  {} : {'Content-Type': 'application/json'}),
            ...options.headers,
        }

        const fetchOptions: RequestInit = {
            headers,
            method: options.method || 'GET',
        }

        if (options.method !== 'GET' && options.data) {
            fetchOptions.body = JSON.stringify(options.data)
        }

        const response = await fetch(url, fetchOptions)

        if (!response.ok) {
            const {message} = await response.json()
            throw new Error(`[enola-deepl] ${response.status}: ${message}`)
        }

        return await response.json()
    }

    prepareSource(tag:EnolaTag) {
        const srcPrepped = tag.source.replaceAll(placeholderRegex, (res) => res.replace('{{', '<x>').replace('}}', '</x>'))
        return srcPrepped
    }

    async translate(tag:EnolaTag, targetLanguage:TargetLanguage) {
        const sourceString = this.prepareSource(tag)
        try {
            const response = await this.fetch('/translate', {
                data: {
                    formality: targetLanguage.formality ? targetLanguage.formality : 'default',
                    ignore_tags: ['i', 'x'],
                    source_lang: 'en',
                    tag_handling: 'xml',
                    target_lang: toIso6391(targetLanguage.id),
                    text: [sourceString],
                },
                method: 'POST',
            })

            const translation = response.translations[0].text
            let preppedTarget = translation
                .replaceAll(ignoreXTagRegex, (res) => res.replace('<x>', '{{').replace('</x>', '}}'))
                .replaceAll(ignoreITagRegex, (res) => res.replace('<i>', '').replace('</i>', ''))

            preppedTarget = decode(preppedTarget)
            this.logger.info(`[enola-deepl] ${toIso6391(targetLanguage.id)}: ${preppedTarget}`)
            return preppedTarget
        } catch (error) {
            this.logger.error(`[enola-deepl] ${error}`)
            return ''
        }
    }

    async translateBatch(batch:EnolaTag[], targetLanguage:TargetLanguage) {
        const sourceStrings = batch.map((tag) => this.prepareSource(tag))
        this.logger.info(`[enola-deepl] Converting ${targetLanguage.id} to ISO 639-1`)
        try {
            const response = await this.fetch('/translate', {
                data: {
                    formality: targetLanguage.formality ? targetLanguage.formality : 'default',
                    ignore_tags: ['i', 'x'],
                    source_lang: 'en',
                    tag_handling: 'xml',
                    target_lang: toIso6391(targetLanguage.id),
                    text: sourceStrings,
                },
                method: 'POST',
            })

            const translations = response.translations.map((translation) => {
                const translatedText = decode(translation.text
                    .replaceAll(ignoreXTagRegex, (res) => res.replace('<x>', '{{').replace('</x>', '}}'))
                    .replaceAll(ignoreITagRegex, (res) => res.replace('<i>', '').replace('</i>', '')),
                )
                this.logger.info(`[enola-deepl] ${targetLanguage.id}: ${translatedText}`)
                return translatedText
            })

            return translations
        } catch (error) {
            this.logger.error(`[enola-deepl] ${targetLanguage.id}: ${error}`)
            return []
        }
    }

    async usage() {
        const usage = await this.fetch('/usage')

        if (usage.character_count) {
            const percentage = (usage.character_count / usage.character_limit) * 100
            this.logger.info(`[enola-deepl] usage: ${usage.character_count} of ${usage.character_limit} characters (${percentage.toFixed(2)}%)`)
        }

        Object.assign(this.config, {
            usage: {
                count: usage.character_count,
                limit: usage.character_limit,
            },
        })

        return this.config.usage
    }
}
