// Simple tween animation; used because ResizeObserver doesn't capture
// CSS transforms, and we want to be able to animate UI elements
// nevertheless. Thanks Matt! (https://mattperry.is/writing-code/how-to-write-a-tween)
export default function tween({
    from = 0,
    to = 1,
    duration = 300,
    ease = easeOut,
    onFinish,
    onUpdate,
}: {
    from?: number
    to?: number
    duration?: number
    ease?: (progress: number, power?: number) => number
    onFinish?: () => void
    onUpdate?: (value: number) => void
} = {}) {
    const delta = to - from
    const startTime = performance.now()

    function update(currentTime) {
        const elapsed = currentTime - startTime
        const progress = Math.min(elapsed / duration, 1)
        const latest = from + ease(progress) * delta

        if (onUpdate) onUpdate(latest)

        if (progress < 1) {
            requestAnimationFrame(update)
        } else if (onFinish) onFinish()
    }

    requestAnimationFrame(update)
}

function easeOut(progress, power = 2) {
    return 1 - (1 - progress) ** power
}
