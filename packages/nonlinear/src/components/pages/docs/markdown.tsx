import {marked} from 'marked'

import './markdown.css'

interface MarkdownProps {
    content: string
}

interface Frontmatter {
    [key: string]: unknown
}

function parseFrontmatter(content: string): {body: string; frontmatter: Frontmatter | null} {
    // Check if content starts with frontmatter delimiter
    if (!content.startsWith('---\n')) {
        return {body: content, frontmatter: null}
    }

    // Find the closing delimiter
    const endIndex = content.indexOf('\n---\n', 4)
    if (endIndex === -1) {
        return {body: content, frontmatter: null}
    }

    // Extract frontmatter and body
    const frontmatterText = content.slice(4, endIndex)
    const body = content.slice(endIndex + 5).trim()

    // Parse YAML-like frontmatter (simple parser for key-value pairs)
    const frontmatter: Frontmatter = {}
    const lines = frontmatterText.split('\n')
    let currentKey: string | null = null
    let currentArray: unknown[] | null = null

    for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) continue

        // Check if this is an array item (starts with -)
        if (trimmed.startsWith('-')) {
            const arrayValue = trimmed
                .slice(1)
                .trim()
                .replace(/^["']|["']$/g, '')
            if (currentKey && currentArray) {
                currentArray.push(arrayValue)
            } else if (currentKey) {
                currentArray = [arrayValue]
                frontmatter[currentKey] = currentArray
            }
            continue
        }

        // Reset array state when we hit a new key
        currentArray = null

        const colonIndex = trimmed.indexOf(':')
        if (colonIndex === -1) continue

        const key = trimmed.slice(0, colonIndex).trim()
        let value: unknown = trimmed.slice(colonIndex + 1).trim()

        // Remove quotes if present
        if (typeof value === 'string') {
            if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
                value = value.slice(1, -1)
            }
        }

        currentKey = key

        // Handle boolean values
        if (value === 'true') {
            frontmatter[key] = true
        } else if (value === 'false') {
            frontmatter[key] = false
        } else if (value === '') {
            // Empty value might indicate an array follows
            currentArray = []
            frontmatter[key] = currentArray
        } else {
            frontmatter[key] = value
        }
    }

    return {body, frontmatter: Object.keys(frontmatter).length > 0 ? frontmatter : null}
}

function formatFrontmatterValue(value: unknown): string {
    if (Array.isArray(value)) {
        return value.map((item) => String(item)).join(', ')
    }
    if (typeof value === 'boolean') {
        return value ? 'true' : 'false'
    }
    return String(value)
}

export const Markdown = ({content}: MarkdownProps) => {
    const {body, frontmatter} = parseFrontmatter(content)
    const htmlResult = marked.parse(body)
    const html = typeof htmlResult === 'string' ? htmlResult : String(htmlResult)

    return (
        <div class='markdown-content'>
            {frontmatter && (
                <div class='doc-metadata'>
                    <table>
                        <tbody>
                            {Object.entries(frontmatter).map(([key, value]) => (
                                <tr key={key}>
                                    <td class='metadata-key'>{key}:</td>
                                    <td class='metadata-value'>{formatFrontmatterValue(value)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            <div dangerouslySetInnerHTML={{__html: html}} />
        </div>
    )
}
