import {ws} from '@garage44/common/app'
import {FieldText} from '@garage44/common/components'
import {pathHas} from '@garage44/common/lib/paths'
import {signal} from '@preact/signals'
import classnames from 'classnames'
import {useRef} from 'preact/hooks'

import {$s} from '@/app'
import {Translation} from '@/components/elements'
import {tag_updated} from '@/lib/ui'

import {GroupActions} from '../group-actions/group-actions'

interface TranslationGroupType {
    [key: string]: unknown
    _id: string
    source?: string
}

function groupMatchesFilter(group: TranslationGroupType, id: string, filter: string): boolean {
    const filterLower = filter.toLowerCase()
    // Match id
    if (id.toLowerCase().includes(filterLower)) {
        return true
    }
    // Match source
    if (typeof group.source === 'string' && group.source.toLowerCase().includes(filterLower)) {
        return true
    }
    // Match any translation value
    if (group.target && typeof group.target === 'object') {
        for (const val of Object.values(group.target)) {
            if (typeof val === 'string' && val.toLowerCase().includes(filterLower)) {
                return true
            }
        }
    }
    // Recursively check subgroups
    for (const [subId, subGroup] of Object.entries(group)) {
        if (
            !subId.startsWith('_') &&
            typeof subGroup === 'object' &&
            groupMatchesFilter(subGroup as TranslationGroupType, subId, filter)
        ) {
            return true
        }
    }
    return false
}

function GroupIdField({group, path}: {group: TranslationGroupType; path: string[]}) {
    const idSignalRef = useRef(signal(group._id))
    idSignalRef.current.value = group._id
    return (
        <FieldText
            className='group-field'
            model={idSignalRef.current}
            onBlur={async () => {
                const oldPath = path
                const newPath = [...path.slice(0, -1), idSignalRef.current.value]
                if (oldPath.join('.') !== newPath.join('.')) {
                    await ws.put(`/api/workspaces/${$s.workspace.config.workspace_id}/paths`, {
                        new_path: newPath,
                        old_path: oldPath,
                    })
                }
                tag_updated(newPath.join('.'))
            }}
            transform={(value) => value.toLocaleLowerCase().replaceAll(' ', '_')}
        />
    )
}

export function TranslationGroup({
    filter = '',
    group,
    level = 0,
    path,
    sort = 'asc',
}: {
    filter?: string
    group: TranslationGroupType
    level?: number
    path: string[]
    sort?: 'asc' | 'desc'
}) {
    // Determine if this group matches the filter
    const groupItselfMatches = filter ? groupMatchesFilter(group, group._id || path.at(-1) || '', filter) : true

    // At each level, only show entries that match or have matching descendants
    let entries: [string, unknown][] = Object.entries(group)
        .filter(([id, subGroup]) => {
            if (id.startsWith('_')) {
                return false
            }
            if (!filter) {
                return true
            }
            // If this group matches, show all its children
            if (groupItselfMatches && level > 0) {
                return true
            }
            // Otherwise, only show entries that match or have matching descendants
            return groupMatchesFilter(subGroup as TranslationGroupType, id, filter)
        })
        .toSorted(([idA], [idB]) => {
            return sort === 'asc' ? idA.localeCompare(idB) : idB.localeCompare(idA)
        })

    // If filter is active, auto-expand groups with matches
    const autoExpand = !!filter
    const collapsed = autoExpand ? false : group._collapsed

    return (
        <div
            class={classnames('c-translation-group', `level-${level}`, {
                collapsed,
                'has-redundant': pathHas($s.workspace.i18n, path, '_redundant'),
                'has-soft': pathHas($s.workspace.i18n, path, '_soft'),
                'tag-updated': $s.tags.updated === path.join('.'),
            })}
        >
            {level > 0 && (
                <div class='group-id'>
                    <GroupActions className='vertical' group={group} path={path} />
                    {path.length > 0 && <GroupIdField group={group} path={path} />}
                </div>
            )}
            <div class='group-value'>
                {entries.map(([id, subGroup]) => {
                    const typedSubGroup = subGroup as TranslationGroupType
                    if ('source' in typedSubGroup) {
                        return <Translation group={typedSubGroup} key={id} path={[...path, id]} />
                    }

                    return (
                        <TranslationGroup
                            filter={filter}
                            group={typedSubGroup}
                            key={id}
                            level={level + 1}
                            path={[...path, id]}
                            sort={sort}
                        />
                    )
                })}
            </div>
        </div>
    )
}
