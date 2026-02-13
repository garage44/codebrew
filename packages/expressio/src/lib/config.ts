import {api} from '@garage44/common/app'
import {mergeDeep} from '@garage44/common/lib/utils'

import {$s} from '@/app'

export async function loadConfig(): Promise<void> {
    const config = (await api.get('/api/config')) as {
        enola: unknown
        language_ui: string
        logger: unknown
        workspaces: unknown[]
    }

    mergeDeep($s, {
        enola: config.enola,
        language_ui: {selection: config.language_ui},
        logger: config.logger,
        workspaces: config.workspaces,
    } as unknown as Partial<typeof $s>)
}
