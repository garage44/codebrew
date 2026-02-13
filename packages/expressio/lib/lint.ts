import {pathCreate, pathDelete} from '@garage44/common/lib/paths.ts'
import {keyMod, keyPath, randomId} from '@garage44/common/lib/utils.ts'
import {Glob} from 'bun'
import fs from 'fs-extra'
import path from 'node:path'

import {enola} from '../service.ts'
import {translate_tag} from './translate.ts'

export async function lintWorkspace(workspace, lintMode: 'sync' | 'lint') {
    // oxlint-disable-next-line no-template-curly-in-string
    const scan_target = workspace.config.sync.dir.replace('${workspaceFolder}', path.dirname(workspace.config.source_file))

    // Extract base directory and pattern for Bun's Glob
    const firstGlobChar = scan_target.search(/[*?{[]/)
    const baseDir = firstGlobChar === -1 ? scan_target : scan_target.slice(0, scan_target.lastIndexOf('/', firstGlobChar))
    const pattern = firstGlobChar === -1 ? '**/*' : scan_target.slice(baseDir.length + 1)

    const glob = new Glob(pattern)
    const files = Array.from(glob.scanSync(baseDir)).map((f) => path.join(baseDir, f))

    const files_content = await Promise.all(files.map((file) => fs.readFile(file, 'utf8')))
    const tagRegex = /\$t\('([^']+)'(?:\s*,\s*{[^}]*})?\)/g
    const deleteTags = []
    const createTags = []
    const modifyTags = []

    const redundantTags = new Set()
    keyMod(workspace.i18n, (ref, _id, refPath) => {
        if (ref && 'source' in ref) {
            // First add everything to the set.
            redundantTags.add(refPath.join('.'))
        }
    })
    for (const [i, content] of files_content.entries()) {
        const matches = content.matchAll(tagRegex)
        for (const match of matches) {
            // Calculate line number by counting newlines before the match
            const tag = match[1]
            const tagPath = tag.split('.')
            const lastKey = tagPath.at(-1)
            const parentRef = keyPath(workspace.i18n, tagPath.slice(0, -1))

            const ref = parentRef && lastKey in parentRef ? parentRef[lastKey] : undefined

            if (ref) {
                // Remove all found tags from the set.
                if ('_redundant' in ref) {
                    delete ref._redundant
                    modifyTags.push({path: tagPath, value: ref})
                }
            } else if (lintMode === 'sync') {
                let sourceText = ''
                if (workspace.config.sync.suggestions !== false && 'anthropic' in enola.engines) {
                    // Guess the source text from the context.
                    sourceText = await enola.suggestion('anthropic', workspace.i18n, tagPath, match[0])
                } else {
                    // Fallback to a random ID if no LLM is available or suggestions are disabled.
                    sourceText = `tag_${randomId()}`
                }

                let {id, ref} = pathCreate(
                    workspace.i18n,
                    tagPath,
                    {
                        _soft: true,
                        source: sourceText,
                        target: {},
                    } as {cache?: string; source: string; target: Record<string, string>},
                    workspace.config.languages.target,
                )

                ;({id, ref} = await translate_tag(workspace, tagPath, sourceText, false))
                createTags.push({path: tagPath, value: ref[id]})
            } else if (lintMode === 'lint') {
                const file = path.relative(path.dirname(workspace.config.source_file), files[i])
                const beforeMatch = content.slice(0, match.index)
                const line = content.slice(0, match.index).split('\n').length
                const lastNewline = beforeMatch.lastIndexOf('\n')
                const column = lastNewline === -1 ? match.index : match.index - lastNewline - 1
                createTags.push({column, file, line, match, path: tagPath})
            }

            redundantTags.delete(tag)
        }
    }

    for (const redundantTag of redundantTags) {
        const tagPath = (redundantTag as string).split('.')
        const ref = keyPath(workspace.i18n, tagPath)
        if (typeof ref === 'object' && ref !== null && 'source' in ref) {
            const refData = ref as {_redundant?: boolean; _soft?: boolean; source: string}
            if (refData._soft) {
                if (lintMode === 'sync') {
                    // A soft tag can directly be removed.
                    pathDelete(workspace.i18n, tagPath)
                    deleteTags.push({path: tagPath, value: ref})
                } else {
                    // In lint mode, we can't determine file/match for redundant tags
                    deleteTags.push({path: tagPath})
                }
            } else if (lintMode === 'sync') {
                // A persistant tag is marked as redundant instead.
                refData._redundant = true
                modifyTags.push({path: tagPath, value: ref})
            } else if (lintMode === 'lint') {
                deleteTags.push({path: tagPath})
            }
        }
    }

    if (createTags.length || deleteTags.length || modifyTags.length) {
        const fileGroups = new Map()
        for (const tag of createTags) {
            if (!fileGroups.has(tag.file)) {
                fileGroups.set(tag.file, [])
            }
            fileGroups.get(tag.file).push(tag)
        }

        // Group delete tags by common paths
        const groupedDeleteTags = deleteTags.reduce((acc, tag) => {
            // Find the most specific common path that already exists
            const pathParts = tag.path
            let commonPath = ''

            // Try each level of the path to find existing groups
            for (let i = 1; i <= pathParts.length - 1; i++) {
                const testPath = pathParts.slice(0, i).join('.')
                if (acc[testPath]) {
                    commonPath = testPath
                }
            }

            // If no common path found, create a new group with all but the last element
            if (!commonPath) {
                commonPath = pathParts.slice(0, -1).join('.')
            }

            if (!acc[commonPath]) {
                acc[commonPath] = []
            }
            acc[commonPath].push(tag)
            return acc
        }, {})

        if (lintMode === 'lint') {
            return {
                create_tags: [...fileGroups.entries()].map(([file, groups]) => ({file, groups})),
                delete_tags: Object.entries(groupedDeleteTags)
                    .toSorted(([first], [second]) => first.split('.').length - second.split('.').length)
                    .map(([group, tags]) => ({group, tags})),
            }
        }

        return {
            create_tags: createTags,
            delete_tags: deleteTags,
            modify_tags: modifyTags,
        }
    }

    return false
}
