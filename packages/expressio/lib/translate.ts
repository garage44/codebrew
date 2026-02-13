import {collectSource, pathRef} from '@garage44/common/lib/paths.ts'
import {hash} from '@garage44/common/lib/utils.ts'

import type {EnolaTag, TargetLanguage} from './enola/types.ts'

import {enola} from '../service.ts'

// 1 second delay between languages
const LANGUAGE_PROCESSING_DELAY = 100

async function translate_tag(
    workspace: {
        broadcastI18nState: () => void
        config: {languages: {target: Array<{engine: string; id: string}>}}
        i18n: Record<string, unknown>
    },
    tagPath: string[],
    sourceText: string,
    persist = true,
) {
    const {id, ref} = pathRef(workspace.i18n, tagPath)
    if (!id) {
        throw new Error('Invalid tag path')
    }
    const refId = ref[id] as {_soft?: boolean; cache?: string; source?: string; target?: Record<string, string>}

    refId.source = sourceText
    refId.cache = hash(sourceText)

    if (persist && refId._soft) {
        delete refId._soft
    }
    if (!refId.target) {
        refId.target = {}
    }

    const translations = []
    for (const language of workspace.config.languages.target) {
        try {
            if (!language.engine) {
                // This should be safeguarded by the UI, but just in case...
                throw new Error(`No engine found for language ${language.id}`)
            }
            const tag: EnolaTag = {
                cache: refId.cache,
                source: refId.source || '',
                target: refId.target || {},
            }
            const translation = await enola.translate(language.engine, tag, {
                ...language,
                formality: (language as {formality?: string}).formality ?? 'default',
                name: (language as {name?: string}).name ?? language.id,
            } as TargetLanguage)
            translations.push(translation)
            // Add delay between languages
            if (workspace.config.languages.target.indexOf(language) < workspace.config.languages.target.length - 1) {
                await new Promise((resolve) => setTimeout(resolve, LANGUAGE_PROCESSING_DELAY))
            }
        } catch (error: unknown) {
            const errorObj = error as {response?: {headers?: Record<string, string>; status?: number}}
            if (errorObj.response?.status === 429) {
                const retryAfter = Number(errorObj.response.headers?.['retry-after']) || 60
                await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000))
                const retryTag: EnolaTag = {
                    cache: refId.cache,
                    source: refId.source || '',
                    target: refId.target || {},
                }
                const retryTranslation = await enola.translate(language.engine, retryTag, {
                    ...language,
                    formality: (language as {formality?: string}).formality ?? 'default',
                    name: (language as {name?: string}).name ?? language.id,
                } as TargetLanguage)
                translations.push(retryTranslation)
            } else {
                throw error
            }
        }
    }

    for (const [index, language] of workspace.config.languages.target.entries()) {
        if (refId.target) {
            refId.target[language.id] = translations[index]
        }
    }

    // After translation is complete, broadcast the updated state
    workspace.broadcastI18nState()

    return {id, ref}
}

async function translate_path(
    workspace: {
        broadcastI18nState: () => void
        config: {languages: {target: Array<{engine: string; id: string}>}}
        i18n: Record<string, unknown>
    },
    tagPath: string[],
    ignore_cache: boolean,
) {
    const {cached, targets} = collectSource(workspace.i18n, tagPath, ignore_cache)
    const translations: string[][] = []

    if (!targets.length) {
        return {cached, targets, translations}
    }

    // Extract tags from [Tag, string[]][] to EnolaTag[]
    const tags = targets.map(([tag]) => tag as EnolaTag)

    // Add rate limiting and error handling for batch translation
    for (const language of workspace.config.languages.target) {
        try {
            const translation = await enola.translateBatch(language.engine, tags, {
                ...language,
                formality: (language as {formality?: string}).formality ?? 'default',
                name: (language as {name?: string}).name ?? language.id,
            } as TargetLanguage)
            translations.push(translation)
            // Add delay between languages
            if (workspace.config.languages.target.indexOf(language) < workspace.config.languages.target.length - 1) {
                await new Promise((resolve) => setTimeout(resolve, LANGUAGE_PROCESSING_DELAY))
            }
        } catch (error: unknown) {
            const errorData = error as {response?: {headers?: Record<string, string>; status?: number}}
            if (errorData.response?.status === 429) {
                const retryAfter = errorData.response.headers?.['retry-after'] || '60'
                await new Promise((resolve) => setTimeout(resolve, parseInt(retryAfter, 10) * 1000))
                const retryTranslation = await enola.translateBatch(language.engine, tags, {
                    ...language,
                    formality: (language as {formality?: string}).formality ?? 'default',
                    name: (language as {name?: string}).name ?? language.id,
                } as TargetLanguage)
                translations.push(retryTranslation)
            } else {
                throw error
            }
        }
    }

    for (const [index, language] of workspace.config.languages.target.entries()) {
        const batchTranslations = translations[index]
        if (batchTranslations) {
            for (let tagIndex = 0; tagIndex < targets.length; tagIndex++) {
                const [tag] = targets[tagIndex]
                const translationTag = tag as EnolaTag
                const translation = batchTranslations[tagIndex]
                if (translation) {
                    translationTag.cache = hash(translationTag.source)
                    translationTag.target[language.id] = translation
                }
            }
        }
    }

    // After batch translation is complete, broadcast the updated state
    workspace.broadcastI18nState()

    return {cached, targets, translations}
}

export {translate_tag, translate_path}
