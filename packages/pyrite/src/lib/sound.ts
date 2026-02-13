import {$s} from '@/app'
import {logger} from '@garage44/common/app'

interface SoundDescription {
    file: string
    playing: boolean
}

export default class Sound {
    description: SoundDescription
    audio: HTMLAudioElement
    loop: boolean
    played: boolean

    constructor(description: SoundDescription) {
        this.description = description
        this.audio = new Audio(description.file)
        this.loop = false
        this.played = false
    }

    async play({loop = false, sink = null}: {loop?: boolean; sink?: string | null} = {}): Promise<void> {
        this.loop = loop

        if (!this.played) {this.audio.addEventListener('ended', this.playEnd.bind(this))}
        this.played = true

        const sinkId = sink ?? $s.devices.audio.selected.id ?? ''

        logger.debug(`play sound on sink ${sinkId}`)
        if (this.audio.setSinkId && sinkId) {
            this.audio.setSinkId(sinkId)
        }
        // Loop the sound.
        if (loop) {
            this.audio.addEventListener('ended', (): void => {
                this.description.playing = false
            }, false)
        }

        try {
            await this.audio.play()
        } catch {
            // The play() request was interrupted by a call to pause()
        }
        this.description.playing = true

    }

    playEnd(): void {
        this.description.playing = false

        if (this.loop) {
            this.description.playing = true
            this.audio.currentTime = 0
            this.audio.play()
        }
    }

    stop(): void {
        this.audio.pause()
        this.audio.currentTime = 0
        this.description.playing = false
    }
}
