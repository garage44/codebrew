import archy from 'archy'
import {logger} from './index.ts'
import pc from 'picocolors'
import tildify from 'tildify'

interface Settings {
    buildId: string
    dir: Record<string, string | string[]>
    minify?: boolean
    sourceMap?: boolean
    sourcemap?: boolean
    version?: string
}

function showConfig(settings: Settings): void {
    const tree = {
        label: 'Bunchy Config:',
        nodes: [
            {
                label: pc.bold(pc.blue('Directories')),
                nodes: Object.entries(settings.dir).map(([key, dir]): {label: string; nodes?: string[]} => {
                    if (typeof dir === 'string') {
                        return {label: `${key.padEnd(10, ' ')} ${tildify(dir)}`}
                    }
                    if (Array.isArray(dir)) {
                        return {
                            label: 'extra',
                            nodes: dir.map((item: string): string => tildify(item)),
                        }
                    }
                    return {label: `${key.padEnd(10, ' ')} ${tildify(String(dir))}`}
                }),
            },
            {
                label: pc.bold(pc.blue('Build Flags')),
                nodes: [
                    {label: `${'buildId'.padEnd(10, ' ')} ${settings.buildId}`},
                    {label: `${'minify'.padEnd(10, ' ')} ${settings.minify ?? false}`},
                    {label: `${'sourceMap'.padEnd(10, ' ')} ${settings.sourceMap ?? settings.sourcemap ?? false}`},
                    {label: `${'version'.padEnd(10, ' ')} ${settings.version ?? 'unknown'}`},
                ],
            },
        ],
    }

    logger.info('')
    for (const line of archy(tree).split('\r')) {
        logger.info(line)
    }
}

function generateRandomId(): string {
    return Math.random().toString(36).slice(2, 15) + Math.random().toString(36).slice(2, 15)
}

export {generateRandomId, showConfig}
