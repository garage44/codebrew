import {api, notifier, $t} from '@garage44/common/app'
import {Icon} from '@garage44/common/components'
import {useEffect, useState} from 'preact/hooks'

import {$s} from '@/app'

interface RecordingsProps {
    groupId?: string
}

interface Recording {
    atime: string
    extension: string
    filename: string
    size: number
}

export default function Recordings({groupId}: RecordingsProps) {
    const [recordings, setRecordings] = useState<Recording[]>([])

    const loadRecordings = async (group: string) => {
        if (!group) return
        const data = await api.get(`/api/recordings/${group}`)
        setRecordings(data || [])
    }

    const deleteRecording = async (rec: Recording) => {
        if (!groupId) return
        await api.get(`/api/recordings/${groupId}/${rec.filename}.${rec.extension}/delete`)
        notifier.notify({
            level: 'info',
            message: $t('group.recording.deleted', {recording: rec.filename}),
        })
        // Reload recordings after deletion
        loadRecordings(groupId)
    }

    useEffect(() => {
        if (groupId) {
            loadRecordings(groupId)
        }
    }, [groupId])

    if (!recordings.length) {
        return (
            <section class='c-admin-recordings tab-content active no-results'>
                <Icon className='icon icon-l' name='record' />
                <span>{$t('group.recording.no_recordings')}</span>
            </section>
        )
    }

    return (
        <section class='c-admin-recordings tab-content active'>
            {recordings.map((rec) => (
                <div class='recording' key={`${rec.filename}.${rec.extension}`}>
                    <div class='actions'>
                        <button class='btn btn-menu btn-small' onClick={() => deleteRecording(rec)}>
                            <Icon className='icon-s' name='trash' tip={$t('group.recording.delete')} />
                        </button>
                        <a
                            class='btn btn-menu btn-small'
                            download={`${rec.filename}.${rec.extension}`}
                            href={`/api/recordings/${$s.admin.group._name}/${rec.filename}.${rec.extension}`}
                        >
                            <Icon className='icon-s' name='download' tip={$t('group.recording.download')} />
                        </a>
                    </div>
                    <video
                        controls
                        src={`/api/recordings/${
                            typeof $s.admin.group === 'object' && $s.admin.group !== null && '_name' in $s.admin.group
                                ? String($s.admin.group._name)
                                : ''
                        }/${rec.filename}.${rec.extension}`}
                    >
                        <source
                            src={`/api/recordings/${
                                typeof $s.admin.group === 'object' && $s.admin.group !== null && '_name' in $s.admin.group
                                    ? String($s.admin.group._name)
                                    : ''
                            }/${rec.filename}.${rec.extension}`}
                            type='video/webm'
                        />
                    </video>
                    <div class='info'>
                        <div class='line'>
                            <div class='key'>{$t('file.name')}</div>
                            <div class='value'>{rec.filename}</div>
                        </div>

                        <div class='line'>
                            <div class='key'>{$t('type.type')}</div>
                            <div class='value'>{rec.extension}</div>
                        </div>

                        <div class='line'>
                            <div class='key'>{$t('file.size')}</div>
                            <div class='value'>{(rec.size / 1024 / 1024).toFixed(2)} MB</div>
                        </div>

                        <div class='line'>
                            <div class='key'>{$t('file.modified')}</div>
                            <div class='value'>{rec.atime}</div>
                        </div>
                    </div>
                </div>
            ))}
        </section>
    )
}
