import {$s} from '@/app'
import {logger} from '@garage44/common/app'

export default class Sound {

    constructor(description) {
        this.description = description
        this.audio = new Audio(description.file)
    }

    async play({loop = false, sink = null} = {}) {
        this.loop = loop

        if (!this.played) this.audio.addEventListener('ended', this.playEnd.bind(this))
        this.played = true

        if (!sink) sink = $s.devices.audio.selected.id

        logger.debug(`play sound on sink ${sink}`)
        if (this.audio.setSinkId) {
            this.audio.setSinkId(sink)
        }
        // Loop the sound.
        if (loop) {
            this.audio.addEventListener('ended', () => {
                this.description.playing = false
            }, false)
        }

        try {
            await this.audio.play()
        } catch (err) {
            // The play() request was interrupted by a call to pause()
        }
        this.description.playing = true

    }

    playEnd() {
        this.description.playing = false

        if (this.loop) {
            this.description.playing = true
            this.audio.currentTime = 0
            this.audio.play()
        }
    }

    stop() {
        this.audio.pause()
        this.audio.currentTime = 0
        this.description.playing = false
    }
}
