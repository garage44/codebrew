import {I18N_PATH_SYMBOL} from './i18n'
import {logger} from './logger'
import {hash, keyMod, keyPath, mergeDeep} from './utils'

interface Tag {
    cache?: string
    source: string
    target: Record<string, string>
}

interface TargetLanguage {
    engine: 'anthropic' | 'deepl'
    formality: 'default' | 'more' | 'less'
    id: string
    name: string
}

function collectSource(
    source: Record<string, unknown>,
    path: string[],
    ignore_cache = false,
): {cached: Tag[]; targets: [Tag, string[]][]} {
    const cachedValues: Tag[] = []
    const sourceValues: [Tag, string[]][] = []

    function traverse(current: unknown, path: string[]): void {
        if (typeof current !== 'object' || current === null) {
            return
        }
        const currentObj = current as Record<string, unknown>

        if ('source' in currentObj && typeof currentObj.source === 'string') {
            const tagObj = currentObj as unknown as Tag
            // Check if we should ignore cache
            if (ignore_cache) {
                sourceValues.push([tagObj, path])
            } else if (currentObj.cache === hash(currentObj.source)) {
                // Use cached value
                cachedValues.push(tagObj)
            } else {
                // Need to translate
                sourceValues.push([tagObj, path])
            }
        }

        // Traverse nested objects
        for (const key in currentObj) {
            if (Object.hasOwn(currentObj, key)) {
                traverse(currentObj[key], [...path, key])
            }
        }
    }

    const {id, ref} = pathRef(source, path)
    if (id && ref[id]) {
        traverse(ref[id], path)
    }
    // Return collected values
    return {
        cached: cachedValues,
        targets: sourceValues,
    }
}

/**
 * Create a new object in a path.
 * @param source
 * @param path
 * @param value
 * @param targetLanguages
 * @returns
 */
function pathCreate(
    sourceObject: Record<string, unknown>,
    tagPath: string[],
    value: Tag,
    targetLanguages: TargetLanguage[],
    translations?: Record<string, string>,
) {
    const pathRefResult = pathRef(sourceObject, tagPath, true)
    const {id, ref} = pathRefResult
    if (!id) {
        throw new Error('Invalid path: id is null')
    }
    ref[id] = value

    const tag = tagPath.join('.')
    const refId = ref[id] as Tag & {_collapsed?: boolean; _id?: string; _soft?: boolean; target?: Record<string, string>}
    refId._id = id
    refId._collapsed = true

    // Set _id and _collapsed for each intermediate path object
    for (let index = 0; index < tagPath.length - 1; index++) {
        const partialPath = tagPath.slice(0, index + 1)
        const {id: segmentId, ref: segmentRef} = pathRef(sourceObject, partialPath)

        // Set properties directly on the object
        if (segmentId && segmentRef[segmentId] && typeof segmentRef[segmentId] === 'object') {
            const segmentObj = segmentRef[segmentId] as {_collapsed?: boolean; _id?: string}
            if (!('_id' in segmentObj)) {
                segmentObj._id = segmentId
            }
            if (!('_collapsed' in segmentObj)) {
                segmentObj._collapsed = false
            }
        }
    }

    if ('source' in value) {
        // This is a tag; add placeholders for each target language
        refId.target = {}

        if ('_soft' in value) {
            refId._soft = value._soft as boolean
        }

        /*
         * Attach path symbol for type-safe translation references
         * Path format: i18n.path.to.translation
         */
        const refObj = ref[id] as Record<string | symbol, unknown>
        refObj[I18N_PATH_SYMBOL] = `i18n.${tag}`

        logger.info(`create path tag: ${tag} ${'_soft' in value ? '(soft create)' : ''}`)
        const refIdTag = refId as Tag & {target: Record<string, string>}
        targetLanguages.forEach((language) => {
            if (translations && translations[language.id]) {
                refIdTag.target[language.id] = translations[language.id]
            } else {
                refIdTag.target[language.id] = id || ''
            }
        })
    } else {
        logger.info(`create path group: ${tag}`)
    }

    return {id, ref}
}

function pathDelete(source: Record<string, unknown>, path: string[]): void {
    const {id, ref} = pathRef(source, path)
    if (id) {
        delete ref[id]
    }
    logger.info(`delete path: ${path.join('.')}`)
}

function pathHas(source: Record<string, unknown>, path: string[], key: string): boolean {
    const {id, ref} = pathRef(source, path)
    let has_key = false
    if (id && ref[id] && typeof ref[id] === 'object') {
        keyMod(ref[id] as Record<string, unknown>, (sourceRef) => {
            if (key in sourceRef) {
                has_key = true
            }
        })
    }

    return has_key
}

/**
 * Toggles collapse state for nodes in the path tree.
 * @param {Object} source - The source object to modify
 * @param {Array} path - Path to the target node
 * @param {Object} modifier - Modifications to apply (typically {_collapsed: boolean})
 * @param {string} mode - How to apply: 'self' (target only), 'groups' (target+nested groups), 'all' (target+all nested)
 */
function pathToggle(
    source: Record<string, unknown>,
    path: string[],
    modifier: Record<string, unknown>,
    mode: 'self' | 'groups' | 'all' = 'groups',
): void {
    function applyRecursively(obj: Record<string, unknown>): void {
        if (!obj || typeof obj !== 'object') {
            return
        }

        for (const key in obj) {
            if (Object.hasOwn(obj, key)) {
                const value = obj[key]
                if (value && typeof value === 'object' && !Array.isArray(value)) {
                    const valueObj = value as Record<string, unknown>
                    const isTag = 'source' in valueObj

                    // Apply based on mode and node type
                    if (mode === 'all' || (!isTag && mode === 'groups')) {
                        mergeDeep(valueObj, modifier)
                    }

                    // Continue recursion
                    applyRecursively(valueObj)
                }
            }
        }
    }

    // Apply modifier to children recursively
    function applyToChildren(obj: Record<string, unknown>): void {
        if (!obj || typeof obj !== 'object') {
            return
        }

        for (const key in obj) {
            if (Object.hasOwn(obj, key)) {
                const value = obj[key]
                if (value && typeof value === 'object' && !Array.isArray(value)) {
                    const valueObj = value as Record<string, unknown>
                    const isTag = 'source' in valueObj

                    // Apply based on mode and node type
                    const shouldApply = mode === 'all' || (!isTag && mode === 'groups')
                    if (shouldApply) {
                        mergeDeep(valueObj, modifier)
                    }

                    // Continue recursion
                    applyToChildren(valueObj)
                }
            }
        }
    }

    if (!modifier) {
        return
    }

    // Handle empty path (root level)
    const isEmptyPath = !path || path.length === 0
    if (isEmptyPath) {
        // Apply to root node
        mergeDeep(source, modifier)

        // Recursively apply changes based on mode
        if (mode !== 'self') {
            applyRecursively(source)
        }

        return
    }

    // Non-root path handling
    const {id, ref} = pathRef(source, path)
    if (!id || !ref[id]) {
        return
    }

    // Apply to target node
    if (ref[id] && typeof ref[id] === 'object') {
        mergeDeep(ref[id] as Record<string, unknown>, modifier)

        // Apply to nested nodes based on mode
        if (mode !== 'self') {
            applyToChildren(ref[id] as Record<string, unknown>)
        }
    }
}

function pathUpdate(source: Record<string, unknown>, path: string[], value: Record<string, unknown>): void {
    const {id, ref} = pathRef(source, path)

    if (!id) {
        return
    }

    const refId = ref[id] as Record<string, unknown>
    for (const key in refId) {
        if (!(key in value)) {
            delete refId[key]
        }
    }

    // Update ref[id] with new values
    Object.assign(refId, value)

    const pathStr = Array.isArray(path) ? path.join('.') : String(path)
    logger.info(`update path: ${pathStr}`)
}

/**
 * Moves a path in an object.
 * @param {*} source
 * @param {*} oldPath
 * @param {*} newPath
 */
function pathMove(source: Record<string, unknown>, oldPath: string[], newPath: string[]): void {
    logger.info(`move path: ${oldPath} - ${newPath}`)
    const oldId = oldPath.at(-1)
    const oldRefPath = oldPath.slice(0, -1)

    const newId = newPath.at(-1)
    const newRefPath = newPath.slice(0, -1)

    const oldSourceRef = keyPath(source, oldRefPath) as Record<string, unknown>
    const newSourceRef = keyPath(source, newRefPath, true) as Record<string, unknown>

    if (!oldId || !newId) {
        return
    }

    newSourceRef[newId] = oldSourceRef[oldId]
    const movedObj = newSourceRef[newId] as {_id?: string; [I18N_PATH_SYMBOL]?: string}
    movedObj._id = newId

    /*
     * Update path symbol for moved object
     * Path format: i18n.path.to.translation
     */
    const newPathParts = newPath.join('.')
    const newPathString = `i18n.${newPathParts}`
    if (newId && typeof newSourceRef[newId] === 'object' && newSourceRef[newId] !== null && 'source' in newSourceRef[newId]) {
        movedObj[I18N_PATH_SYMBOL] = newPathString
    }

    delete oldSourceRef[oldId]
}

function pathRef(
    source: Record<string, unknown>,
    path: string[],
    create = false,
): {id: string | null; path: string[]; ref: Record<string, unknown>} {
    if (!path.length) {
        return {id: null, path: [], ref: source}
    }
    const id = path.at(-1) || null
    const refPath = path.slice(0, -1)
    return {
        id,
        path: refPath,
        ref: keyPath(source, refPath, create) as Record<string, unknown>,
    }
}

export {collectSource, pathCreate, pathDelete, pathHas, pathMove, pathRef, pathToggle, pathUpdate}
