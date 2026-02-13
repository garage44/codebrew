import {ws} from '@garage44/common/app'
import {Icon} from '@garage44/common/components'
import {mergeDeep} from '@garage44/common/lib/utils'
import classnames from 'classnames'
import {deepSignal} from 'deepsignal'
import {useEffect} from 'preact/hooks'

const state = deepSignal({
    current: {
        path: '',
        workspace: null as string | null,
    },
    directories: [] as Array<{is_workspace?: boolean; name: string; path: string}>,
    loading: false,
    parentPath: '',
})

async function loadDirectory(path: string | null = null) {
    state.loading = true
    try {
        const response = (await ws.get('/api/workspaces/browse', {
            path,
        })) as {
            current: {path: string; workspace: unknown}
            directories: {is_workspace?: boolean; name: string; path: string}[]
            parent: string
        }

        mergeDeep(state, {
            current: {
                path: (response.current as {path?: string}).path ?? '',
                workspace: (response.current as {workspace?: string | null}).workspace ?? null,
            },
            directories: response.directories as Array<{is_workspace?: boolean; name: string; path: string}>,
            parentPath: response.parent as string,
        })
    } catch (error) {
        // oxlint-disable-next-line no-console
        console.error('Failed to load directory:', error)
    }
    state.loading = false
}

export function DirectoryBrowser({onSelect}: {onSelect: (current: {path: string; workspace: string | null}) => void}) {
    useEffect(() => {
        loadDirectory()
    }, [])

    return (
        <div class='c-directory-browser'>
            <div class='add-path'>
                <Icon
                    name='arrow_left_circle_outline'
                    onClick={() => onSelect(state.current)}
                    tip={(() => {
                        if (state.current.workspace) {
                            return 'Add directory to workspaces'
                        }
                        return 'Create new workspace'
                    })()}
                    type='info'
                />
            </div>
            <div class='wrapper'>
                <div class='current-path'>{state.current.path}</div>
                <div class='directory-list'>
                    {state.parentPath && (
                        <div class='directory-item'>
                            <div class='directory' onClick={() => loadDirectory(state.parentPath || null)}>
                                ..
                            </div>
                        </div>
                    )}
                    {state.directories.map((dir) => (
                        <div
                            class={classnames('directory', {'is-workspace': dir.is_workspace})}
                            onClick={() => loadDirectory(dir.path)}
                            key={dir.path}
                        >
                            {dir.name}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}
