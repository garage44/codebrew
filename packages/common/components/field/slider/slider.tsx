import classnames from 'classnames'
import {useRef, useEffect, useMemo} from 'preact/hooks'
import {deepSignal} from 'deepsignal'

interface SliderValue {
    locked?: boolean | null
    value: number
}

interface FieldSliderProps {
    IconComponent: (props: {class?: string; name: string; onClick?: () => void}) => preact.JSX.Element
    onChange: (value: SliderValue) => void
    value: SliderValue
}

export const FieldSlider = ({IconComponent, onChange, value}: FieldSliderProps) => {
    /*
     * DeepSignal state - useRef ensures it's created once per component instance
     * Without useRef, deepSignal would be recreated on every render, losing state
     */
    const $s = useRef(deepSignal({
        currentValue: 100,
        down: false,
        dragStartY: null as number | null,
        dragY: null as number | null,
        isDragging: false,
        modifierKeyPressed: false,
        thumb: {height: 0, width: 0, y: 0},
        timeoutId: null as number | null,
        track: {height: 0, y: 0},
    })).current

    const trackRef = useRef<HTMLDivElement>(null)
    const thumbRef = useRef<HTMLDivElement>(null)
    const onChangeRef = useRef(onChange)
    const valueRef = useRef(value)

    // Keep refs current and sync currentValue
    useEffect(() => {
        onChangeRef.current = onChange
        valueRef.current = value
        if (!$s.isDragging) {
            $s.currentValue = value.value
        }
    }, [onChange, value, $s.isDragging])

    const marginTop = useMemo(() => {
        if ($s.track.height === 0 || $s.thumb.height === 0) return 0
        const minY = $s.thumb.height / 2
        const maxY = $s.track.height - ($s.thumb.height / 2)
        const trackRange = maxY - minY
        if (trackRange <= 0) return 0
        const normalizedValue = (100 - value.value) / 100
        const thumbCenterY = minY + (normalizedValue * trackRange)
        return thumbCenterY - ($s.thumb.height / 2)
    }, [$s.track.height, value.value, $s.thumb.height])

    // Calculate value from pageY position directly
    const pageYToValue = (pageY: number): number => {
        if (!trackRef.current || !thumbRef.current) return value.value

        const trackEl = trackRef.current
        const thumbEl = thumbRef.current

        const trackHeight = trackEl.offsetHeight
        const thumbHeight = thumbEl.offsetHeight

        if (trackHeight === 0) return value.value

        const currentTrackY = trackEl.getBoundingClientRect().top + window.scrollY
        const relativeY = pageY - currentTrackY

        const minY = thumbHeight / 2
        const maxY = trackHeight - (thumbHeight / 2)
        const clampedY = Math.max(minY, Math.min(maxY, relativeY))

        const trackRange = maxY - minY
        if (trackRange <= 0) return value.value

        const normalizedY = (clampedY - minY) / trackRange
        return Math.round(100 - (normalizedY * 100))
    }

    const onClick = (doubleClick: boolean) => {
        if (value.locked === null) return

        if (doubleClick) {
            if ($s.timeoutId) {
                clearTimeout($s.timeoutId)
                $s.timeoutId = null
                onChange({
                    locked: !value.locked,
                    value: value.value,
                })
            } else {
                $s.timeoutId = setTimeout(() => {
                    $s.timeoutId = null
                }, 500) as unknown as number
            }
        } else {
            onChange({
                locked: !value.locked,
                value: value.value,
            })
        }
    }

    const setPosition = (pageY: number, allowOutside = false) => {
        if (!trackRef.current || !thumbRef.current) return

        const trackHeight = trackRef.current.offsetHeight
        const thumbHeight = thumbRef.current.offsetHeight

        const currentTrackY = trackRef.current.getBoundingClientRect().top + window.scrollY
        const relativeY = pageY - currentTrackY

        const minY = thumbHeight / 2
        const maxY = trackHeight - (thumbHeight / 2)

        if (allowOutside) {
            // Allow dragging outside bounds when modifier key is pressed
            $s.thumb.y = relativeY
        } else if (relativeY >= minY && relativeY <= maxY) {
            // Normal behavior: clamp to track bounds
            $s.thumb.y = relativeY
        } else if (relativeY < minY) {
            $s.thumb.y = minY
        } else if (relativeY > maxY) {
            $s.thumb.y = maxY
        }
    }

    // Sync thumb position with value prop when it changes externally
    useEffect(() => {
        if ($s.isDragging) return
        if (!trackRef.current || $s.track.height === 0 || $s.thumb.height === 0) return

        const minY = $s.thumb.height / 2
        const maxY = $s.track.height - ($s.thumb.height / 2)
        const trackRange = maxY - minY

        if (trackRange <= 0) return

        const normalizedValue = (100 - value.value) / 100
        const expectedY = minY + (normalizedValue * trackRange)

        if (Math.abs($s.thumb.y - expectedY) > 0.5) {
            $s.thumb.y = expectedY
        }
    }, [$s.isDragging, $s.thumb.height, $s.thumb.y, $s.track.height, value.value])

    // Set up event listeners - stable handlers that don't depend on props
    useEffect(() => {
        const trackEl = trackRef.current
        const thumbEl = thumbRef.current
        if (!trackEl || !thumbEl) return

        const updateDimensions = () => {
            $s.track.height = trackEl.offsetHeight
            $s.track.y = trackEl.getBoundingClientRect().top + window.scrollY
            $s.thumb.height = thumbEl.offsetHeight
            $s.thumb.width = thumbEl.offsetWidth
        }

        updateDimensions()

        const handleStart = (pageY: number) => {
            $s.isDragging = true
            $s.dragStartY = pageY
            $s.down = true
            document.body.style.cursor = 'ns-resize'
            document.body.style.userSelect = 'none'
            updateDimensions()
            setPosition(pageY)
            const newValue = pageYToValue(pageY)
            $s.currentValue = newValue
            onChangeRef.current({
                locked: valueRef.current.locked ?? false,
                value: newValue,
            })
        }

        const handleMove = (pageY: number) => {
            // Check current state directly (DeepSignal is reactive)
            if (!$s.down) return

            // Only allow dragging outside bounds if modifier key is pressed
            if (!$s.modifierKeyPressed) {
                // Check if mouse is still over the track
                const rect = trackEl.getBoundingClientRect()
                const mouseY = pageY - window.scrollY
                if (mouseY < rect.top || mouseY > rect.bottom) {
                    return
                }
            }

            const newTrackY = trackEl.getBoundingClientRect().top + window.scrollY
            if (Math.abs($s.track.y - newTrackY) > 1) {
                $s.track.y = newTrackY
            }
            setPosition(pageY, $s.modifierKeyPressed)
            const newValue = pageYToValue(pageY)
            $s.currentValue = newValue
            onChangeRef.current({
                locked: valueRef.current.locked ?? false,
                value: newValue,
            })
        }

        const handleEnd = () => {
            $s.down = false
            $s.modifierKeyPressed = false
            document.body.style.cursor = ''
            document.body.style.userSelect = ''
            setTimeout(() => {
                $s.isDragging = false
                $s.dragStartY = null
            }, 10)
        }

        const handleMouseDown = (e: MouseEvent) => {
            e.preventDefault()
            e.stopPropagation()
            // Check if modifier key is already pressed
            $s.modifierKeyPressed = e.shiftKey || e.ctrlKey || e.altKey || e.metaKey
            handleStart(e.pageY)
        }

        const handleMouseMove = (e: MouseEvent) => {
            if (!$s.down) return
            // Update modifier key state during drag
            $s.modifierKeyPressed = e.shiftKey || e.ctrlKey || e.altKey || e.metaKey
            e.preventDefault()
            handleMove(e.pageY)
        }

        const handleMouseUp = () => {
            handleEnd()
        }

        const handleTouchStart = (e: TouchEvent) => {
            e.preventDefault()
            e.stopPropagation()
            const touch = e.touches[0]
            if (touch) {
                handleStart(touch.pageY)
            }
        }

        const handleTouchMove = (e: TouchEvent) => {
            if (!$s.down) return
            e.preventDefault()
            const touch = e.touches[0]
            if (touch) {
                handleMove(touch.pageY)
            }
        }

        const handleTouchEnd = () => {
            handleEnd()
        }

        const handleKeyDown = (e: KeyboardEvent) => {
            // Track modifier keys (Shift, Ctrl, Alt, Meta)
            if (e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) {
                $s.modifierKeyPressed = true
            }
        }

        const handleKeyUp = (e: KeyboardEvent) => {
            // Only clear if no modifier keys are still pressed
            if (!e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
                $s.modifierKeyPressed = false
            }
        }

        trackEl.addEventListener('mousedown', handleMouseDown)
        trackEl.addEventListener('touchstart', handleTouchStart, {passive: false})
        document.addEventListener('mousemove', handleMouseMove)
        document.addEventListener('mouseup', handleMouseUp)
        document.addEventListener('touchmove', handleTouchMove, {passive: false})
        document.addEventListener('touchend', handleTouchEnd)
        document.addEventListener('keydown', handleKeyDown)
        document.addEventListener('keyup', handleKeyUp)

        return () => {
            trackEl.removeEventListener('mousedown', handleMouseDown)
            trackEl.removeEventListener('touchstart', handleTouchStart)
            document.removeEventListener('mousemove', handleMouseMove)
            document.removeEventListener('mouseup', handleMouseUp)
            document.removeEventListener('touchmove', handleTouchMove)
            document.removeEventListener('touchend', handleTouchEnd)
            document.removeEventListener('keydown', handleKeyDown)
            document.removeEventListener('keyup', handleKeyUp)
            if ($s.timeoutId) {
                clearTimeout($s.timeoutId)
            }
            // Cleanup cursor and selection styles
            document.body.style.cursor = ''
            document.body.style.userSelect = ''
        }
    }, [])

    return (
        <div class={classnames('c-field-slider', {active: $s.down})}>
            {value.locked && IconComponent && (
                <IconComponent
                    class='icon icon-xs locked'
                    name='lock'
                    onClick={() => onClick(false)}
                />
            )}

            <div
                class='track'
                onClick={(e) => {
                    // Don't handle click if we just finished dragging
                    if ($s.isDragging || $s.dragStartY !== null) {
                        return
                    }
                    // Only handle click if mouse didn't move (pure click, not drag)
                    const pageY = window.scrollY + e.clientY
                    const newValue = pageYToValue(pageY)
                    $s.currentValue = newValue
                    setPosition(pageY)
                    onChangeRef.current({
                        locked: valueRef.current.locked ?? false,
                        value: newValue,
                    })
                    onClick(true)
                }}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        onClick(false)
                    }
                }}
                ref={trackRef}
            >
                <div class='thumb' ref={thumbRef} style={{marginTop: `${marginTop}px`}} />
                {$s.down && (
                    <div class='volume-popup'>
                        {$s.currentValue}%
                    </div>
                )}
            </div>
        </div>
    )
}
