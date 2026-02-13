import type {LanguageUI} from '@garage44/common/types'
import type {DeepSignal} from 'deepsignal'

import type workspace from '@/.expressio.json'

import type {EnolaConfig} from '../lib/enola/types.ts'

type TranslationTarget = Record<string, string>

interface TranslationEntry {
    cache: string
    source: string
    target: TranslationTarget
}

interface TranslationGroup {
    [key: string]: TranslationEntry | TranslationGroup
}

// Extract i18n type from JSON structure
type I18nType = typeof workspace.i18n

// Keep I18n as alias for backward compatibility
type I18n = I18nType

interface WorkspaceTargetLanguage {
    engine: 'anthropic' | 'deepl'
    formality: 'default' | 'less' | 'more'
    id: string
    name?: string
}

interface WorkspaceConfig {
    languages: {
        source: string
        target: WorkspaceTargetLanguage[]
    }
    source_file: string | null
    sync: {
        dir: string
        enabled: boolean
        suggestions?: boolean
    }
    workspace_id: string
}

interface Workspace {
    config: WorkspaceConfig
    i18n: I18n
}

interface WorkspaceDescription {
    source_file: string
    status?: 'existing' | 'new'
    workspace_id?: string
}

interface ExpressioStateBase {
    enola: EnolaConfig
    env: {
        ctrlKey: boolean
        isFirefox: boolean
        layout: 'desktop' | 'mobile' | 'tablet'
        shiftKey: boolean
        url: string
    }
    filter: string
    language_ui: LanguageUI
    notifications: []
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
    sort: 'asc' | 'desc'

    /** Keeps track which tags have been updated for visual feedback */
    tags: {
        updated: string
    }
    theme: 'dark' | 'light' | 'system'
    workspace: Workspace
    workspaces: DeepSignal<[WorkspaceDescription]>
}

type ExpressioState = DeepSignal<ExpressioStateBase>

export {
    ExpressioState,
    type I18n,
    type I18nType,
    type LanguageUI,
    type TranslationEntry,
    type TranslationGroup,
    type TranslationTarget,
    type Workspace,
    type WorkspaceConfig,
    type WorkspaceDescription,
}
