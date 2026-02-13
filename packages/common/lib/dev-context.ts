import {RingBuffer} from './ring-buffer'

interface HttpEvent {
    method: string
    ms?: number
    status?: number
    ts: number
    url: string
}

interface WsEvent {
    dataPreview?: string
    endpoint: string
    ts: number
    type: 'open' | 'close' | 'message' | 'broadcast'
    url?: string
}

interface LogEvent {
    level: string
    message: string
    ts: number
}

class DevContext {
    http = new RingBuffer<HttpEvent>(500)

    ws = new RingBuffer<WsEvent>(500)

    logs = new RingBuffer<LogEvent>(500)

    errors = new RingBuffer<LogEvent>(200)

    addHttp(e: unknown) {
        this.http.push(e as HttpEvent)
    }

    addWs(e: WsEvent) {
        this.ws.push(e)
    }

    addLog(level: string, message: string) {
        const evt = {level, message, ts: Date.now()}
        if (level === 'error') {
            this.errors.push(evt)
        } else {
            this.logs.push(evt)
        }
    }

    snapshot(extra: Record<string, unknown> = {}) {
        return {
            errors: this.errors.toArray(),
            http: this.http.toArray(),
            logs: this.logs.toArray(),
            ts: Date.now(),
            ws: this.ws.toArray(),
            ...extra,
        }
    }
}

export const devContext = new DevContext()
