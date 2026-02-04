import {FieldCheckbox, FieldMultiSelect, FieldNumber, FieldText} from '@garage44/common/components'
import {$t} from '@garage44/common/app'
import {$s} from '@/app'

export default function TabMisc() {
    const codecs = [
        {help: $t('group.settings.misc.codec_vp8_help'), id: 'vp8', name: 'VP8'},
        {help: $t('group.settings.misc.codec_vp9_help'), id: 'vp9', name: 'VP9'},
        {help: $t('group.settings.misc.codec_av1_help'), id: 'av1', name: 'AV1'},
        {help: $t('group.settings.misc.codec_h264_help'), id: 'h264', name: 'H264'},
        {help: $t('group.settings.misc.codec_opus_help'), id: 'opus', name: 'Opus'},
        {help: $t('group.settings.misc.codec_g722_help'), id: 'g722', name: 'G722'},
        {help: $t('group.settings.misc.codec_pcmu_help'), id: 'pcmu', name: 'PCMU'},
        {help: $t('group.settings.misc.codec_pcma_help'), id: 'pcma', name: 'PCMA'},
    ]

    return (
        <section class='c-admin-group-tab-misc tab-content active'>
            <FieldText
                help={$t('group.settings.misc.name_help')}
                label={$t('group.settings.misc.name_label')}
                onChange={(value) => {
                    const group = $s.admin.group as Record<string, unknown>
                    if (group) group._newName = value
                }}
                placeholder='...'
                value={typeof $s.admin.group === 'object' && $s.admin.group !== null && '_newName' in $s.admin.group ? String($s.admin.group._newName || '') : ''}
            />
            <FieldText
                help={$t('group.settings.misc.description_help')}
                label={$t('group.settings.misc.description_label')}
                onChange={(value) => {
                    const group = $s.admin.group as Record<string, unknown>
                    if (group) group.description = value
                }}
                placeholder='...'
                value={typeof $s.admin.group === 'object' && $s.admin.group !== null && 'description' in $s.admin.group ? String($s.admin.group.description || '') : ''}
            />
            <FieldText
                help={$t('group.settings.misc.contact_help')}
                label={$t('group.settings.misc.contact_label')}
                onChange={(value) => {
                    const group = $s.admin.group as Record<string, unknown>
                    if (group) group.contact = value
                }}
                placeholder='...'
                value={typeof $s.admin.group === 'object' && $s.admin.group !== null && 'contact' in $s.admin.group ? String($s.admin.group.contact || '') : ''}
            />
            <FieldText
                help={$t('group.settings.misc.comment_help')}
                label={$t('group.settings.misc.comment_label')}
                onChange={(value) => {
                    const group = $s.admin.group as Record<string, unknown>
                    if (group) group.comment = value
                }}
                placeholder='...'
                value={typeof $s.admin.group === 'object' && $s.admin.group !== null && 'comment' in $s.admin.group ? String($s.admin.group.comment || '') : ''}
            />
            <FieldCheckbox
                help={$t('group.settings.misc.recording_help')}
                label={$t('group.settings.misc.recording_label')}
                onChange={(value) => {
                    const group = $s.admin.group as Record<string, unknown>
                    if (group) group['allow-recording'] = value
                }}
                value={typeof $s.admin.group === 'object' && $s.admin.group !== null && 'allow-recording' in $s.admin.group ? Boolean($s.admin.group['allow-recording']) : false}
            />
            <FieldMultiSelect
                help={$t('group.settings.misc.codec_help')}
                label={$t('group.settings.misc.codec_label')}
                onChange={(value) => {
                    const group = $s.admin.group as Record<string, unknown>
                    if (group) group.codecs = value
                }}
                options={codecs}
                value={typeof $s.admin.group === 'object' && $s.admin.group !== null && 'codecs' in $s.admin.group && Array.isArray($s.admin.group.codecs) ? $s.admin.group.codecs as string[] : []}
            />
            <FieldNumber
                help={$t('group.settings.misc.chat_history_help')}
                label={$t('group.settings.misc.chat_history_label')}
                onChange={(value) => {
                    const group = $s.admin.group as Record<string, unknown>
                    if (group) group['max-history-age'] = value
                }}
                value={typeof $s.admin.group === 'object' && $s.admin.group !== null && 'max-history-age' in $s.admin.group ? Number($s.admin.group['max-history-age']) : 0}
            />
        </section>
    )
}
