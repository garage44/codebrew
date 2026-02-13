/**
 * Markdown chunking utilities
 * Splits markdown content into chunks for embedding
 */

export interface Chunk {
    heading?: string
    index: number
    text: string
}

/**
 * Chunk markdown content by headings
 * Preserves heading context in each chunk
 */
export function chunkMarkdown(content: string, maxChunkSize = 1000, chunkOverlap = 200): Chunk[] {
    const chunks: Chunk[] = []

    // Split by headings (##, ###, ####)
    const headingRegex = /^(#{2,4})\s+(.+)$/gm
    const lines = content.split('\n')

    let currentChunk: string[] = []
    let currentHeading: string | undefined = null as unknown as string | undefined
    let chunkIndex = 0

    for (const line of lines) {
        const headingMatch = line.match(headingRegex)

        if (headingMatch && headingMatch[2]) {
            // Found a heading
            const headingText = headingMatch[2].trim()

            // If current chunk has content, save it
            if (currentChunk.length > 0) {
                const chunkText = currentChunk.join('\n').trim()
                if (chunkText.length > 0) {
                    chunkIndex += 1
                    chunks.push({
                        heading: currentHeading,
                        index: chunkIndex,
                        text: chunkText,
                    })
                }
            }

            // Start new chunk with heading
            currentHeading = headingText
            currentChunk = [line]
        } else {
            currentChunk.push(line)

            // Check if chunk exceeds max size
            const chunkText = currentChunk.join('\n')
            if (chunkText.length > maxChunkSize) {
                // Split current chunk
                const textToChunk = currentChunk.slice(0, -1).join('\n').trim()
                if (textToChunk.length > 0) {
                    chunkIndex += 1
                    chunks.push({
                        heading: currentHeading,
                        index: chunkIndex,
                        text: textToChunk,
                    })
                }

                /*
                 * Keep overlap at start of new chunk
                 * Rough estimate
                 */
                const overlapLines = Math.floor(chunkOverlap / 50)
                currentChunk = currentChunk.slice(-overlapLines)
            }
        }
    }

    // Add final chunk
    if (currentChunk.length > 0) {
        const chunkText = currentChunk.join('\n').trim()
        if (chunkText.length > 0) {
            chunkIndex += 1
            chunks.push({
                heading: currentHeading,
                index: chunkIndex,
                text: chunkText,
            })
        }
    }

    // If no headings found, create single chunk
    if (chunks.length === 0 && content.trim().length > 0) {
        chunks.push({
            index: 0,
            text: content.trim(),
        })
    }

    return chunks
}
