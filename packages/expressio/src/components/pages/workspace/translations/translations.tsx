import {$s} from '@/app'
import {ws} from '@garage44/common/app'
import {pathCreate, pathDelete, pathUpdate} from '@garage44/common/lib/paths.ts'
import type {EnolaTag} from '../../../../../lib/enola/types.ts'
import {GroupActions} from '@/components/elements/group-actions/group-actions'
import {Button, FieldText, Icon} from '@garage44/common/components'
import {TranslationGroup} from '@/components/elements'
import classnames from 'classnames'
import {events} from '@garage44/common/app'
import {useEffect} from 'preact/hooks'

// Define interface for the tag object
interface TagData {
    path: string[]
    value: EnolaTag
}

export function WorkspaceTranslations() {
    // Component is not rendered while the workspace is not set
    if (!$s.workspace) return null

    // Add keyboard event handler for undo/redo
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Only process if we have a workspace
            if (!$s.workspace) return

            // Ignore events in input fields or content editable elements
            if (
                e.target instanceof HTMLInputElement ||
                e.target instanceof HTMLTextAreaElement ||
                (e.target instanceof HTMLElement && e.target.isContentEditable)
            ) {
                return
            }

            // Check for undo: Ctrl+Z (or Cmd+Z on Mac)
            if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
                // Prevent browser's default undo
                e.preventDefault()
                ws.post(`/api/workspaces/${$s.workspace.config.workspace_id}/undo`, {})
            }

            /*
             * Check for redo: Ctrl+Shift+Z (or Cmd+Shift+Z on Mac)
             * Also support Ctrl+Y as an alternative
             */
            if (
                ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'z') ||
                ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'y')
            ) {
                // Prevent browser's default redo
                e.preventDefault()
                ws.post(`/api/workspaces/${$s.workspace.config.workspace_id}/redo`, {})
            }
        }

        // Add event listener
        window.addEventListener('keydown', handleKeyDown)
        // Clean up event listener when component unmounts
        return () => {
            window.removeEventListener('keydown', handleKeyDown)
        }
        // Empty dependency array means this runs once on mount
    }, [])

    return (
<div class='c-translations'>
        <div className={classnames('workspace-info', {disabled: !$s.workspace})}>
            <GroupActions className='horizontal' group={$s.workspace.i18n} path={[]} />
            <div className='history-actions'>
                <Icon
                    name='chevron_left'
                    onClick={async() => {
                        ws.post(`/api/workspaces/${$s.workspace.config.workspace_id}/undo`, {})
                    }}
                    tip='History'
                    type='info'
                />
                <Icon
                    name='history'
                    tip='History'
                    type='info'
                />
                <Icon
                    name='chevron_right'
                    onClick={async() => {
                        ws.post(`/api/workspaces/${$s.workspace.config.workspace_id}/redo`, {})
                    }}
                    tip='History'
                    type='info'
                />
            </div>
            <div className='translation-controls'>
                <FieldText
                    model={$s.$filter}
                    placeholder='Filter tag, translation or group...'
                />
                <Button
                    icon={$s.sort === 'asc' ? 'arrow_up_circle_ouline' : 'arrow_down_circle_outline'}
                    label={`Sort: ${$s.sort === 'asc' ? 'A-Z' : 'Z-A'}`}
                    onClick={() => $s.sort = ($s.sort === 'asc' ? 'desc' : 'asc')}
                    type='info'
                />
            </div>
        </div>

        <TranslationGroup
            filter={$s.filter}
            group={{_id: 'root', ...$s.workspace.i18n}}
            path={[]}
            sort={$s.sort}
        />
</div>
    )
}

events.on('app:init', () => {
    ws.on('/i18n/sync', ({create_tags, delete_tags, modify_tags}) => {
        for (const tag of create_tags) {
            const {path, value}: TagData = tag
            const targetLanguagesArray = Array.isArray($s.workspace.config.languages.target) ?
                    Array.from($s.workspace.config.languages.target) :
                    []
            const targetLanguages = targetLanguagesArray as unknown as Array<{
                engine: 'anthropic' | 'deepl'
                formality: 'default' | 'more' | 'less'
                id: string
                name: string
            }>
            pathCreate(
                $s.workspace.i18n,
                path,
                value as unknown as {cache?: string; source: string; target: Record<string, string>},
                targetLanguages,
                value.target,
            )
        }
        for (const tag of delete_tags) {
            const {path}: {path: string[]} = tag
            pathDelete($s.workspace.i18n, path)
        }

        for (const tag of modify_tags) {
            const {path, value}: TagData = tag
            pathUpdate($s.workspace.i18n, path, value as unknown as Record<string, unknown>)
        }
    })

    // Add handler for full i18n state updates
    ws.on('/i18n/state', ({i18n, timestamp, workspace_id}) => {
        // Only apply updates for the current workspace
        if (!$s.workspace || $s.workspace.config.workspace_id !== workspace_id) {
            return
        }

        /*
         * Check if this update is newer than our current state
         * This prevents race conditions if messages arrive out of order
         */
        const workspaceWithTime = $s.workspace as typeof $s.workspace & {lastStateUpdateTime?: number}
        if (!workspaceWithTime.lastStateUpdateTime || timestamp > (workspaceWithTime.lastStateUpdateTime ?? 0)) {
            // Apply the update
            $s.workspace.i18n = i18n
            workspaceWithTime.lastStateUpdateTime = timestamp
        }
    })

    // Add handler for undo/redo responses
    ws.on('/i18n/history', ({success}) => {
        if (success) {
            // The state update will come through the /i18n/state handler
        }
    })
})
