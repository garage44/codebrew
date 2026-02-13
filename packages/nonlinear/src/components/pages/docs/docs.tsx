import {api, ws} from '@garage44/common/app'
import {Icon} from '@garage44/common/components'
import {deepSignal} from 'deepsignal'
import {useEffect} from 'preact/hooks'

import {$s} from '@/app'

import {DocEditor} from './editor'
import {Markdown} from './markdown'
import './docs.css'

// Use api for public access, ws for authenticated
const getApi = () => {
    return $s.profile.authenticated ? ws : api
}

interface Doc {
    content: string
    id: string
    labelDefinitions?: Array<{color: string; name: string}>
    path: string
    tags?: string[]
    title: string
}

// State defined outside component
const state = deepSignal({
    docs: [] as Doc[],
    editing: false,
    filterTags: [] as string[],
    loading: true,
    searchQuery: '',
    selectedDoc: null as Doc | null,
})

export const Docs = () => {
    useEffect(() => {
        loadDocs()
    }, [])

    const loadDocs = async () => {
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

    const handleDocSelect = async (path: string) => {
        try {
            const apiClient = getApi()
            const url = `/api/docs/by-path?path=${encodeURIComponent(path)}`
            console.log('[Docs] Loading doc:', {
                apiClient: apiClient === ws ? 'ws' : 'api',
                authenticated: $s.profile.authenticated,
                path,
                url,
            })
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

    const handleSave = async (content: string, tags: string[]) => {
        if (!state.selectedDoc) return

        try {
            const result = await ws.put(`/api/docs/${state.selectedDoc.id}`, {
                content,
                tags,
            })
            if (result.doc) {
                state.selectedDoc = result.doc as Doc
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
        const tree: Record<string, Doc | Record<string, unknown>> = {}

        for (const doc of state.docs) {
            const parts = doc.path.split('/').filter(Boolean)
            let current = tree

            for (let i = 0; i < parts.length; i++) {
                const part = parts[i]
                if (i === parts.length - 1) {
                    // Last part is the doc
                    current[part] = doc as Doc | Record<string, unknown>
                } else {
                    if (!current[part]) {
                        current[part] = {}
                    }
                    current = current[part] as Record<string, Doc | Record<string, unknown>>
                }
            }
        }

        return tree
    }

    const renderTree = (
        node: Record<string, Doc | Record<string, unknown>>,
        path: string = '',
        depth: number = 0,
    ): Array<{depth: number; doc?: Doc; name?: string; path: string; type: 'doc' | 'dir'}> => {
        const items: Array<{depth: number; doc?: Doc; name?: string; path: string; type: 'doc' | 'dir'}> = []

        for (const [key, value] of Object.entries(node)) {
            const currentPath = path ? `${path}/${key}` : key

            if (value && typeof value === 'object' && 'id' in value) {
                // It's a doc
                items.push({
                    depth,
                    doc: value as Doc,
                    path: currentPath,
                    type: 'doc',
                })
            } else if (value && typeof value === 'object') {
                // It's a directory
                items.push({
                    depth,
                    name: key,
                    path: currentPath,
                    type: 'dir',
                })
                items.push(...renderTree(value as Record<string, Doc | Record<string, unknown>>, currentPath, depth + 1))
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
        <div class='c-docs'>
            <div class='sidebar'>
                <div class='search'>
                    <input
                        onInput={(e) => {
                            state.searchQuery = (e.target as HTMLInputElement).value
                        }}
                        placeholder='Search documentation...'
                        type='text'
                        value={state.searchQuery}
                    />
                </div>

                <div class='tree'>
                    {state.loading ? (
                        <div class='loading'>Loading...</div>
                    ) : (
                        <ul>
                            {filteredItems.map((item) => {
                                if (item.type === 'dir') {
                                    return (
                                        <li class='dir' key={item.path} style={`padding-left: ${item.depth * 16}px`}>
                                            <Icon name='folder' type='info' />
                                            <span>{item.name}</span>
                                        </li>
                                    )
                                }

                                const isSelected = state.selectedDoc?.path === item.doc.path
                                return (
                                    <li
                                        class={isSelected ? 'selected' : ''}
                                        key={item.doc.id}
                                        onClick={() => handleDocSelect(item.doc.path)}
                                        style={`padding-left: ${item.depth * 16}px`}
                                    >
                                        <Icon name='description' type='info' />
                                        <span>{item.doc.title}</span>
                                    </li>
                                )
                            })}
                        </ul>
                    )}
                </div>
            </div>

            <div class='content'>
                {state.selectedDoc ? (
                    state.editing ? (
                        <DocEditor doc={state.selectedDoc} onCancel={handleCancel} onSave={handleSave} />
                    ) : (
                        <div class='doc-viewer'>
                            <div class='doc-header'>
                                <h1>{state.selectedDoc.title}</h1>
                                {$s.profile.authenticated && (
                                    <button onClick={handleEdit}>
                                        <Icon name='edit' type='info' />
                                        Edit
                                    </button>
                                )}
                            </div>
                            <div class='doc-tags'>
                                {state.selectedDoc.labelDefinitions?.map((def) => (
                                    <span class='tag' key={def.name} style={`background-color: ${def.color}`}>
                                        {def.name}
                                    </span>
                                ))}
                            </div>
                            <Markdown content={state.selectedDoc.content} />
                        </div>
                    )
                ) : (
                    <div class='empty'>
                        <Icon name='description' size='xl' type='info' />
                        <p>Select a document to view</p>
                    </div>
                )}
            </div>
        </div>
    )
}
