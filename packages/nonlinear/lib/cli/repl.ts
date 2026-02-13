/**
 * REPL Interface for Interactive Agent CLI
 * Provides readline-based command interface similar to Claude Code
 */

import fs from 'fs-extra'
import {homedir} from 'node:os'
import path from 'node:path'
import readline from 'node:readline'

export interface REPLOptions {
    helpMessage?: string
    historyFile?: string
    onExit?: () => void
    onInput: (input: string) => Promise<void>
    prompt: string
    welcomeMessage?: string
}

export class REPL {
    private rl: readline.Interface

    private history: string[] = []

    private options: REPLOptions

    private historyFilePath: string

    constructor(options: REPLOptions) {
        this.options = options

        // Determine history file path
        const envHistoryPath = process.env.NONLINEAR_HISTORY_PATH
        this.historyFilePath = options.historyFile || envHistoryPath || path.join(homedir(), '.nonlinear_history')

        this.rl = readline.createInterface({
            historySize: 1000,
            input: process.stdin,
            output: process.stdout,
            prompt: options.prompt,
        })

        // Load history from file
        this.loadHistory()
    }

    /**
     * Load history from file
     */
    private async loadHistory(): Promise<void> {
        try {
            if (await fs.pathExists(this.historyFilePath)) {
                const content = await fs.readFile(this.historyFilePath, 'utf8')
                this.history = content.split('\n')
                    .map((line: string): string => line.trim())
                    .filter((line: string): boolean => line.length > 0)
                    .slice(-1000)
                // Keep last 1000 entries

                // Load history into readline
                ;(this.rl as unknown as {history: string[]}).history = [...this.history]
            }
        } catch{
            // Ignore errors loading history (file might not exist yet)
        }
    }

    /**
     * Save history to file
     */
    private async saveHistory(): Promise<void> {
        try {
            // Get current history from readline (includes what user typed)
            const currentHistory = (this.rl as {history?: string[]}).history || []
            const historyToSave = [...currentHistory]

            // Limit to last 1000 entries
            const limitedHistory = historyToSave.slice(-1000)

            // Write to file
            await fs.writeFile(this.historyFilePath, limitedHistory.join('\n') + '\n', 'utf8')
        } catch{
            // Ignore errors saving history (permissions, etc.)
        }
    }

    /**
     * Add command to history (avoid duplicates)
     */
    private addToHistory(command: string): void {
        // Don't add empty commands or duplicates of the last command
        if (!command || command.trim().length === 0) {
            return
        }

        // Remove if it's a duplicate of the last entry
        if (this.history.length > 0 && this.history.at(-1) === command) {
            return
        }

        // Add to history
        this.history.push(command)

        // Limit history size
        if (this.history.length > 1000) {
            this.history.shift()
        }

        // Update readline history
        (this.rl as unknown as {history: string[]}).history = [...this.history]
    }

    /**
     * Start the REPL loop
     */
    start(): void {
        // Show welcome message
        if (this.options.welcomeMessage) {
            // eslint-disable-next-line no-console
            console.log(this.options.welcomeMessage)
        }

        // Show help message
        if (this.options.helpMessage) {
            // eslint-disable-next-line no-console
            console.log(this.options.helpMessage)
        }

        // Set up event handlers
        this.rl.on('line', async(input: string): Promise<void> => {
            const trimmed = input.trim()

            // Handle empty input
            if (!trimmed) {
                this.rl.prompt()
                return
            }

            // Handle special commands
            if (trimmed === 'exit' || trimmed === 'quit' || trimmed === 'q') {
                await this.exit()
                return
            }

            if (trimmed === 'help' || trimmed === 'h') {
                if (this.options.helpMessage) {
                    // eslint-disable-next-line no-console
                    console.log(this.options.helpMessage)
                }
                this.rl.prompt()
                return
            }

            if (trimmed === 'clear' || trimmed === 'cls') {
                // eslint-disable-next-line no-console
                console.clear()
                this.rl.prompt()
                return
            }

            // Add to history (avoid duplicates)
            this.addToHistory(trimmed)

            // Process input
            try {
                await this.options.onInput(trimmed)
            } catch(error: unknown) {
                const errorMsg = error instanceof Error ? error.message : String(error)
                // eslint-disable-next-line no-console
                console.error(`\n❌ Error: ${errorMsg}\n`)
            }

            // Prompt for next input
            this.rl.prompt()
        })

        // Handle Ctrl+C
        this.rl.on('SIGINT', async(): Promise<void> => {
            const pc = await import('picocolors')
            // eslint-disable-next-line no-console
            console.log(`\n\n${pc.gray('Exiting...')}`)
            await this.exit()
        })

        // Save history on process exit
        process.on('exit', (): void => {
            // Sync save (process is exiting)
            try {
                const currentHistory = (this.rl as {history?: string[]}).history || []
                const limitedHistory = currentHistory.slice(-1000)
                fs.writeFileSync(this.historyFilePath, limitedHistory.join('\n') + '\n', 'utf8')
            } catch {
                // Ignore errors
            }
        })

        // Start prompt
        this.rl.prompt()
    }

    /**
     * Stop the REPL
     */
    async exit(): Promise<void> {
        // Save history before exiting
        await this.saveHistory()

        if (this.options.onExit) {
            this.options.onExit()
        }
        this.rl.close()
        throw new Error('REPL exited')
    }

    /**
     * Write output (for agent reasoning)
     */
    write(message: string): void {
        // Write without newline to allow streaming
        process.stdout.write(message)
    }

    /**
     * Write line (for agent responses)
     */
    writeline(message: string): void {
        // eslint-disable-next-line no-console
        console.log(message)
    }
}
