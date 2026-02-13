/**
 * Adaptive CI Runner
 * Runs Bun-specific CI commands and automatically fixes issues
 */

import {randomId} from '@garage44/common/lib/utils'
import {$} from 'bun'

import {logger} from '../../service.ts'
import {updateUsageFromHeaders} from '../agent/token-usage.ts'
import {config} from '../config.ts'
import {getDb} from '../database.ts'

export interface CIRunResult {
    error?: string
    fixesApplied: {command: string; output: string}[]
    output: string
    success: boolean
}

export class CIRunner {
    private apiKey: string

    private maxAttempts: number

    private timeout: number

    constructor() {
        const apiKey = config.anthropic.apiKey || process.env.ANTHROPIC_API_KEY
        if (!apiKey) {
            throw new Error('Anthropic API key not configured for CI runner')
        }

        this.apiKey = apiKey
        this.maxAttempts = config.ci.maxFixAttempts || 3
        // 10 minutes
        this.timeout = config.ci.timeout || 600_000
    }

    /**
     * Run CI for a ticket
     */
    async run(ticketId: string, repoPath: string): Promise<CIRunResult> {
        const runId = randomId()
        const startedAt = Date.now()

        // Create CI run record
        getDb()
            .prepare(`
            INSERT INTO ci_runs (id, ticket_id, status, started_at)
            VALUES (?, ?, 'running', ?)
        `)
            .run(runId, ticketId, startedAt)

        logger.info(`[CI] Starting CI run ${runId} for ticket ${ticketId}`)

        const originalCwd = process.cwd()
        const fixesApplied: {command: string; output: string}[] = []

        try {
            process.chdir(repoPath)

            let attempt = 0
            let lastError: string | null = null

            while (attempt < this.maxAttempts) {
                attempt += 1

                // Run tests
                logger.info(`[CI] Running tests (attempt ${attempt}/${this.maxAttempts})`)
                // eslint-disable-next-line no-await-in-loop
                const testResult = await $`bun test`.quiet().nothrow()

                if (testResult.exitCode === 0) {
                    // Tests passed, run linting
                    logger.info('[CI] Tests passed, running linting')
                    // eslint-disable-next-line no-await-in-loop
                    const lintResult = await $`bun run lint:ts`.quiet().nothrow()

                    if (lintResult.exitCode === 0) {
                        // Everything passed
                        const output = 'Tests: PASSED\nLinting: PASSED'
                        this.completeRun(runId, 'success', output, fixesApplied)
                        return {
                            fixesApplied,
                            output,
                            success: true,
                        }
                    }
                    // Linting failed
                    const lintError = lintResult.stderr?.toString() || lintResult.stdout?.toString() || 'Unknown linting error'
                    lastError = `Linting failed: ${lintError}`

                    if (attempt < this.maxAttempts) {
                        logger.info('[CI] Linting failed, attempting auto-fix')
                        // eslint-disable-next-line no-await-in-loop
                        const fixResult = await this.attemptFix('linting', lintError, repoPath)
                        if (fixResult) {
                            fixesApplied.push(fixResult)
                            // Retry after fix - continue is necessary here for retry logic
                            // eslint-disable-next-line no-continue
                            continue
                        }
                    }
                } else {
                    // Tests failed
                    const testError = testResult.stderr?.toString() || testResult.stdout?.toString() || 'Unknown test error'
                    lastError = `Tests failed: ${testError}`

                    if (attempt < this.maxAttempts) {
                        logger.info('[CI] Tests failed, attempting auto-fix')
                        // eslint-disable-next-line no-await-in-loop
                        const fixResult = await this.attemptFix('tests', testError, repoPath)
                        if (fixResult) {
                            fixesApplied.push(fixResult)
                            // Retry after fix - continue is necessary here for retry logic
                            // eslint-disable-next-line no-continue
                            continue
                        }
                    }
                }
            }

            // Max attempts reached, still failing
            const output = `Failed after ${this.maxAttempts} attempts\n\nLast error:\n${lastError}`
            this.completeRun(runId, 'failed', output, fixesApplied)
            return {
                error: lastError || 'Unknown error',
                fixesApplied,
                output,
                success: false,
            }
        } catch (error: unknown) {
            const errorMsg = error instanceof Error ? error.message : String(error)
            logger.error(`[CI] Error during CI run: ${errorMsg}`)
            this.completeRun(runId, 'failed', `Error: ${errorMsg}`, fixesApplied)
            return {
                error: errorMsg,
                fixesApplied,
                output: `Error: ${errorMsg}`,
                success: false,
            }
        } finally {
            process.chdir(originalCwd)
        }
    }

    /**
     * Attempt to automatically fix CI issues
     */
    private async attemptFix(
        issueType: 'tests' | 'linting',
        errorOutput: string,
        repoPath: string,
    ): Promise<{command: string; output: string} | null> {
        try {
            // Use LLM to generate fix command
            const systemPrompt = `You are a CI automation agent for a Bun/TypeScript project.

When CI fails, you need to generate a command to fix the issue automatically.

For linting errors, use: bun run lint:ts --fix
For test failures, analyze the error and suggest appropriate fixes.

Respond with a JSON object:
{
    "command": "the command to run",
    "explanation": "why this command should fix the issue"
}`

            const userMessage = `CI ${issueType} failed with this error:

${errorOutput}

Generate a command to fix this issue.`

            // Use raw fetch to access rate limit headers
            const response = await fetch('https://api.anthropic.com/v1/messages', {
                body: JSON.stringify({
                    max_tokens: 1024,
                    messages: [
                        {
                            content: userMessage,
                            role: 'user',
                        },
                    ],
                    model: config.anthropic.model || 'claude-3-5-sonnet-20241022',
                    system: systemPrompt,
                }),
                headers: {
                    'anthropic-version': '2023-06-01',
                    'content-type': 'application/json',
                    'x-api-key': this.apiKey,
                },
                method: 'POST',
            })

            if (!response.ok) {
                const error = await response.json().catch((): {error: {message: string}} => ({error: {message: 'Unknown error'}}))
                throw new Error(error.error?.message || `API error: ${response.status}`)
            }

            const data = await response.json()

            // Extract rate limit headers
            const limitHeader = response.headers.get('anthropic-ratelimit-tokens-limit')
            const remainingHeader = response.headers.get('anthropic-ratelimit-tokens-remaining')
            const resetHeader = response.headers.get('anthropic-ratelimit-tokens-reset')

            logger.debug('[CI Runner] API Response Headers:')
            logger.debug(`  anthropic-ratelimit-tokens-limit: ${limitHeader}`)
            logger.debug(`  anthropic-ratelimit-tokens-remaining: ${remainingHeader}`)
            logger.debug(`  anthropic-ratelimit-tokens-reset: ${resetHeader}`)
            logger.debug(`  All headers: ${JSON.stringify(Object.fromEntries(response.headers.entries()))}`)

            if (limitHeader && remainingHeader) {
                const limit = Number.parseInt(limitHeader, 10)
                const remaining = Number.parseInt(remainingHeader, 10)
                const used = limit - remaining

                logger.info(`[CI Runner] Token Usage: ${used}/${limit} (${remaining} remaining)`)

                updateUsageFromHeaders({
                    limit,
                    remaining,
                    ...(resetHeader === null ? {} : {reset: resetHeader}),
                })
            } else {
                logger.warn('[CI Runner] Rate limit headers not found in response')
            }

            const content = data.content[0]
            if (content.type !== 'text') {
                return null
            }

            // Parse response
            let fixPlan: {command: string; explanation: string} = {command: '', explanation: ''}
            try {
                const jsonMatch = content.text.match(/```json\n([\s\S]*?)\n```/) || content.text.match(/```\n([\s\S]*?)\n```/)
                const jsonStr = jsonMatch ? jsonMatch[1] : content.text
                fixPlan = JSON.parse(jsonStr)
            } catch {
                // Fallback: try common fix commands
                if (issueType === 'linting') {
                    fixPlan = {
                        command: 'bun run lint:ts --fix',
                        explanation: 'Auto-fix linting errors',
                    }
                } else {
                    // Can't auto-fix test failures easily
                    return null
                }
            }

            // Execute fix command
            logger.info(`[CI] Running fix command: ${fixPlan.command}`)
            const fixResult = await $`${fixPlan.command}`.quiet().nothrow()

            const fixOutput = fixResult.stdout?.toString() || fixResult.stderr?.toString() || ''

            if (fixResult.exitCode === 0) {
                logger.info(`[CI] Fix applied successfully: ${fixPlan.explanation}`)
                return {
                    command: fixPlan.command,
                    output: fixOutput,
                }
            }
            logger.warn(`[CI] Fix command failed: ${fixOutput}`)
            return null
        } catch (error: unknown) {
            logger.error(`[CI] Error attempting fix: ${error}`)
            return null
        }
    }

    private completeRun(
        runId: string,
        status: 'success' | 'failed' | 'fixed',
        output: string,
        fixesApplied: {command: string; output: string}[],
    ): void {
        getDb()
            .prepare(`
            UPDATE ci_runs
            SET status = ?,
                output = ?,
                fixes_applied = ?,
                completed_at = ?
            WHERE id = ?
        `)
            .run(status, output, JSON.stringify(fixesApplied), Date.now(), runId)
    }
}
