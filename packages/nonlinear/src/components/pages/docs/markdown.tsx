import {marked} from 'marked'
import './markdown.css'

interface MarkdownProps {
    content: string
}

export const Markdown = ({content}: MarkdownProps) => {
    const html = marked(content)

    return (
        <div
            class="markdown-content"
            dangerouslySetInnerHTML={{__html: html}}
        />
    )
}
