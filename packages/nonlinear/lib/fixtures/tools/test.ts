/**
 * Test discovery tools
 * Find existing tests and test patterns
 */

import {logger} from '../../../service.ts'
import type {Tool, ToolContext, ToolResult} from './types.ts'
import {$} from 'bun'
import path from 'node:path'
import {searchCode} from '../../docs/code-embeddings.ts'

export const testTools: Record<string, Tool> = {
    find_tests: {
        description: 'Find existing tests for similar functionality or specific files. Use this to discover test patterns and similar test implementations.',
        execute: async(params: {
            forFeature?: string
            forFile?: string
            testType?: string
        }, context: ToolContext): Promise<ToolResult> => {
            try {
                if (!context.repositoryPath) {
                    return {
                        error: 'Repository path not available in context',
                        success: false,
                    }
                }

                if (!context.repositoryId) {
                    return {
                        error: 'Repository ID not available in context',
                        success: false,
                    }
                }

                let testFiles: string[] = []

                // Strategy 1: Find tests for specific file
                if (params.forFile) {
                    const filePath = params.forFile.replace(/\.(ts|tsx|js|jsx)$/, '')
                    const testPatterns = [
                        `${filePath}.test.ts`,
                        `${filePath}.test.tsx`,
                        `${filePath}.spec.ts`,
                        `${filePath}.spec.tsx`,
                        `${filePath}.test.js`,
                        `${filePath}.test.jsx`,
                    ]

                    // Also check test directories
                    const testDirPatterns = [
                        `**/__tests__/**/${path.basename(filePath)}.test.ts`,
                        `**/__tests__/**/${path.basename(filePath)}.test.tsx`,
                        `**/tests/**/${path.basename(filePath)}.test.ts`,
                        `**/tests/**/${path.basename(filePath)}.test.tsx`,
                    ]

                    for (const pattern of [...testPatterns, ...testDirPatterns]) {
                        const result = await $`find ${context.repositoryPath} -name ${pattern} -type f`
                            .cwd(context.repositoryPath)
                            .quiet()
                            .nothrow()
                            .text()
                        const files = result.split('\n').filter(Boolean)
                        testFiles.push(...files)
                    }
                }

                // Strategy 2: Search by feature/pattern using code search
                if (params.forFeature && testFiles.length === 0) {
                    const searchQuery = `test ${params.forFeature}`
                    const codeResults = await searchCode(searchQuery, context.repositoryId, {
                        fileType: 'ts',
                        limit: 10,
                    })

                    // Filter to test files
                    testFiles = codeResults
                        .map((r) => r.file_path)
                        .filter((file) => /\.(test|spec)\.(ts|tsx|js|jsx)$/.test(file))
                }

                // Strategy 3: Find all test files if no specific criteria
                if (testFiles.length === 0) {
                    const result = await $`find ${context.repositoryPath} -type f -name "*.test.ts" -o -name "*.test.tsx" -o -name "*.spec.ts" -o -name "*.spec.tsx"`
                        .cwd(context.repositoryPath)
                        .quiet()
                        .nothrow()
                        .text()
                    testFiles = result.split('\n').filter(Boolean)
                }

                // Filter by test type if specified
                if (params.testType) {
                    const typePatterns: Record<string, RegExp> = {
                        e2e: /(e2e|end-to-end)/i,
                        integration: /(integration|e2e|\.spec\.)/i,
                        unit: /(unit|\.test\.)/i,
                    }
                    const pattern = typePatterns[params.testType.toLowerCase()]
                    if (pattern) {
                        testFiles = testFiles.filter((file) => pattern.test(file))
                    }
                }

                // Remove duplicates and make relative paths
                testFiles = [...new Set(testFiles)].map((file) => {
                    return path.isAbsolute(file) ?
                            path.relative(context.repositoryPath!, file) :
                        file
                })

                // Enrich with file content preview
                const enriched = await Promise.all(
                    testFiles.slice(0, 20).map(async(filePath) => {
                        const fullPath = path.isAbsolute(filePath) ?
                            filePath :
                                path.join(context.repositoryPath!, filePath)
                        try {
                            const content = await Bun.file(fullPath).text()
                            const lines = content.split('\n')
                            const structure = lines
                                .slice(0, 50)
                                .filter((line) => /^(describe|it|test|beforeEach|afterEach|beforeAll|afterAll)\s*\(/.test(line))
                                .map((line) => line.trim().slice(0, 100))

                            return {
                                lineCount: lines.length,
                                path: filePath,
                                structure: structure.slice(0, 10),
                            }
                        } catch {
                            return {
                                lineCount: 0,
                                path: filePath,
                                structure: [],
                            }
                        }
                    }),
                )

                return {
                    context: {
                        forFeature: params.forFeature,
                        forFile: params.forFile,
                        testType: params.testType,
                        totalTests: testFiles.length,
                    },
                    data: enriched,
                    success: true,
                }
            } catch(error) {
                logger.error('[TestTool] Failed to find tests:', error)
                return {
                    error: error instanceof Error ? error.message : String(error),
                    success: false,
                }
            }
        },
        name: 'find_tests',
        parameters: [
            {
                description: 'Find tests for a specific file (relative path from repository root)',
                name: 'forFile',
                required: false,
                type: 'string',
            },
            {
                description: 'Find tests for a feature/pattern (e.g., "authentication", "file upload", "error handling")',
                name: 'forFeature',
                required: false,
                type: 'string',
            },
            {
                description: 'Filter by test type (unit, integration, e2e)',
                name: 'testType',
                required: false,
                type: 'string',
            },
        ],
    },
}
