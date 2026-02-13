import classnames from 'classnames'

import {$s} from '@/app'

export function TranslationResult({
    group,
    path,
}: {
    group: {_collapsed?: boolean; target: Record<string, string>}
    path?: string[]
}) {
    const pathStr = path?.join('.') ?? ''
    return (
        <div
            class={classnames(
                'c-translation-result',
                {
                    collapsed: group._collapsed,
                },
                {
                    'tag-updated': $s.tags.updated === pathStr,
                },
            )}
        >
            <div class='wrapper'>
                {$s.workspace.config.languages.target.map((language) => (
                    <div class='result' key={language.id}>
                        <div class='id'>{language.id}</div>
                        <div class='value'>{group.target[language.id] || '-'}</div>
                    </div>
                ))}
            </div>
        </div>
    )
}
