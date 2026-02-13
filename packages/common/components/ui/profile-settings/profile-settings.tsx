import {useEffect} from 'preact/hooks'

import {api, notifier, logger, store} from '@/app'
import {Icon} from '@/components'
import {FieldSelect, ThemeToggle} from '@/components'

import {AvatarUpload} from '../avatar-upload/avatar-upload'

interface ProfileSettingsProps {
    /**
     * Global state object (typically $s from app)
     */
    state?: any
    /**
     * Function to get language options from state
     * @default (state) => state?.language_ui?.options || []
     */
    getLanguageOptions?: (state: any) => any[]
    /**
     * Function to get language selection from state
     * @default (state) => state?.language_ui?.$selection
     */
    getLanguageSelection?: (state: any) => any
    /**
     * Function to handle language change
     * @default (state, language) => { state.language_ui.selection = language; store.save() }
     */
    onLanguageChange?: (state: any, language: string) => void
    /**
     * Function to handle settings save
     * @default () => { store.save(); notifier.notify({ level: 'success', message: 'Settings saved' }) }
     */
    onSave?: () => void
    /**
     * User endpoint for avatar upload
     * @default '/api/users/me'
     */
    userEndpoint?: string
}

/**
 * Profile Settings Page Component
 * Contains avatar upload, theme toggle, and language selection
 */
export function ProfileSettings({
    state = null,
    getLanguageOptions = (s) => s?.language_ui?.options || [],
    getLanguageSelection = (s) => s?.language_ui?.$selection,
    onLanguageChange = (s, language) => {
        if (s?.language_ui) {
            s.language_ui.selection = language
        }
        store.save()
    },
    onSave = () => {
        store.save()
        notifier.notify({
            level: 'success',
            message: 'Settings saved',
            type: 'success',
        })
    },
    userEndpoint = '/api/users/me',
}: ProfileSettingsProps = {}) {
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

    const languages = state ? getLanguageOptions(state) : []
    const languageSelection = state ? getLanguageSelection(state) : null

    return (
        <div class='c-profile-settings content view'>
            <header class='settings-header'>
                <div class='notice' />
                <div class='title'>
                    <span>Settings</span>
                    <Icon className='item-icon icon-regular' name='settings' />
                </div>
            </header>

            <div class='settings-content'>
                <section class='settings-section'>
                    <h2 class='section-title'>Profile</h2>
                    <AvatarUpload state={state} userEndpoint={userEndpoint} />
                </section>

                <section class='settings-section'>
                    <h2 class='section-title'>Appearance</h2>
                    <div class='theme-toggle-wrapper'>
                        <label>Theme</label>
                        <ThemeToggle />
                        <p class='help-text'>Choose your preferred color scheme</p>
                    </div>
                </section>

                {languageSelection && (
                    <section class='settings-section'>
                        <h2 class='section-title'>Language</h2>
                        <FieldSelect
                            model={languageSelection}
                            help='Select your preferred language'
                            label='Interface Language'
                            options={languages}
                            onChange={(language) => {
                                if (state) {
                                    onLanguageChange(state, language)
                                }
                                logger.info(`Language changed to: ${language}`)
                            }}
                        />
                    </section>
                )}

                <div class='settings-actions'>
                    <button class='btn btn-primary' onClick={onSave}>
                        <Icon name='save' type='info' />
                        Save Settings
                    </button>
                </div>
            </div>
        </div>
    )
}
