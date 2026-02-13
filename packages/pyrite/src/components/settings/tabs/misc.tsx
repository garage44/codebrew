import {$t, store} from '@garage44/common/app'
import {logger} from '@garage44/common/app'
import {AvatarUpload, FieldSelect, ThemeToggle} from '@garage44/common/components'
import {useEffect} from 'preact/hooks'

import {$s} from '@/app'

export default function TabMisc() {
    const languages = [
        {id: 'de', name: 'ui.settings.misc.language.german_label'},
        {id: 'en', name: 'ui.settings.misc.language.english_label'},
        {id: 'fr', name: 'ui.settings.misc.language.french_label'},
        {id: 'nl', name: 'ui.settings.misc.language.dutch_label'},
    ]

    // Watch for theme changes
    useEffect(() => {
        const currentTheme = store.state.theme
        const themeColor = getComputedStyle(document.querySelector('.app')!).getPropertyValue('--surface-3')
        logger.info(`setting theme color to ${themeColor} for theme ${currentTheme}`)
        const metaTheme = document.querySelector('meta[name="theme-color"]')
        if (metaTheme) {
            ;(metaTheme as HTMLMetaElement).content = themeColor
        }
    }, [])

    return (
        <section class='tab-content active'>
            <AvatarUpload state={$s} />

            <div class='theme-toggle-wrapper'>
                <label>{$t('ui.settings.misc.theme_label')}</label>
                <ThemeToggle />
                <p class='help-text'>{$t('ui.settings.misc.theme_help')}</p>
            </div>

            <FieldSelect
                help={$t('ui.settings.misc.language_help')}
                label={$t('ui.settings.misc.language_label')}
                model={$s.language.$id}
                options={languages}
            />
        </section>
    )
}
