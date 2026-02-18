/**
 * Stub for @garage44/nonlinear/lib/database - prevents codebrew from type-checking
 * nonlinear's source (which uses @/ paths that resolve incorrectly in codebrew's tsconfig).
 */
import type {Database} from 'bun:sqlite'

export interface DatabaseLogger {
    error(message: string, ...args: unknown[]): void
    info(message: string, ...args: unknown[]): void
    warn(message: string, ...args: unknown[]): void
}

export function initDatabase(dbPath?: string, logger?: DatabaseLogger): Database
