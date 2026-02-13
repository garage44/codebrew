import {$s} from '@/app'

export function tag_updated(path_update: unknown): void {
    $s.tags.updated = path_update as string | null
    setTimeout((): void => {
        $s.tags.updated = null
    }, 1500)
}
