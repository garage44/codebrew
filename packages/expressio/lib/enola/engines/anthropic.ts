import type {EnolaEngine, EnolaEngineConfig, EnolaLogger, EnolaTag, TargetLanguage} from '../types.ts'

import {target} from '../languages.ts'

interface FetchOptions extends RequestInit {
    data?: {
        max_tokens?: number
        messages: {
            content: string
            role: string
        }[]
        model: string
    }
    params?: Record<string, string>
}

// Add interface for API response
interface AnthropicResponse {
    content: {text: string}[]
    headers?: {
        limit: number
        remaining: number
        reset: string
    }
    usage?: {
        input_tokens: number
        output_tokens: number
    }
}

export default class Anthropic implements EnolaEngine {
    base_url = 'https://api.anthropic.com/v1'

    config: EnolaEngineConfig = {
        active: false,
        api_key: '',

        name: 'anthropic',
        usage: {
            count: 0, // Will store total tokens used
            limit: 1_000_000, // Example limit - adjust as needed
        },
    }

    logger!: EnolaLogger

    async init(engine_config: {api_key: string; base_url: string}, logger: EnolaLogger): Promise<void> {
        this.logger = logger

        if (engine_config.api_key) {
            await this.activate(engine_config)
        }
    }

    async activate(engine_config: {api_key: string; base_url: string}): Promise<void> {
        this.config.api_key = engine_config.api_key
        this.logger.info('[enola-anthropic] activating...')
        try {
            this.logger.info('[enola-anthropic] initializing...')
            const response = (await this.fetch('/messages', {method: 'GET'})) as AnthropicResponse

            if (response.headers) {
                this.config.usage.limit = response.headers.limit
                this.config.usage.count = response.headers.limit - response.headers.remaining
            }

            await this.usage() // This will log the initial usage stats
        } catch (error) {
            this.logger.error(`Anthropic initialization failed (${error})`)
            process.exit(1)
        }

        this.config.active = true
    }

    async deactivate() {
        this.logger.info('[enola-anthropic] deactivating...')
        this.config.api_key = ''
        this.config.active = false
    }

    async fetch(endpoint: string, options: FetchOptions = {}): Promise<AnthropicResponse> {
        const url = new URL(`${this.base_url}${endpoint}`)

        const headers = {
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
            'x-api-key': this.config.api_key,
            ...options.headers,
        }

        const fetchOptions: RequestInit = {
            headers,
            method: options.method || 'POST',
        }

        if (options.data) {
            fetchOptions.body = JSON.stringify(options.data)
        }

        const response = await fetch(url, fetchOptions)
        const json = await response.json()

        return {
            ...json,
            headers: {
                limit: Number.parseInt(response.headers.get('anthropic-ratelimit-tokens-limit') || '100000', 10),
                remaining: Number.parseInt(response.headers.get('anthropic-ratelimit-tokens-remaining') || '100000', 10),
                reset: response.headers.get('anthropic-ratelimit-tokens-reset') || '',
            },
        }
    }

    async suggestion(tagPath: string[], sourceText: string, similarTranslations: {path: string[]; source: string}[]) {
        this.logger.info(`[enola-anthropic] requesting suggestion for: ${sourceText}...`)
        // Build examples section if we have existing translations
        let examplesSection = ''
        if (similarTranslations?.length) {
            examplesSection = `
EXISTING TRANSLATION EXAMPLES:
${similarTranslations
    .slice(0, 5)
    .map(
        (example) =>
            `Key: ${example.path.join('.')}
Source text: ${example.source}`,
    )
    .join('\n\n')}

Use these examples to maintain a consistent style and tone.
`
        }

        const prompt = `CODE ANALYSIS TASK
===
I found this translation tag in the source code: ${sourceText}
The translation key path is: ${tagPath.join('.')}
${examplesSection}

CRITICAL INSTRUCTIONS:
- Analyze the code context where this translation tag appears
- Determine the most appropriate source text for this translation tag
- Return only the source text, nothing else
- Keep it simple and direct
- The text should match the style of the example translations if provided
- The text should make sense for its location in the code
- Do not include quotes or special formatting
- If you see placeholder patterns like {name} or %s, preserve them exactly

===
SUGGESTED SOURCE TEXT:`

        const response = await this.fetch('/messages', {
            data: {
                max_tokens: 1024,
                messages: [
                    {
                        content: prompt,
                        role: 'user',
                    },
                ],
                model: 'claude-sonnet-4-20250514',
            },
        })

        if (!response.content || !response.content[0] || !response.content[0].text) {
            throw new Error(`Invalid response from Claude API: ${JSON.stringify(response)}`)
        }

        // Clean up the suggested text
        let suggestedText = response.content[0].text.trim()
        suggestedText = suggestedText.replaceAll(/[«»""]/g, '') // Remove guillemets and smart quotes
        suggestedText = suggestedText.replaceAll(/^['"]|['"]$/g, '') // Remove single or double quotes at start/end

        // Update usage statistics if available
        if (response.usage) {
            const totalTokens = response.usage.input_tokens + response.usage.output_tokens
            this.config.usage.count += totalTokens
            this.logger.info(
                `[enola-anthropic] Used ${totalTokens} tokens for context analysis (${this.config.usage.count} total)`,
            )
        }

        this.logger.info(`[enola-anthropic] suggestion: ${suggestedText}`)
        return suggestedText
    }

    /**
     * Translate text using Claude
     * @param tag The text to translate with source and context
     * @param targetLanguage The target language configuration
     * @returns The translated text
     */
    async translate(tag: EnolaTag, targetLanguage: TargetLanguage) {
        const language = target.find((lang) => lang.id === targetLanguage.id)
        if (!language) {
            throw new Error(`Language ${targetLanguage.id} not found`)
        }
        const prompt = `TRANSLATION TASK
===
You are translating this sentence: "${tag.source}"
To language: ${targetLanguage.id} (${language.name})

CRITICAL INSTRUCTIONS:
- Translate the complete sentence naturally
- Keep it simple and direct
- Do not invent words
- Do not add symbols or markers
- If you see {{placeholder}}, keep it exactly as is
- Any text surrounded by <i></i> tags must be kept exactly as is, without translation
- Do not modify or translate the content inside <i></i> tags

===
TRANSLATE THE SENTENCE HERE:`

        const response = await this.fetch('/messages', {
            data: {
                max_tokens: 1024,
                messages: [
                    {
                        content: prompt,
                        role: 'user',
                    },
                ],
                model: 'claude-3-sonnet-20240229',
            },
        })

        if (!response.content || !response.content[0] || !response.content[0].text) {
            throw new Error('Invalid response from Claude API')
        }

        // Update usage statistics if available
        if (response.usage) {
            const totalTokens = response.usage.input_tokens + response.usage.output_tokens
            this.config.usage.count += totalTokens
            this.logger.info(`[enola-anthropic] Used ${totalTokens} tokens (${this.config.usage.count} total)`)
        }

        // Clean up the translation by removing quotes and special characters
        let translation = response.content[0].text.trim()
        translation = translation.replaceAll(/[«»""]/g, '') // Remove guillemets and smart quotes
        translation = translation.replaceAll(/^['"]|['"]$/g, '') // Remove single or double quotes at start/end
        translation = translation.replaceAll(/<\/?i>/g, '') // Remove <i> and </i> tags while keeping their content

        this.logger.info(`[enola-anthropic] ${targetLanguage.id}: ${translation}`)
        return translation
    }

    async usage() {
        // Return current usage statistics
        const percentage = (this.config.usage.count / this.config.usage.limit) * 100
        this.logger.info(
            `[enola-anthropic] usage: ${this.config.usage.count} of ${this.config.usage.limit} tokens (${percentage.toFixed(2)}%)`,
        )
        return this.config.usage
    }

    async translateBatch(batch: EnolaTag[], targetLanguage: TargetLanguage) {
        const language = target.find((lang) => lang.id === targetLanguage.id)
        if (!language) {
            throw new Error(`Language ${targetLanguage.id} not found`)
        }
        const sourceStrings = batch.map((tag) => tag.source)

        const prompt = `BATCH TRANSLATION TASK
===
You are translating these sentences to ${targetLanguage.id} (${language.name}):

${sourceStrings.map((text, index) => `${index + 1}. "${text}"`).join('\n')}

CRITICAL INSTRUCTIONS:
- Translate each sentence naturally
- Keep them simple and direct
- Do not invent words
- Do not add symbols or markers
- If you see {{placeholder}}, keep it exactly as is
- Any text surrounded by <i></i> tags must be kept exactly as is, without translation
- Do not modify or translate the content inside <i></i> tags
- Return translations in a numbered list matching the input order

===
TRANSLATIONS:`

        const response = await this.fetch('/messages', {
            data: {
                max_tokens: 2048,
                messages: [
                    {
                        content: prompt,
                        role: 'user',
                    },
                ],
                model: 'claude-3-sonnet-20240229',
            },
        })

        if (!response.content || !response.content[0] || !response.content[0].text) {
            throw new Error('Invalid response from Claude API')
        }

        // Update usage statistics if available
        if (response.usage) {
            const totalTokens = response.usage.input_tokens + response.usage.output_tokens
            this.config.usage.count += totalTokens
            this.logger.info(
                `[enola-anthropic] Used ${totalTokens} tokens for batch translation (${this.config.usage.count} total)`,
            )
        }

        // Parse the numbered list response and clean up each translation
        const translations = response.content[0].text
            .split('\n')
            .filter((line) => /^\d+\./.test(line))
            .map((line) => {
                let translation = line.replace(/^\d+\.\s*/, '').trim()
                translation = translation.replaceAll(/[«»""]/g, '') // Remove guillemets and smart quotes
                translation = translation.replaceAll(/^['"]|['"]$/g, '') // Remove single or double quotes at start/end
                translation = translation.replaceAll(/<\/?i>/g, '') // Remove <i> and </i> tags while keeping their content
                return translation
            })
        // Match the translations with their original tags
        return batch.map((_tag, index) => {
            const translation = translations[index]
            this.logger.info(`[enola-anthropic] ${targetLanguage.id}: ${translation}`)
            return translation
        })
    }
}
