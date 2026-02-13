type LogLevel = 'error' | 'warn' | 'info' | 'success' | 'verbose' | 'debug'

interface LanguageUI {
    i18n: Record<string, Record<string, string>>
    options: {id: string; name: string}[]
    selection: string
}

interface LoggerConfig {
    [key: string]: unknown
    colors?: boolean
    file?: string
    level?: LogLevel
    timestamp?: boolean
}

interface CommonState {
    beta?: boolean
    env: {
        ctrlKey: boolean
        isFirefox: boolean
        layout: 'desktop' | 'mobile' | 'tablet'
        shiftKey: boolean
        url: string
    }
    hmr_updating: boolean
    language_ui: LanguageUI
    notifications: unknown[]
    panels: {
        context: {
            collapsed: boolean
            width?: number
        }
        menu: {
            collapsed: boolean
            width?: number
        }
    }
    profile: {
        admin: boolean
        authenticated: boolean
        avatar: string
        displayName: string
        id: string | null
        password: string
        username: string
    }
    theme: 'dark' | 'light' | 'system'
}


interface TargetLanguage {
    engine: 'anthropic' | 'deepl'
    formality: 'informal' | 'formal'
    id: string
}

export {
    type CommonState,
    type LanguageUI,
    type LoggerConfig,
    type LogLevel,
    type TargetLanguage,
}
