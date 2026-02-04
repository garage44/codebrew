import {marked} from 'marked'

// Configure marked for better formatting
marked.setOptions({
    breaks: true,
    gfm: true,
})

/**
 * Process HTML to prepare mermaid diagrams for rendering
 * Converts <pre><code class="language-mermaid">...</code></pre> to <div class="mermaid">...</div>
 */
function prepareMermaidDiagrams(html: string): string {
    // Match mermaid code blocks: <pre><code class="language-mermaid">...</code></pre>
    const mermaidRegex = /<pre><code class="language-mermaid">([\s\S]*?)<\/code><\/pre>/g

    return html.replace(mermaidRegex, (match, diagramCode) => {
        // Decode HTML entities and trim whitespace
        const decoded = diagramCode
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&')
            .trim()

        // Generate unique ID for this diagram
        const id = `mermaid-${Math.random().toString(36).slice(2, 11)}`

        // Return div that mermaid can render
        return `<div class="mermaid" id="${id}">${decoded}</div>`
    })
}

/**
 * Render markdown to HTML with Mermaid diagram support
 */
export function renderMarkdown(markdown: string): string {
    try {
        const html = typeof marked.parse(markdown) === 'string' 
            ? marked.parse(markdown) as string
            : String(marked.parse(markdown))
        return prepareMermaidDiagrams(html)
    } catch (error) {
        console.error('Error rendering markdown:', error)
        // Fallback: escape HTML and return as-is
        return markdown.replace(/</g, '&lt;').replace(/>/g, '&gt;')
    }
}
