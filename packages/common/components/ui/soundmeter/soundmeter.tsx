// Based on https://github.com/cwilso/volume-meter/blob/master/volume-meter.js

// The MIT License (MIT)
// Copyright (c) 2014 Chris Wilson
// Permission is hereby granted, free of charge, to any person obtaining a copy
// Of this software and associated documentation files (the "Software"), to deal
// In the Software without restriction, including without limitation the rights
// To use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// Copies of the Software, and to permit persons to whom the Software is
// Furnished to do so, subject to the following conditions:
// The above copyright notice and this permission notice shall be included in all
// Copies or substantial portions of the Software.
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

import classnames from 'classnames'
import {useEffect, useRef} from 'preact/hooks'

interface SoundMeterProps {
    orientation?: 'horizontal' | 'vertical'
    stream: MediaStream
    streamId: string
    class?: string
}

export const SoundMeter = ({orientation = 'horizontal', stream, streamId, class: className}: SoundMeterProps) => {
    const meterRef = useRef<HTMLCanvasElement>(null)
    const canvasContextRef = useRef<CanvasRenderingContext2D | null>(null)
    const audioContextRef = useRef<AudioContext | null>(null)
    const meterNodeRef = useRef<any>(null)
    const rafIDRef = useRef<number | null>(null)
    const colorsRef = useRef<{primary: string; warning: string}>({primary: '', warning: ''})

    const drawLoop = () => {
        const meter = meterNodeRef.current
        const canvas = meterRef.current
        const ctx = canvasContextRef.current

        if (!meter || !canvas || !ctx) {
            return
        }

        ctx.clearRect(0, 0, canvas.width, canvas.height)

        if (meter.checkClipping()) {
            ctx.fillStyle = colorsRef.current.warning
        } else {
            ctx.fillStyle = colorsRef.current.primary
        }

        if (orientation === 'horizontal') {
            ctx.fillRect(0, 0, meter.volume * canvas.width * 2.4, canvas.height)
        } else {
            ctx.fillRect(0, 0, canvas.width, meter.volume * canvas.height * 2.4)
        }

        rafIDRef.current = window.requestAnimationFrame(drawLoop)
    }

    const updateSoundmeter = async () => {
        if (!stream.getAudioTracks().length) {
            return
        }

        audioContextRef.current = new AudioContext()
        const mediaStreamSource = audioContextRef.current.createMediaStreamSource(stream)
        meterNodeRef.current = createAudioMeter(audioContextRef.current)
        mediaStreamSource.connect(meterNodeRef.current)
    }

    useEffect(() => {
        if (!meterRef.current) {
            return
        }

        canvasContextRef.current = meterRef.current.getContext('2d')
        const computedStyle = getComputedStyle(document.querySelector('.app')!)
        colorsRef.current = {
            primary: computedStyle.getPropertyValue('--primary-4'),
            warning: computedStyle.getPropertyValue('--warning-4'),
        }

        updateSoundmeter()
        drawLoop()

        return () => {
            if (rafIDRef.current !== null) {
                window.cancelAnimationFrame(rafIDRef.current)
            }
        }
    }, [])

    // Watch for stream changes
    useEffect(() => {
        updateSoundmeter()
    }, [streamId])

    return <canvas id='meter' ref={meterRef} class={classnames('c-soundmeter', {[orientation]: true}, className)} />
}

function volumeAudioProcess(this: any, event: AudioProcessingEvent) {
    const buf = event.inputBuffer.getChannelData(0)
    const bufLength = buf.length
    let sum = 0
    let x

    for (let i = 0; i < bufLength; i++) {
        x = buf[i]
        if (Math.abs(x) >= this.clipLevel) {
            this.clipping = true
            this.lastClip = window.performance.now()
        }
        sum += x * x
    }

    const rms = Math.sqrt(sum / bufLength)
    this.volume = Math.max(rms, this.volume * this.averaging)
}

function createAudioMeter(audioContext: AudioContext, clipLevel?: number, averaging?: number, clipLag?: number) {
    const processor = audioContext.createScriptProcessor(512)
    processor.onaudioprocess = volumeAudioProcess.bind(processor)
    ;(processor as any).clipping = false
    ;(processor as any).lastClip = 0
    ;(processor as any).volume = 0.1
    ;(processor as any).clipLevel = clipLevel || 0.98
    ;(processor as any).averaging = averaging || 0.95
    ;(processor as any).clipLag = clipLag || 750

    // This will have no effect, since we don't copy the input to the output,
    // But works around a current Chrome bug.
    processor.connect(audioContext.destination)
    ;(processor as any).checkClipping = function checkClipping() {
        if (!this.clipping) {
            return false
        }
        if (this.lastClip + this.clipLag < window.performance.now()) {
            this.clipping = false
        }
        return this.clipping
    }

    ;(processor as any).shutdown = function shutdown() {
        this.disconnect()
        this.onaudioprocess = null
    }

    return processor
}
