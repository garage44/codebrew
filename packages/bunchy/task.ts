import {logger} from './index.ts'
import notifier from 'node-notifier'
import pc from 'picocolors'
import {performance} from 'node:perf_hooks'

export class Task {
    title: string

    execute: (...args: unknown[]) => unknown

    prefix: {error: string; ok: string}

    startTime?: number

    endTime?: number

    spendTime?: string

    size?: string

    constructor(title: string, execute: (...args: unknown[]) => unknown) {
        this.title = title

        this.execute = execute
        this.prefix = {
            error: pc.bold(pc.red(`[${this.title}]`.padEnd(20, ' '))),
            ok: pc.bold(pc.green(`[${this.title}]`.padEnd(20, ' '))),
        }
    }

    log(...args: unknown[]): void {
        logger.info(...(args.map(String) as [string, ...string[]]))
    }

    async start(...args: unknown[]): Promise<unknown> {
        this.startTime = performance.now()
        const logStart = `${this.prefix.ok}${pc.gray('task started')}`
        this.log(logStart)
        let result: unknown = null

        try {
            result = await this.execute(...args)
            if (result && typeof result === 'object' && 'size' in result && typeof (result as {size: number}).size === 'number') {
                const resultSize = (result as {size: number}).size
                if (resultSize < 1024) {
                    this.size = `${resultSize}B`
                } else if (resultSize < 1024 ** 2) {
                    this.size = `${Number(resultSize / 1024).toFixed(2)}KiB`
                } else {
                    this.size = `${Number(resultSize / 1024 ** 2).toFixed(2)}MiB`
                }
            }
        } catch(error) {
            logger.error(`${this.prefix.error}task failed\n${error}`)
            notifier.notify({
                message: `${error}`,
                title: `Task ${this.title} failed!`,
            })
        }

        this.endTime = performance.now()
        this.spendTime = `${Number(this.endTime - this.startTime).toFixed(1)}ms`
        let logComplete = `${this.prefix.ok}task completed`

        logComplete += ` (${pc.bold(this.spendTime)}`
        if (this.size) {logComplete += `, ${pc.bold(this.size)}`}
        logComplete += ')'

        logger.info(logComplete)

        return result
    }
}
