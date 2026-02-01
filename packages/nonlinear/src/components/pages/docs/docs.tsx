import {$s} from '@/app'
import {api, ws} from '@garage44/common/app'
import {Icon} from '@garage44/common/components'
import {deepSignal} from 'deepsignal'
import {useEffect} from 'preact/hooks'
import {Markdown} from './markdown'
import {DocEditor} from './editor'
import './docs.css'

// Use api for public access, ws for authenticated
const getApi = () => ($s.profile.authenticated ? ws : api)

interface Doc {
    id: string
    path: string
    title: string
    content: string
    tags?: string[]
    labelDefinitions?: Array<{color: string; name: string}>
}

// State defined outside component
const state = deepSignal({
    docs: [] as Doc[],
    selectedDoc: null as Doc | null,
    loading: true,
    editing: false,
    searchQuery: '',
    filterTags: [] as string[],
})

export const Docs = () => {
    useEffect(() => {
        loadDocs()
    }, [])

    const loadDocs = async() => {
        try {
            state.loading = true
            const apiClient = getApi()
            const result = await apiClient.get('/api/docs')
            if (result.docs) {
                state.docs = result.docs
            }
        } catch (error) {
            console.error('Failed to load docs:', error)
        } finally {
            state.loading = false
        }
    }

    const handleDocSelect = async(path: string) => {
        try {
            const apiClient = getApi()
            const url = `/api/docs/by-path?path=${encodeURIComponent(path)}`
            console.log('[Docs] Loading doc:', {path, url, apiClient: apiClient === ws ? 'ws' : 'api', authenticated: $s.profile.authenticated})
            const result = await apiClient.get(url)
            console.log('[Docs] Result:', result)
            if (result?.doc) {
                state.selectedDoc = result.doc
                state.editing = false
            } else if (result?.error) {
                console.error('[Docs] API error:', result.error)
            } else {
                console.warn('[Docs] Unexpected result format:', result)
            }
        } catch (error) {
            console.error('[Docs] Failed to load doc:', error)
        }
    }

    const handleEdit = () => {
        state.editing = true
    }

    const handleSave = async(content: string, tags: string[]) => {
        if (!state.selectedDoc) return

        try {
            const result = await ws.put(`/api/docs/${state.selectedDoc.id}`, {
                content,
                tags,
            })
            if (result.doc) {
                state.selectedDoc = result.doc
                state.editing = false
                // Reload docs list
                await loadDocs()
            }
        } catch (error) {
            console.error('Failed to save doc:', error)
        }
    }

    const handleCancel = () => {
        state.editing = false
    }

    // Build tree structure from paths
    const buildTree = () => {
        const tree: Record<string, any> = {}

        for (const doc of state.docs) {
            const parts = doc.path.split('/').filter(Boolean)
            let current = tree

            for (let i = 0; i < parts.length; i++) {
                const part = parts[i]
                if (i === parts.length - 1) {
                    // Last part is the doc
                    current[part] = doc
                } else {
                    if (!current[part]) {
                        current[part] = {}
                    }
                    current = current[part]
                }
            }
        }

        return tree
    }

    const renderTree = (node: any, path: string = '', depth: number = 0): any[] => {
        const items: any[] = []

        for (const [key, value] of Object.entries(node)) {
            const currentPath = path ? `${path}/${key}` : key

            if (value && typeof value === 'object' && 'id' in value) {
                // It's a doc
                items.push({
                    type: 'doc',
                    doc: value,
                    path: currentPath,
                    depth,
                })
            } else if (value && typeof value === 'object') {
                // It's a directory
                items.push({
                    type: 'dir',
                    name: key,
                    path: currentPath,
                    depth,
                })
                items.push(...renderTree(value, currentPath, depth + 1))
            }
        }

        return items
    }

    const tree = buildTree()
    const treeItems = renderTree(tree)

    // Filter by search query and tags
    let filteredItems = treeItems
    if (state.searchQuery) {
        const query = state.searchQuery.toLowerCase()
        filteredItems = filteredItems.filter((item) => {
            if (item.type === 'doc') {
                return (
                    item.doc.title.toLowerCase().includes(query) ||
                    item.doc.path.toLowerCase().includes(query) ||
                    item.doc.content.toLowerCase().includes(query)
                )
            }
            return item.name.toLowerCase().includes(query)
        })
    }

    if (state.filterTags.length > 0) {
        filteredItems = filteredItems.filter((item) => {
            if (item.type === 'doc') {
                return state.filterTags.some((tag) => item.doc.tags?.includes(tag))
            }
            return true
        })
    }

    return (
        <div class="c-docs">
            <div class="sidebar">
                <div class="search">
                    <input
                        type="text"
                        placeholder="Search documentation..."
                        value={state.searchQuery}
                        onInput={(e) => {
                            state.searchQuery = (e.target as HTMLInputElement).value
                        }}
                    />
                </div>

                <div class="tree">
                    {state.loading ? (
                        <div class="loading">Loading...</div>
                    ) : (
                        <ul>
                            {filteredItems.map((item) => {
                                if (item.type === 'dir') {
                                    return (
                                        <li key={item.path} class="dir" style={`padding-left: ${item.depth * 16}px`}>
                                            <Icon name="folder" type="info" />
                                            <span>{item.name}</span>
                                        </li>
                                    )
                                }

                                const isSelected = state.selectedDoc?.path === item.doc.path
                                return (
                                    <li
                                        key={item.doc.id}
                                        class={isSelected ? 'selected' : ''}
                                        style={`padding-left: ${item.depth * 16}px`}
                                        onClick={() => handleDocSelect(item.doc.path)}
                                    >
                                        <Icon name="description" type="info" />
                                        <span>{item.doc.title}</span>
                                    </li>
                                )
                            })}
                        </ul>
                    )}
                </div>
            </div>

            <div class="content">
                {state.selectedDoc ? (
                    state.editing ? (
                        <DocEditor
                            doc={state.selectedDoc}
                            onSave={handleSave}
                            onCancel={handleCancel}
                        />
                    ) : (
                        <div class="doc-viewer">
                            <div class="doc-header">
                                <h1>{state.selectedDoc.title}</h1>
                                {$s.profile.authenticated && (
                                    <button onClick={handleEdit}>
                                        <Icon name="edit" type="info" />
                                        Edit
                                    </button>
                                )}
                            </div>
                            <div class="doc-tags">
                                {state.selectedDoc.labelDefinitions?.map((def) => (
                                    <span
                                        key={def.name}
                                        class="tag"
                                        style={`background-color: ${def.color}`}
                                    >
                                        {def.name}
                                    </span>
                                ))}
                            </div>
                            <Markdown content={state.selectedDoc.content} />
                        </div>
                    )
                ) : (
                    <div class="empty">
                        <Icon name="description" type="info" size="xl" />
                        <p>Select a document to view</p>
                    </div>
                )}
            </div>
        </div>
    )
}
