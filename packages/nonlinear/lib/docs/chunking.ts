/**
 * Markdown chunking utilities
 * Splits markdown content into chunks for embedding
 */

export interface Chunk {
    index: number
    text: string
    heading?: string
}

/**
 * Chunk markdown content by headings
 * Preserves heading context in each chunk
 */
export function chunkMarkdown(content: string, maxChunkSize: number = 1000, chunkOverlap: number = 200): Chunk[] {
    const chunks: Chunk[] = []

    // Split by headings (##, ###, ####)
    const headingRegex = /^(#{2,4})\s+(.+)$/gm
    const lines = content.split('\n')

    let currentChunk: string[] = []
    let currentHeading: string | undefined
    let chunkIndex = 0

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        const headingMatch = line.match(headingRegex)

        if (headingMatch) {
            // Found a heading
            const headingText = headingMatch[2].trim()

            // If current chunk has content, save it
            if (currentChunk.length > 0) {
                const chunkText = currentChunk.join('\n').trim()
                if (chunkText.length > 0) {
                    chunks.push({
                        index: chunkIndex++,
                        text: chunkText,
                        heading: currentHeading,
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
                    chunks.push({
                        index: chunkIndex++,
                        text: textToChunk,
                        heading: currentHeading,
                    })
                }

                // Keep overlap at start of new chunk
                const overlapLines = Math.floor(chunkOverlap / 50) // Rough estimate
                currentChunk = currentChunk.slice(-overlapLines)
            }
        }
    }

    // Add final chunk
    if (currentChunk.length > 0) {
        const chunkText = currentChunk.join('\n').trim()
        if (chunkText.length > 0) {
            chunks.push({
                index: chunkIndex++,
                text: chunkText,
                heading: currentHeading,
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
