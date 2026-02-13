/*
 * Accepts multiple arguments and types ('', [], {})
 * See https://github.com/JedWatson/classnames
 * import classnames from 'classnames'
 */

// const classes = classnames

function copyObject<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj))
}

function flattenEnv(obj: Record<string, unknown>, parent?: string, res: Record<string, unknown> = {}): Record<string, unknown> {
    for (const key of Object.keys(obj)) {
        const propName = (parent ? parent + '_' + key : key).toUpperCase()
        const value = obj[key]
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            flattenEnv(value as Record<string, unknown>, propName, res)
        } else {
            res[`PYR_${propName}`] = value
        }
    }
    return res
}

function formatBytes(size: number): string {
    if (size > 1024 ** 3) {
        const gb = Math.round((size / 1024 ** 3) * 10) / 10
        return `${gb}GiB`
    }
    if (size > 1024 ** 2) {
        const mb = Math.round((size / 1024 ** 2) * 10) / 10
        return `${mb}MiB`
    }
    if (size > 1024) {
        const kb = Math.round((size / 1024) * 10) / 10
        return `${kb}KiB`
    }
    return `${size}B`
}

/**
 * Generates a hash string from a string input that works consistently in both browser and Node environments.
 * Uses FNV-1a algorithm which provides good distribution and low collision rate for string inputs.
 *
 * @param {string} str - The string to hash
 * @returns {string} A 64-bit hex string hash value
 */
function hash(str: string): string {
    /*
     * FNV-1a hash algorithm constants
     * First half
     */
    let h1 = 0xde_ad_be_ef
    // Second half
    let h2 = 0x41_c6_ce_57

    for (let index = 0; index < str.length; index++) {
        const char = str.codePointAt(index)
        h1 = Math.imul(h1 ^ char, 2_654_435_761)
        h2 = Math.imul(h2 ^ char, 1_597_334_677)
    }

    // Generate 16-char hex string from the two halves
    const hash1 = h1.toString(16).padStart(8, '0')
    const hash2 = h2.toString(16).padStart(8, '0')

    return hash1 + hash2
}

/**
 * Recursively applies a modification function to every key-value pair within an object.
 *
 * @param {Object} reference - The object to be traversed and modified.
 * @param {Function} apply - The modification function to apply.
 *   It's called with the reference object, the current key, and the current path.
 * @param {Array} [refPath=[]] - An array representing the current path within the object.
 *   Automatically populated during recursion.
 */
function keyMod<T extends Record<string, unknown>>(
    reference: T,
    apply: (ref: Record<string, unknown>, key: string | null, path: string[], nestingLevel: number) => void,
    refPath: string[] = [],
    nestingLevel = 0,
): void {
    apply(reference, null, refPath, nestingLevel)

    const keys = Object.keys(reference)
    for (const key of keys) {
        if (!key.startsWith('_') && !['src', 'target'].includes(key)) {
            refPath.push(key)

            if (typeof reference[key] === 'object' && reference[key] !== null) {
                keyMod(reference[key] as Record<string, unknown>, apply, refPath, nestingLevel + 1)
            } else if (typeof reference[key] === 'string') {
                apply(reference, key, refPath, nestingLevel + 1)
            }
            refPath.pop()
        }
    }
}

/**
 * Accesses or creates a value in an object along a specified path.
 *
 * @param {Object} obj - The object to be accessed or modified.
 * @param {Array} refPath - An array of keys representing the path to be navigated through the object.
 * @param {boolean} [create=false] - Determines whether missing path segments will be created.
 * @returns {any} - The value at the end of the path, or the modified object if segments were created.
 * @throws {Error} If `refPath` is not an array.
 */
function keyPath<T extends Record<string, unknown>>(obj: T, refPath: string[], create = false): T | Record<string, unknown> {
    if (!Array.isArray(refPath)) {
        throw new TypeError('refPath must be an array')
    }
    if (!refPath.length) {
        return obj
    }

    const _refPath = [...refPath]
    let _obj: unknown = obj
    while (_refPath.length) {
        const key = _refPath.shift()
        if (!key) break
        if (typeof _obj === 'object' && _obj !== null && key in (_obj as Record<string, unknown>)) {
            _obj = (_obj as Record<string, unknown>)[key]
        } else if (create && typeof _obj === 'object' && _obj !== null) {
            ;(_obj as Record<string, unknown>)[key] = {}
            _obj = (_obj as Record<string, unknown>)[key]
        } else {
            break
        }
    }

    return _obj as T | Record<string, unknown>
}

function isObject(argument: unknown): argument is Record<string, unknown> {
    return argument && typeof argument === 'object' && !Array.isArray(argument)
}

function mergeDeep<T extends Record<string, unknown>>(target: T, ...sources: Partial<T>[]): T {
    if (!sources.length) {
        return target
    }
    const source = sources.shift()

    if (isObject(target) && isObject(source)) {
        for (const key in source) {
            const sourceValue = source[key]
            if (isObject(sourceValue)) {
                if (!target[key] || !isObject(target[key])) {
                    Object.assign(target, {[key]: {}})
                }
                mergeDeep(target[key] as Record<string, unknown>, sourceValue)
            } else {
                Object.assign(target, {[key]: sourceValue})
            }
        }
    }

    return mergeDeep(target, ...sources)
}

/**
 * Pads a string or number with leading characters to reach a specified length.
 *
 * @param {string|number} value - The value to pad
 * @param {number} length - The desired total length
 * @param {string} [char='0'] - The character to pad with (defaults to '0')
 * @returns {string} The padded string
 */
function padLeft(value: string | number, length: number, char = '0'): string {
    const str = String(value)
    return str.length >= length ? str : (char.repeat(length) + str).slice(-length)
}

function randomId(size = 8): string {
    const characters = 'abcdefghijklmnopqrstuvwxyz0123456789'
    let result = ''
    for (let index = 0; index < size; index++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length))
    }
    return result
}

/**
 * Sorts the keys of an object, and recursively sorts the keys of any nested objects.
 *
 * @param {Object|null} obj - The object whose keys are to be sorted.
 *   If the input is not an object or is null, it is returned as is.
 * @returns {Object|null} The new object with sorted keys, or the original input if it was not an object.
 */
function sortNestedObjectKeys<T>(obj: T): T {
    if (typeof obj !== 'object' || Array.isArray(obj) || obj === null) {
        return obj
    }

    const sortedKeys = Object.keys(obj as Record<string, unknown>).toSorted()

    const sortedObj: Record<string, unknown> = {}
    sortedKeys.forEach((key) => {
        const value = (obj as Record<string, unknown>)[key]
        sortedObj[key] = sortNestedObjectKeys(value)
    })

    return sortedObj as T
}

/**
 * Creates a throttled function that only invokes the provided function at most once per every wait milliseconds.
 *
 * @param {Function} func - The function to throttle.
 * @param {number} wait - The number of milliseconds to throttle invocations to.
 * @returns {Function} The throttled function.
 */
function throttle<T extends (...args: unknown[]) => void>(
    func: T,
    wait: number,
    options?: {trailing?: boolean},
): (...args: Parameters<T>) => void {
    const trailing = options?.trailing ?? true
    let lastCallTime = 0
    let timeoutId = null

    return function throttled(...args) {
        const now = Date.now()
        const remainingTime = wait - (now - lastCallTime)

        if (remainingTime <= 0) {
            if (timeoutId) {
                clearTimeout(timeoutId)
                timeoutId = null
            }
            lastCallTime = now
            func.apply(this, args)
        } else if (!timeoutId && trailing) {
            timeoutId = setTimeout(() => {
                lastCallTime = Date.now()
                timeoutId = null
                func.apply(this, args)
            }, remainingTime)
        }
    }
}

export {
    copyObject,
    flattenEnv,
    formatBytes,
    hash,
    keyMod,
    keyPath,
    isObject,
    mergeDeep,
    padLeft,
    randomId,
    sortNestedObjectKeys,
    throttle,
}
