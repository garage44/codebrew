import {store} from '@/app'

import {Icon} from '../icon/icon'

const themes = ['light', 'dark', 'system'] as const

const cycleTheme = () => {
    const currentIndex = themes.indexOf(store.state.theme)
    const nextIndex = (currentIndex + 1) % themes.length
    store.state.theme = themes[nextIndex]
}

export const ThemeToggle = () => (
    <div class='c-theme-toggle'>
        <Icon
            name={(() => {
                if (store.state.theme === 'light') {
                    return 'sun'
                }
                if (store.state.theme === 'dark') {
                    return 'moon'
                }
                return 'system' // System preference icon
            })()}
            onClick={cycleTheme}
            size='s'
            tip={`Theme: ${store.state.theme}`}
        />
    </div>
)
