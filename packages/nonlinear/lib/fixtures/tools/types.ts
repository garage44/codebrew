/**
 * Tool system types and interfaces
 */

import type {BaseAgent} from '../../agent/base.ts'

export interface ToolParameter {
    description: string
    name: string
    required?: boolean
    type: string
}

export interface ToolContext {
    adrContext?: ADRContext
    agent: BaseAgent
    branchName?: string
    codebase?: CodebaseContext
    gitState?: GitState
    repositoryId?: string
    repositoryPath?: string
    ticketId?: string
}

export interface ToolResult {
    context?: {
        [key: string]: unknown
        adrRelevant?: string[]
        changesSummary?: string
        filesAffected?: string[]
        relatedFiles?: string[]
    }
    data?: unknown
    error?: string
    success: boolean
}

export interface Tool {
    description: string
    execute: (params: Record<string, unknown>, context: ToolContext) => Promise<ToolResult>
    name: string
    parameters: ToolParameter[]
    validate?: (params: Record<string, unknown>) => ValidationResult
}

export interface ValidationResult {
    errors?: string[]
    valid: boolean
}

export interface CodebaseContext {
    dependencies: Record<string, string>
    entryPoints: string[]
    fileTree: FileTree
    packageJson: unknown
    tsconfig: unknown
}

export interface FileTree {
    children?: FileTree[]
    path: string
    type: 'file' | 'directory'
}

export interface ADRContext {
    adrs: Array<{
        content: string
        id: string
        score: number
        title: string
    }>
}

export interface GitState {
    branch: string
    modifiedFiles: string[]
    status: string
    untrackedFiles: string[]
}
