import {effect} from '@preact/signals'

import type {Store} from './store'

// This is a workaround to avoid i18next import errors on succesive builds.
import i18next from './i18next'
import {logger} from './logger'
import {copyObject, keyMod, keyPath} from './utils'

/**
 * Symbol used to store the i18n path string on translation objects.
 * This allows us to extract the path from an object reference when calling $t().
 */
export const I18N_PATH_SYMBOL = Symbol('i18n.path')

function i18nFormat(i18n: Record<string, unknown>, targetLanguages: Array<{id: string}>) {
    const _i18n = copyObject(i18n)
    const i18nextFormatted: Record<string, {translation: Record<string, unknown>}> = {}
    for (const language of targetLanguages) {
        i18nextFormatted[language.id] = {translation: {}}
    }

    keyMod(_i18n, (_srcRef: Record<string, unknown>, _key: string | null, refPath: string[]): void => {
        const _i18nObject = keyPath(_i18n, refPath)

        if (typeof _i18nObject === 'object' && _i18nObject !== null && 'target' in _i18nObject) {
            const targetObj = _i18nObject.target as Record<string, unknown>
            for (const [language_id] of Object.entries(targetObj)) {
                if (!i18nextFormatted[language_id]) {
                    i18nextFormatted[language_id] = {translation: {}}
                }
                const lastKey = refPath.at(-1)
                if (lastKey) {
                    const _18nextObject = keyPath(
                        i18nextFormatted[language_id].translation,
                        refPath.slice(0, -1),
                        true,
                    ) as Record<string, unknown>
                    _18nextObject[lastKey] = targetObj[language_id]
                }
            }
        }
    })

    return i18nextFormatted
}

async function init(
    translations: Record<string, unknown> | null | undefined = null,
    api: {get: (path: string, params?: Record<string, unknown> | null) => Promise<unknown>} | null | undefined = null,
    store: Store | null | undefined = null,
): Promise<void> {
    let resources: Record<string, unknown> | null = null

    if (translations) {
        resources = translations
        logger.debug(`loading languages from bundle: ${Object.keys(resources).join(', ')}`)
    } else if (api) {
        const apiResult = await api.get('/api/translations')
        resources = apiResult as Record<string, unknown> | null
        if (resources) {
            logger.debug(`loading languages from endpoint: ${Object.keys(resources).join(', ')}`)
        }
    }

    if (store && resources) {
        const storeState = store.state as {language_ui: {i18n: Record<string, Record<string, unknown>>}}
        for (const language_id of Object.keys(resources)) {
            storeState.language_ui.i18n[language_id] = {}
        }
    }

    i18next.init({
        debug: process.env.NODE_ENV !== 'production',

        fallbackLng: 'eng-gbr',
        interpolation: {
            escapeValue: false,
        },
        lng: store ? (store.state as {language_ui: {selection: string}}).language_ui.selection : 'eng-gbr',
        resources: resources || undefined,
    })

    if (store) {
        effect(() => {
            const language = (store.state as {language_ui: {selection: string}}).language_ui.selection
            i18next.changeLanguage(language)
            logger.debug(`language changed to: ${language}`)
            store.save()
        })
    }
}

/**
 * Creates a translation function with store-based caching
 * This is exported as a factory to avoid circular dependencies
 *
 * @param key - Translation object reference (must have I18N_PATH_SYMBOL property)
 * @param context - Optional interpolation context
 */
function create$t(store: Store) {
    return (key: Record<string, unknown> | string, context: Record<string, unknown> | null | undefined = null): string => {
        /*
         * Extract path from object using Symbol
         * Path format: i18n.path.to.translation
         */
        let path: string
        if (typeof key === 'string') {
            // Support string keys for backward compatibility
            path = key
        } else {
            path = (key as {[I18N_PATH_SYMBOL]?: string})[I18N_PATH_SYMBOL] || ''
            if (!path) {
                logger.error(`Translation object missing path. Object must have ${I18N_PATH_SYMBOL.toString()} property.`)
                return ''
            }
        }

        // Strip 'i18n.' prefix for i18next (it expects paths like 'path.to.translation')
        if (path.startsWith('i18n.')) {
            // Remove 'i18n.' prefix
            path = path.slice(5)
        }

        const storeState = store.state as {language_ui: {i18n: Record<string, Record<string, string>>; selection: string}}
        if (!storeState.language_ui.i18n[storeState.language_ui.selection]) {
            storeState.language_ui.i18n[storeState.language_ui.selection] = {}
        }

        // Create a cache key that includes both the key and context
        const cacheKey = context ? `${path}:${JSON.stringify(context)}` : path

        if (!storeState.language_ui.i18n[storeState.language_ui.selection][cacheKey]) {
            storeState.language_ui.i18n[storeState.language_ui.selection][cacheKey] = i18next.t(
                path,
                context || undefined,
            ) as string
        }
        return storeState.language_ui.i18n[storeState.language_ui.selection][cacheKey]
    }
}

export {create$t, i18nFormat, init}
