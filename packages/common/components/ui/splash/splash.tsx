import {useEffect, useMemo} from 'preact/hooks'
import type {JSX} from 'preact'

interface SplashProps {
    header?: string
    instruction?: string | (() => string)
    IconComponent?: () => JSX.Element
    onMount?: () => void
}

export const Splash = ({ header, instruction, IconComponent, onMount }: SplashProps) => {
    const subtitle = useMemo(() => {
        if (instruction) {
            if (typeof instruction === 'function') return instruction()
            else return instruction
        }
        else return ''
    }, [instruction])

    const title = useMemo(() => {
        if (header) {
            return header
        } else {
            return ''
        }
    }, [header])

    useEffect(() => {
        if (onMount) {
            onMount()
        }
    }, [])

    return (
        <div class="c-splash">
            {IconComponent && (
                <svg class="icon logo-animated" viewBox="0 0 24 24" height="40" width="40">
                    <IconComponent />
                </svg>
            )}
            {title && (
                <div class="title uca">
                    {title}
                </div>
            )}
            {subtitle && (
                <div class="subtitle uca">
                    {subtitle}
                </div>
            )}
        </div>
    )
}
