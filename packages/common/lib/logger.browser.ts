type LogLevel = 'error' | 'warn' | 'info' | 'success' | 'verbose' | 'debug' | 'remote'

const LEVELS: Record<LogLevel, number> = {
    debug: 0,
    error: 1,
    info: 2,
    remote: 2,
    success: 3,
    verbose: 4,
    warn: 5,
}

const COLORS = {
    debug: 'color: #7f8c8d',
    error: 'color: #e74c3c',
    info: 'color: #3498db',
    remote: 'color:rgb(166, 32, 184)',
    success: 'color: #27ae60',
    verbose: 'color: #1abc9c',
    warn: 'color: #f1c40f',
}

class Logger {
    private level: LogLevel

    private logForwarder?: (level: LogLevel, msg: string, args: unknown[]) => void

    constructor({level = 'info'}: {level?: LogLevel} = {}) {
        this.level = level
    }

    setLogForwarder(forwarder: (level: LogLevel, msg: string, args: unknown[]) => void) {
        this.logForwarder = forwarder
    }

    private shouldLog(level: LogLevel) {
        return LEVELS[level] <= LEVELS[this.level]
    }

    log(level: LogLevel, msg: string, ...args: unknown[]) {
        if (!this.shouldLog(level)) {
            return
        }

        // Forward to server if forwarder is set
        if (this.logForwarder) {
            this.logForwarder(level, msg, args)
        }
        const now = new Date()
        const year = now.getFullYear()
        const month = String(now.getMonth() + 1).padStart(2, '0')
        const day = String(now.getDate()).padStart(2, '0')
        const hours = String(now.getHours()).padStart(2, '0')
        const minutes = String(now.getMinutes()).padStart(2, '0')
        const seconds = String(now.getSeconds()).padStart(2, '0')
        const ts = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
        const levelStr = level.toUpperCase()
        const style = COLORS[level] || ''

        if (level === 'debug') {
            /*
             * Keep prefix color, but make timestamp and message text medium grey
             */
            const mediumGreyStyle = 'color: #888888'
            const prefix = `%c[${levelStr[0]}]%c [${ts}] ${msg}`
            console.log(prefix, style, mediumGreyStyle, ...args)
        } else if (level === 'warn') {
            /*
             * Keep prefix color, but make timestamp and message text light orange
             */
            const lightOrangeStyle = 'color: #ffb366'
            const prefix = `%c[${levelStr[0]}]%c [${ts}] ${msg}`
            console.warn(prefix, style, lightOrangeStyle, ...args)
        } else if (level === 'success') {
            /*
             * Keep prefix color, but make timestamp and message text light green
             */
            const lightGreenStyle = 'color: #90ee90'
            const prefix = `%c[${levelStr[0]}]%c [${ts}] ${msg}`
            console.log(prefix, style, lightGreenStyle, ...args)
        } else if (level === 'info') {
            /*
             * Keep prefix color, but make timestamp and message text pastel blue
             */
            const pastelBlueStyle = 'color: #87ceeb'
            const prefix = `%c[${levelStr[0]}]%c [${ts}] ${msg}`
            console.log(prefix, style, pastelBlueStyle, ...args)
        } else if (level === 'error') {
            /*
             * Keep prefix color, but make timestamp and message text pastel red
             */
            const pastelRedStyle = 'color: #ff9999'
            const prefix = `%c[${levelStr[0]}]%c [${ts}] ${msg}`
            console.error(prefix, style, pastelRedStyle, ...args)
        } else if (level === 'remote') {
            const purpleStyle = 'color:rgb(166, 32, 184)'
            const prefix = `%c[${levelStr[0]}]%c [${ts}] ${msg}`
            console.warn(prefix, style, purpleStyle, ...args)
        } else {
            const prefix = `%c[${levelStr[0]}]%c [${ts}]`
            if (level === 'verbose') {
                console.log(`${prefix} ${msg}`, style, '', ...args)
            }
        }
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

    close() {}
}

// Provide a shared logger instance for the browser
const logger = new Logger()

export {logger, Logger}
