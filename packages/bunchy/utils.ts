import archy from 'archy'
import {logger} from './index.ts'
import pc from 'picocolors'
import tildify from 'tildify'

function showConfig(settings) {
    const tree = {
        label: 'Bunchy Config:',
        nodes: [
            {
                label: pc.bold(pc.blue('Directories')),
                nodes: Object.entries(settings.dir).map(([k, dir]) => {
                    if (typeof dir === 'string') {
                        return {label: `${k.padEnd(10, ' ')} ${tildify(dir)}`}
                    }
                    if (Array.isArray(dir)) {
                        return {
                            label: 'extra',
                            nodes: dir.map((i) => tildify(i)),
                        }
                    }
                    return {label: `${k.padEnd(10, ' ')} ${tildify(String(dir))}`}
                }),
            },
            {
                label: pc.bold(pc.blue('Build Flags')),
                nodes: [
                    {label: `${'buildId'.padEnd(10, ' ')} ${settings.buildId}`},
                    {label: `${'minify'.padEnd(10, ' ')} ${settings.minify}`},
                    {label: `${'sourceMap'.padEnd(10, ' ')} ${settings.sourceMap}`},
                    {label: `${'version'.padEnd(10, ' ')} ${settings.version}`},
                ],
            },
        ],
    }

    logger.info('')
    archy(tree).split('\r').forEach((line) => logger.info(line))
}

function generateRandomId() {
    return Math.random().toString(36).slice(2, 15) + Math.random().toString(36).slice(2, 15)
}

export {generateRandomId, showConfig}
