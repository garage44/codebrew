import {$s} from '@/app'
import {api, notifier, ws} from '@garage44/common/app'
import {Button, FieldSelect, FieldText} from '@garage44/common/components'
import {deepSignal} from 'deepsignal'
import {useRef, useState} from 'preact/hooks'

// State defined outside component for stability
const createFormState = () => deepSignal({
    loading: false,
    name: '',
    path: '',
    platform: 'local' as 'github' | 'gitlab' | 'local',
    remote_url: '',
})

export function Repositories() {
    const formStateRef = useRef(createFormState())
    const formState = formStateRef.current
    const [discovering, setDiscovering] = useState(false)
    const [discoveredRepos, setDiscoveredRepos] = useState<Array<{name: string; path: string}>>([])
    const [searchPath, _setSearchPath] = useState('')

    const handleAddRepository = async() => {
        if (!formState.name || !formState.path) {
            notifier.notify({
                icon: 'error',
                message: 'Name and path are required',
                type: 'error',
            })
            return
        }

        formState.loading = true
        try {
            const result = await api.post('/api/repositories', {
                name: formState.name,
                path: formState.path,
                platform: formState.platform,
                remote_url: formState.remote_url || null,
            })

            if (result.repository) {
                // Reload repositories list to ensure UI updates
                const reposResult = await api.get('/api/repositories')
                if (reposResult.repositories) {
                    $s.repositories = reposResult.repositories
                }

                notifier.notify({
                    icon: 'check_circle',
                    message: `Repository "${formState.name}" added successfully`,
                    type: 'success',
                })
                // Reset form
                formState.name = ''
                formState.path = ''
                formState.platform = 'local'
                formState.remote_url = ''
            }
        } catch(error) {
            notifier.notify({
                icon: 'error',
                message: error instanceof Error ? error.message : 'Failed to add repository',
                type: 'error',
            })
        } finally {
            formState.loading = false
        }
    }

    const handleDeleteRepository = async(repoId: string) => {
        if (!confirm('Are you sure you want to delete this repository?')) {
            return
        }

        try {
            await api.delete(`/api/repositories/${repoId}`, {})
            // Reload repositories list to ensure UI updates
            const reposResult = await api.get('/api/repositories')
            if (reposResult.repositories) {
                $s.repositories = reposResult.repositories
            }

            notifier.notify({
                icon: 'check_circle',
                message: 'Repository deleted successfully',
                type: 'success',
            })
        } catch(error) {
            notifier.notify({
                icon: 'error',
                message: error instanceof Error ? error.message : 'Failed to delete repository',
                type: 'error',
            })
        }
    }

    const handleDiscoverRepositories = async() => {
        setDiscovering(true)
        setDiscoveredRepos([])

        try {
            const result = await ws.post('/api/repositories/discover', {
                searchPath: searchPath || undefined,
            })

            if (result.discovered) {
                setDiscoveredRepos(result.discovered as Array<{name: string; path: string}>)
                notifier.notify({
                    icon: 'check_circle',
                    message: `Found ${(result.discovered as Array<unknown>).length} repositories`,
                    type: 'success',
                })
            }
        } catch(error) {
            notifier.notify({
                icon: 'error',
                message: error instanceof Error ? error.message : 'Failed to discover repositories',
                type: 'error',
            })
        } finally {
            setDiscovering(false)
        }
    }

    const handleAddDiscoveredRepository = async(repo: {name: string; path: string}) => {
        formState.name = repo.name
        formState.path = repo.path
        formState.platform = 'local'

        // Auto-submit
        await handleAddRepository()

        // Remove from discovered list
        setDiscoveredRepos(discoveredRepos.filter((r) => r.path !== repo.path))
    }

    const platformOptions = [
        {id: 'local', name: 'Local'},
        {id: 'github', name: 'GitHub'},
        {id: 'gitlab', name: 'GitLab'},
    ]

    return (
        <section class='c-repositories-tab'>
            <div class='section'>
                <h2 class='section-title'>Discover Repositories</h2>
                <div class='form'>
                    <FieldText
                        help='Path to search for git repositories (leave empty to search current directory)'
                        label='Search Path'
                        model={deepSignal({value: searchPath}).$value}
                        placeholder='/path/to/search'
                    />
                    <div class='actions'>
                        <Button
                            disabled={discovering}
                            icon='search'
                            label={discovering ? 'Discovering...' : 'Discover Repositories'}
                            onClick={handleDiscoverRepositories}
                            variant='menu'
                        />
                    </div>
                    {discoveredRepos.length > 0 &&
                        <div class='discovered-repos'>
                            <h3>Discovered Repositories</h3>
                            <div class='discovered-repos-list'>
                                {discoveredRepos.map((repo) => <div class='discovered-repo-item' key={repo.path}>
                                        <div class='discovered-repo-info'>
                                            <strong>{repo.name}</strong>
                                            <span class='discovered-repo-path'>{repo.path}</span>
                                        </div>
                                        <Button
                                            icon='add'
                                            onClick={() => handleAddDiscoveredRepository(repo)}
                                            tip='Add repository'
                                            variant='toggle'
                                        />
                                </div>)}
                            </div>
                        </div>}
                </div>
            </div>

            <div class='section'>
                <h2 class='section-title'>Add Repository</h2>
                <div class='form'>
                    <FieldText
                        label='Name'
                        model={formState.$name}
                        placeholder='Repository name'
                    />
                    <FieldText
                        help='Path to git repository'
                        label='Path'
                        model={formState.$path}
                        placeholder='/path/to/repository'
                    />
                    <FieldSelect
                        help='Git platform for this repository'
                        label='Platform'
                        model={formState.$platform}
                        options={platformOptions}
                    />
                    <FieldText
                        help='Optional remote URL (e.g., https://github.com/user/repo.git)'
                        label='Remote URL'
                        model={formState.$remote_url}
                        placeholder='https://github.com/user/repo.git'
                    />
                    <div class='actions'>
                        <Button
                            disabled={formState.loading}
                            icon='add'
                            label={formState.loading ? 'Adding...' : 'Add Repository'}
                            onClick={() => handleAddRepository()}
                            variant='menu'
                        />
                    </div>
                </div>
            </div>

            <div class='section'>
                <h2 class='section-title'>Repositories</h2>
                {$s.repositories.length === 0 ?

                            <div class='empty-state'>
                                <p>No repositories added yet.</p>
                            </div> :

                        <div class='repositories-list'>
                            {$s.repositories.map((repo) => <div class='repository-item' key={repo.id}>
                                    <div class='repository-info'>
                                        <h3 class='repository-name'>{repo.name}</h3>
                                        <p class='repository-path'>{repo.path}</p>
                                        <div class='repository-meta'>
                                            <span class='platform-badge'>{repo.platform}</span>
                                            {repo.remote_url &&
                                                <span class='remote-url'>{repo.remote_url}</span>}
                                        </div>
                                    </div>
                                    <div class='repository-actions'>
                                        <Button
                                            icon='trash'
                                            onClick={() => handleDeleteRepository(repo.id)}
                                            tip='Delete repository'
                                            type='danger'
                                            variant='toggle'
                                        />
                                    </div>
                            </div>)}
                        </div>}
            </div>
        </section>
    )
}
