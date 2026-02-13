interface InitOptions {
    debug?: boolean
    fallbackLng?: string
    interpolation?: {
        escapeValue?: boolean
    }
    lng?: string
    resources?: Record<string, unknown> | null | undefined
}

interface I18next {
    init(options: InitOptions): void
    changeLanguage(lng: string): void
    t(key: string, options?: Record<string, unknown> | null | undefined): string
}

declare const i18next: I18next
export default i18next
