/**
 * Code chunking utilities
 * Chunks code by semantic units (functions, classes, interfaces)
 */

export interface CodeChunk {
    index: number
    text: string
    type: 'function' | 'class' | 'interface' | 'type' | 'constant' | 'other'
    name?: string
    filePath: string
    startLine: number
    endLine: number
}

/**
 * Simple code chunking by semantic units
 * Uses regex patterns to extract functions, classes, interfaces
 * TODO: Enhance with AST parsing using Bun's TypeScript compiler
 */
export function chunkCode(
    code: string,
    filePath: string,
    maxChunkSize: number = 1000
): CodeChunk[] {
    const chunks: CodeChunk[] = []
    const lines = code.split('\n')
    let currentChunk: CodeChunk | null = null
    let chunkIndex = 0

    // Extract functions
    const functionRegex = /^(export\s+)?(async\s+)?function\s+(\w+)/gm
    let match
    while ((match = functionRegex.exec(code)) !== null) {
        const funcName = match[3]
        const startPos = match.index
        const startLine = code.substring(0, startPos).split('\n').length

        // Find function end (simplified - looks for closing brace)
        let braceCount = 0
        let inFunction = false
        let endPos = startPos

        for (let i = startPos; i < code.length; i++) {
            const char = code[i]
            if (char === '{') {
                braceCount++
                inFunction = true
            } else if (char === '}') {
                braceCount--
                if (inFunction && braceCount === 0) {
                    endPos = i + 1
                    break
                }
            }
        }

        const endLine = code.substring(0, endPos).split('\n').length
        const funcText = code.substring(startPos, endPos)

        chunks.push({
            index: chunkIndex++,
            text: funcText,
            type: 'function',
            name: funcName,
            filePath,
            startLine,
            endLine,
        })
    }

    // Extract classes
    const classRegex = /^(export\s+)?class\s+(\w+)/gm
    while ((match = classRegex.exec(code)) !== null) {
        const className = match[2]
        const startPos = match.index
        const startLine = code.substring(0, startPos).split('\n').length

        let braceCount = 0
        let inClass = false
        let endPos = startPos

        for (let i = startPos; i < code.length; i++) {
            const char = code[i]
            if (char === '{') {
                braceCount++
                inClass = true
            } else if (char === '}') {
                braceCount--
                if (inClass && braceCount === 0) {
                    endPos = i + 1
                    break
                }
            }
        }

        const endLine = code.substring(0, endPos).split('\n').length
        const classText = code.substring(startPos, endPos)

        chunks.push({
            index: chunkIndex++,
            text: classText,
            type: 'class',
            name: className,
            filePath,
            startLine,
            endLine,
        })
    }

    // Extract interfaces
    const interfaceRegex = /^(export\s+)?interface\s+(\w+)/gm
    while ((match = interfaceRegex.exec(code)) !== null) {
        const interfaceName = match[2]
        const startPos = match.index
        const startLine = code.substring(0, startPos).split('\n').length

        let braceCount = 0
        let inInterface = false
        let endPos = startPos

        for (let i = startPos; i < code.length; i++) {
            const char = code[i]
            if (char === '{') {
                braceCount++
                inInterface = true
            } else if (char === '}') {
                braceCount--
                if (inInterface && braceCount === 0) {
                    endPos = i + 1
                    break
                }
            }
        }

        const endLine = code.substring(0, endPos).split('\n').length
        const interfaceText = code.substring(startPos, endPos)

        chunks.push({
            index: chunkIndex++,
            text: interfaceText,
            type: 'interface',
            name: interfaceName,
            filePath,
            startLine,
            endLine,
        })
    }

    // If no semantic units found, chunk by lines
    if (chunks.length === 0) {
        const lineChunks = Math.ceil(lines.length / maxChunkSize)
        for (let i = 0; i < lineChunks; i++) {
            const start = i * maxChunkSize
            const end = Math.min(start + maxChunkSize, lines.length)
            chunks.push({
                index: chunkIndex++,
                text: lines.slice(start, end).join('\n'),
                type: 'other',
                filePath,
                startLine: start + 1,
                endLine: end,
            })
        }
    }

    return chunks
}
