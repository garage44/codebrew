import {pathRef} from '@garage44/common/lib/paths.ts'
import {keyMod} from '@garage44/common/lib/utils.ts'

import type {TargetLanguage} from './enola/types.ts'

import {enola} from '../service.ts'

/**
 * Synchronizes translations for a specific language.
 *
 * This function iterates through the i18n settings, performing actions based on the 'action' parameter:
 * - For 'remove': It removes the translation for the specified language.
 * - For 'update': It adds new translations or uses placeholders for tags.
 *
 * After processing, it translates any new content that needs translation.
 *
 * @param {Object} language - The language object to sync.
 * @param {string} action - The action to perform ('remove' or 'update').
 * @returns {Promise<Object>} An object containing arrays of added and removed translations.
 */
export async function syncLanguage(
    workspace: {config: {languages: {target: {engine: string; id: string}[]}}; i18n: Record<string, unknown>},
    language: {engine: string; id: string},
    action: 'remove' | 'update',
): Promise<[{source: string; target: Record<string, string>}, string][]> {
    const syncTags: [{source: string; target: Record<string, string>}, string][] = []

    keyMod(workspace.i18n, (ref: Record<string, unknown>, key: string | null, refPath: string[], _nestingLevel: number) => {
        const {id, ref: refObj} = pathRef(workspace.i18n, refPath)
        if (!id) {
            return
        }
        const refId = refObj[id] as {source?: string; target?: Record<string, string>}
        if (typeof refId === 'object' && refId !== null && 'target' in refId && refId.target) {
            if (action === 'remove') {
                if (language.id in refId.target) {
                    delete refId.target[language.id]
                }
            } else if (action === 'update') {
                // These are still placeholders; no need to translate these.
                if (refId.source && refId.source.startsWith('tag')) {
                    if (refId.target) {
                        refId.target[language.id] = refId.source
                    }
                } else if (refId.source) {
                    syncTags.push([refId as {source: string; target: Record<string, string>}, refId.source])
                }
            }
        }
    })

    if (syncTags.length) {
        const tags = syncTags.map(([tag]) => tag as {source: string; target: Record<string, string>})
        const translations = await enola.translateBatch(language.engine, tags, {
            ...language,
            formality: (language as {formality?: string}).formality ?? 'default',
            name: (language as {name?: string}).name ?? language.id,
        } as TargetLanguage)
        for (let i = 0; i < translations.length; i++) {
            const tag = syncTags[i][0] as {target: Record<string, string>}
            tag.target[language.id] = translations[i]
        }
    }

    return syncTags
}
