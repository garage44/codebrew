type LogLevel = 'error' | 'warn' | 'info' | 'success' | 'verbose' | 'debug' | 'remote'

const LEVELS: Record<LogLevel, number> = {
    debug: 5,
    error: 0,
    info: 2,
    remote: 2,
    success: 3,
    verbose: 4,
    warn: 1,
}

const ESC = String.fromCodePoint(27)
const COLORS = {
    // gray
    debug: `${ESC}[90m`,
    // red
    error: `${ESC}[31m`,
    // blue
    info: `${ESC}[34m`,
    // purple
    remote: `${ESC}[38;5;166m`,
    reset: `${ESC}[0m`,
    // muted green (matches browser #27ae60)
    success: `${ESC}[38;2;39;174;96m`,
    // cyan
    verbose: `${ESC}[36m`,
    // yellow
    warn: `${ESC}[33m`,
}

export class Logger {
    private level: LogLevel

    private fileStream?: NodeJS.WritableStream

    constructor({file, level = 'info'}: {file?: string; level?: LogLevel} = {}) {
        this.level = level
        if (file) {
            const fs = require('fs')
            const path = require('path')
            fs.mkdirSync(path.dirname(file), {recursive: true})
            this.fileStream = fs.createWriteStream(file, {flags: 'a'})
        }
    }

    private shouldLog(level: LogLevel) {
        return LEVELS[level] <= LEVELS[this.level]
    }

    private format(level: LogLevel, msg: string) {
        const now = new Date()
        const year = now.getFullYear()
        const month = String(now.getMonth() + 1).padStart(2, '0')
        const day = String(now.getDate()).padStart(2, '0')
        const hours = String(now.getHours()).padStart(2, '0')
        const minutes = String(now.getMinutes()).padStart(2, '0')
        const seconds = String(now.getSeconds()).padStart(2, '0')
        const ts = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
        const color = COLORS[level] || ''
        const levelStr = level.toUpperCase()

        if (level === 'debug') {
            /*
             * Keep prefix color, but make timestamp and message text medium grey
             * medium gray
             */
            const mediumGrey = '\u001B[38;5;244m'
            return `${color}[${levelStr[0]}]${COLORS.reset} ${mediumGrey}[${ts}] ${msg}${COLORS.reset}`
        }

        if (level === 'warn') {
            /*
             * Keep prefix color, but make timestamp and message text light orange
             * light orange pastel
             */
            const lightOrange = '\u001B[38;5;215m'
            return `${color}[${levelStr[0]}]${COLORS.reset} ${lightOrange}[${ts}] ${msg}${COLORS.reset}`
        }

        if (level === 'remote') {
            // purple
            const purple = '\u001B[38;5;166m'
            return `${color}[${levelStr[0]}]${COLORS.reset} ${purple}[${ts}] ${msg}${COLORS.reset}`
        }

        if (level === 'success') {
            /*
             * Keep prefix color, but make timestamp and message text light green
             * light green pastel
             */
            const lightGreen = '\u001B[38;5;156m'
            return `${color}[${levelStr[0]}]${COLORS.reset} ${lightGreen}[${ts}] ${msg}${COLORS.reset}`
        }

        if (level === 'info') {
            /*
             * Keep prefix color, but make timestamp and message text pastel blue
             * pastel blue
             */
            const pastelBlue = '\u001B[38;5;153m'
            return `${color}[${levelStr[0]}]${COLORS.reset} ${pastelBlue}[${ts}] ${msg}${COLORS.reset}`
        }

        if (level === 'error') {
            /*
             * Keep prefix color, but make timestamp and message text pastel red
             * pastel red
             */
            const pastelRed = '\u001B[38;5;210m'
            return `${color}[${levelStr[0]}]${COLORS.reset} ${pastelRed}[${ts}] ${msg}${COLORS.reset}`
        }

        return `${color}[${levelStr[0]}]${COLORS.reset} [${ts}] ${msg}`
    }

    private logToFile(msg: string) {
        if (this.fileStream) {
            this.fileStream.write(msg + '\n')
        }
    }

    log(level: LogLevel, msg: string, ...args: unknown[]) {
        if (!this.shouldLog(level)) {
            return
        }
        const formatted = this.format(level, msg)
        if (level === 'error') {
            console.error(formatted, ...args)
        } else if (level === 'warn') {
            console.warn(formatted, ...args)
        } else if (level === 'remote') {
            console.log(formatted, ...args)
        } else {
            console.log(formatted, ...args)
        }
        this.logToFile(formatted.replaceAll(new RegExp(`${ESC}\\[[0-9;]*m`, 'g'), ''))
    }

    error(msg: string, ...args: unknown[]) {
        this.log('error', msg, ...args)
    }

    warn(msg: string, ...args: unknown[]) {
        this.log('warn', msg, ...args)
    }

    info(msg: string, ...args: unknown[]) {
        this.log('info', msg, ...args)
    }

    remote(msg: string, ...args: unknown[]) {
        this.log('remote', msg, ...args)
    }

    success(msg: string, ...args: unknown[]) {
        this.log('success', msg, ...args)
    }

    verbose(msg: string, ...args: unknown[]) {
        this.log('verbose', msg, ...args)
    }

    debug(msg: string, ...args: unknown[]) {
        this.log('debug', msg, ...args)
    }

    setLevel(level: LogLevel) {
        this.level = level
    }

    close() {
        if (this.fileStream) {
            this.fileStream.end()
        }
    }
}

// Provide a shared logger instance for Node/Bun environments
const logger = new Logger()

export {logger}
