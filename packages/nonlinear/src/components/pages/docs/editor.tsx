import {deepSignal} from 'deepsignal'
import {Icon} from '@garage44/common/components'

interface Doc {
    content: string
    id: string
    path: string
    tags?: string[]
    title: string
}

interface DocEditorProps {
    doc: Doc
    onCancel: () => void
    onSave: (content: string, tags: string[]) => void
}

const editorState = deepSignal({
    content: '',
    tags: [] as string[],
})

export const DocEditor = ({doc, onCancel, onSave}: DocEditorProps) => {
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
        <div class='c-doc-editor'>
            <div class='editor-header'>
                <h2>Edit: {doc.title}</h2>
                <div class='actions'>
                    <button onClick={onCancel}>
                        <Icon name='close' type='info' />
                        Cancel
                    </button>
                    <button class='primary' onClick={handleSave}>
                        <Icon name='check' type='info' />
                        Save
                    </button>
                </div>
            </div>

            <div class='editor-content'>
                <div class='field'>
                    <label>Content (Markdown)</label>
                    <textarea
                        onInput={(e) => {
                            editorState.content = (e.target as HTMLTextAreaElement).value
                        }}
                        rows={20}
                        value={editorState.content}
                    />
                </div>

                <div class='field'>
                    <label>Tags</label>
                    <div class='tags-input'>
                        <input
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault()
                                    const tag = (e.target as HTMLInputElement).value.trim()
                                    if (tag) {
                                        handleTagAdd(tag);
                                        (e.target as HTMLInputElement).value = ''
                                    }
                                }
                            }}
                            placeholder='Add tag (use hyphens, e.g., type:adr)'
                            type='text'
                        />
                        <div class='tags-list'>
                            {editorState.tags.map((tag) => <span class='tag' key={tag}>
                                    {tag}
                                    <button
                                        class='tag-remove'
                                        onClick={() => handleTagRemove(tag)}
                                    >
                                        ×
                                    </button>
                            </span>)}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
