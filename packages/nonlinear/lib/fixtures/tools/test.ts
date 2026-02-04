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
        name: 'find_tests',
        description: 'Find existing tests for similar functionality or specific files. Use this to discover test patterns and similar test implementations.',
        parameters: [
            {
                name: 'forFile',
                type: 'string',
                description: 'Find tests for a specific file (relative path from repository root)',
                required: false,
            },
            {
                name: 'forFeature',
                type: 'string',
                description: 'Find tests for a feature/pattern (e.g., "authentication", "file upload", "error handling")',
                required: false,
            },
            {
                name: 'testType',
                type: 'string',
                description: 'Filter by test type (unit, integration, e2e)',
                required: false,
            },
        ],
        execute: async (params: {
            forFile?: string
            forFeature?: string
            testType?: string
        }, context: ToolContext): Promise<ToolResult> => {
            try {
                if (!context.repositoryPath) {
                    return {
                        success: false,
                        error: 'Repository path not available in context',
                    }
                }

                if (!context.repositoryId) {
                    return {
                        success: false,
                        error: 'Repository ID not available in context',
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
                        limit: 10,
                        fileType: 'ts',
                    })

                    // Filter to test files
                    testFiles = codeResults
                        .map(r => r.file_path)
                        .filter(file => /\.(test|spec)\.(ts|tsx|js|jsx)$/.test(file))
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
                        unit: /(unit|\.test\.)/i,
                        integration: /(integration|e2e|\.spec\.)/i,
                        e2e: /(e2e|end-to-end)/i,
                    }
                    const pattern = typePatterns[params.testType.toLowerCase()]
                    if (pattern) {
                        testFiles = testFiles.filter(file => pattern.test(file))
                    }
                }

                // Remove duplicates and make relative paths
                testFiles = [...new Set(testFiles)].map(file => {
                    return path.isAbsolute(file)
                        ? path.relative(context.repositoryPath!, file)
                        : file
                })

                // Enrich with file content preview
                const enriched = await Promise.all(
                    testFiles.slice(0, 20).map(async (filePath) => {
                        const fullPath = path.isAbsolute(filePath)
                            ? filePath
                            : path.join(context.repositoryPath!, filePath)
                        try {
                            const content = await Bun.file(fullPath).text()
                            const lines = content.split('\n')
                            const structure = lines
                                .slice(0, 50)
                                .filter(line => /^(describe|it|test|beforeEach|afterEach|beforeAll|afterAll)\s*\(/.test(line))
                                .map(line => line.trim().substring(0, 100))

                            return {
                                path: filePath,
                                structure: structure.slice(0, 10),
                                lineCount: lines.length,
                            }
                        } catch {
                            return {
                                path: filePath,
                                structure: [],
                                lineCount: 0,
                            }
                        }
                    })
                )

                return {
                    success: true,
                    data: enriched,
                    context: {
                        totalTests: testFiles.length,
                        forFile: params.forFile,
                        forFeature: params.forFeature,
                        testType: params.testType,
                    },
                }
            } catch (error) {
                logger.error(`[TestTool] Failed to find tests:`, error)
                return {
                    success: false,
                    error: error instanceof Error ? error.message : String(error),
                }
            }
        },
    },
}
