/**
 * Tool system types and interfaces
 */

import type {BaseAgent} from '../../agent/base.ts'

export interface ToolParameter {
    name: string
    type: string
    description: string
    required?: boolean
}

export interface ToolContext {
    ticketId?: string
    repositoryId?: string
    repositoryPath?: string
    branchName?: string
    agent: BaseAgent
    codebase?: CodebaseContext
    adrContext?: ADRContext
    gitState?: GitState
}

export interface ToolResult {
    success: boolean
    data?: unknown
    error?: string
    context?: {
        filesAffected?: string[]
        changesSummary?: string
        relatedFiles?: string[]
        adrRelevant?: string[]
    }
}

export interface Tool {
    name: string
    description: string
    parameters: ToolParameter[]
    execute: (params: Record<string, unknown>, context: ToolContext) => Promise<ToolResult>
    validate?: (params: Record<string, unknown>) => ValidationResult
}

export interface ValidationResult {
    valid: boolean
    errors?: string[]
}

export interface CodebaseContext {
    fileTree: FileTree
    packageJson: unknown
    tsconfig: unknown
    entryPoints: string[]
    dependencies: Record<string, string>
}

export interface FileTree {
    path: string
    type: 'file' | 'directory'
    children?: FileTree[]
}

export interface ADRContext {
    adrs: Array<{
        id: string
        title: string
        content: string
        score: number
    }>
}

export interface GitState {
    branch: string
    status: string
    modifiedFiles: string[]
    untrackedFiles: string[]
}
