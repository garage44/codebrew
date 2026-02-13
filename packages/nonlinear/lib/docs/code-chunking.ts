/**
 * Code chunking utilities
 * Chunks code by semantic units (functions, classes, interfaces)
 */

export interface CodeChunk {
    endLine: number
    filePath: string
    index: number
    name?: string
    startLine: number
    text: string
    type: 'function' | 'class' | 'interface' | 'type' | 'constant' | 'other'
}

/**
 * Simple code chunking by semantic units
 * Uses regex patterns to extract functions, classes, interfaces
 * TODO: Enhance with AST parsing using Bun's TypeScript compiler
 */
export function chunkCode(
    code: string,
    filePath: string,
    // eslint-disable-next-line @typescript-eslint/no-inferrable-types
    maxChunkSize: number = 1000,
): CodeChunk[] {
    const chunks: CodeChunk[] = []
    const lines = code.split('\n')
    const currentChunk = null as CodeChunk | null
    let chunkIndex = 0

    // Extract functions
    const functionRegex = /^(export\s+)?(async\s+)?function\s+(\w+)/gm
    let match: RegExpExecArray | null = null
    while ((match = functionRegex.exec(code)) !== null) {
        const funcName = match[3]
        const startPos = match.index
        const startLine = code.slice(0, startPos).split('\n').length

        // Find function end (simplified - looks for closing brace)
        let braceCount = 0
        let inFunction = false
        let endPos = startPos

        for (let idx = startPos; idx < code.length; idx += 1) {
            const char = code[idx]
            if (char === '{') {
                braceCount += 1
                inFunction = true
            } else if (char === '}') {
                braceCount -= 1
                if (inFunction && braceCount === 0) {
                    endPos = idx + 1
                    break
                }
            }
        }

        const endLine = code.slice(0, endPos).split('\n').length
        const funcText = code.slice(startPos, endPos)

        chunks.push({
            endLine,
            filePath,
            index: chunkIndex += 1,
            name: funcName,
            startLine,
            text: funcText,
            type: 'function',
        })
    }

    // Extract classes
    const classRegex = /^(export\s+)?class\s+(\w+)/gm
    while ((match = classRegex.exec(code)) !== null) {
        const className = match[2]
        const startPos = match.index
        const startLine = code.slice(0, startPos).split('\n').length

        let braceCount = 0
        let inClass = false
        let endPos = startPos

        for (let idx = startPos; idx < code.length; idx += 1) {
            const char = code[idx]
            if (char === '{') {
                braceCount += 1
                inClass = true
            } else if (char === '}') {
                braceCount -= 1
                if (inClass && braceCount === 0) {
                    endPos = idx + 1
                    break
                }
            }
        }

        const endLine = code.slice(0, endPos).split('\n').length
        const classText = code.slice(startPos, endPos)

        chunks.push({
            endLine,
            filePath,
            index: chunkIndex += 1,
            name: className,
            startLine,
            text: classText,
            type: 'class',
        })
    }

    // Extract interfaces
    const interfaceRegex = /^(export\s+)?interface\s+(\w+)/gm
    while ((match = interfaceRegex.exec(code)) !== null) {
        const interfaceName = match[2]
        const startPos = match.index
        const startLine = code.slice(0, startPos).split('\n').length

        let braceCount = 0
        let inInterface = false
        let endPos = startPos

        for (let idx = startPos; idx < code.length; idx += 1) {
            const char = code[idx]
            if (char === '{') {
                braceCount += 1
                inInterface = true
            } else if (char === '}') {
                braceCount -= 1
                if (inInterface && braceCount === 0) {
                    endPos = idx + 1
                    break
                }
            }
        }

        const endLine = code.slice(0, endPos).split('\n').length
        const interfaceText = code.slice(startPos, endPos)

        chunks.push({
            endLine,
            filePath,
            index: chunkIndex += 1,
            name: interfaceName,
            startLine,
            text: interfaceText,
            type: 'interface',
        })
    }

    // If no semantic units found, chunk by lines
    if (chunks.length === 0) {
        const lineChunks = Math.ceil(lines.length / maxChunkSize)
        for (let idx = 0; idx < lineChunks; idx += 1) {
            const start = idx * maxChunkSize
            const end = Math.min(start + maxChunkSize, lines.length)
            chunks.push({
                endLine: end,
                filePath,
                index: chunkIndex += 1,
                startLine: start + 1,
                text: lines.slice(start, end).join('\n'),
                type: 'other',
            })
        }
    }

    return chunks
}
