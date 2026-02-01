import {deepSignal} from 'deepsignal'
import {useRef} from 'preact/hooks'
import {Icon} from '@garage44/common/components'

interface Doc {
    id: string
    path: string
    title: string
    content: string
    tags?: string[]
}

interface DocEditorProps {
    doc: Doc
    onSave: (content: string, tags: string[]) => void
    onCancel: () => void
}

const editorState = deepSignal({
    content: '',
    tags: [] as string[],
})

export const DocEditor = ({doc, onSave, onCancel}: DocEditorProps) => {
    // Initialize state from doc
    if (editorState.content !== doc.content) {
        editorState.content = doc.content
        editorState.tags = doc.tags || []
    }

    const handleSave = () => {
        onSave(editorState.content, editorState.tags)
    }

    const handleTagAdd = (tag: string) => {
        if (tag && !editorState.tags.includes(tag)) {
            editorState.tags = [...editorState.tags, tag]
        }
    }

    const handleTagRemove = (tag: string) => {
        editorState.tags = editorState.tags.filter((t) => t !== tag)
    }

    return (
        <div class="c-doc-editor">
            <div class="editor-header">
                <h2>Edit: {doc.title}</h2>
                <div class="actions">
                    <button onClick={onCancel}>
                        <Icon name="close" type="info" />
                        Cancel
                    </button>
                    <button onClick={handleSave} class="primary">
                        <Icon name="check" type="info" />
                        Save
                    </button>
                </div>
            </div>

            <div class="editor-content">
                <div class="field">
                    <label>Content (Markdown)</label>
                    <textarea
                        value={editorState.content}
                        onInput={(e) => {
                            editorState.content = (e.target as HTMLTextAreaElement).value
                        }}
                        rows={20}
                    />
                </div>

                <div class="field">
                    <label>Tags</label>
                    <div class="tags-input">
                        <input
                            type="text"
                            placeholder="Add tag (use hyphens, e.g., type:adr)"
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault()
                                    const tag = (e.target as HTMLInputElement).value.trim()
                                    if (tag) {
                                        handleTagAdd(tag)
                                        ;(e.target as HTMLInputElement).value = ''
                                    }
                                }
                            }}
                        />
                        <div class="tags-list">
                            {editorState.tags.map((tag) => (
                                <span key={tag} class="tag">
                                    {tag}
                                    <button
                                        onClick={() => handleTagRemove(tag)}
                                        class="tag-remove"
                                    >
                                        ×
                                    </button>
                                </span>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
