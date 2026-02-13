/**
 * Tests for file tools
 */

import {describe, test, expect, beforeEach} from 'bun:test'
import {fileTools} from './file.ts'
import type {BaseAgent} from '../../agent/base.ts'
// Bun is a global in Bun runtime
import path from 'node:path'
import {tmpdir} from 'node:os'

// Mock BaseAgent
class MockAgent {
    name = 'TestAgent'

    type = 'developer' as const
}

describe('File Tools', () => {
    let testDir: string
    let testFile: string

    beforeEach(async() => {
        testDir = path.join(tmpdir(), `nonlinear-test-${Date.now()}`)
        await Bun.write(testDir, '')
        testFile = path.join(testDir, 'test.txt')
    })

    test('read_file reads file content', async() => {
        const content = 'Hello, World!'
        await Bun.write(testFile, content)

        const context = {
            agent: new MockAgent() as unknown as BaseAgent,
            repositoryPath: testDir,
        }

        const result = await fileTools.read_file.execute({path: 'test.txt'}, context)

        expect(result.success).toBe(true)
        expect(result.data).toBe(content)
    })

    test('read_file returns error for invalid path', async() => {
        const context = {
            agent: new MockAgent() as unknown as BaseAgent,
            repositoryPath: testDir,
        }

        const result = await fileTools.read_file.execute({path: '../../etc/passwd'}, context)

        expect(result.success).toBe(false)
        expect(result.error).toBeDefined()
    })

    test('write_file writes file content', async() => {
        const content = 'New content'
        const context = {
            agent: new MockAgent() as unknown as BaseAgent,
            repositoryPath: testDir,
        }

        const result = await fileTools.write_file.execute({
            content,
            path: 'new-file.txt',
        }, context)

        expect(result.success).toBe(true)

        const writtenContent = await Bun.file(path.join(testDir, 'new-file.txt')).text()
        expect(writtenContent).toBe(content)
    })

    test('search_files finds files by pattern', async() => {
        await Bun.write(path.join(testDir, 'test1.ts'), 'content1')
        await Bun.write(path.join(testDir, 'test2.ts'), 'content2')
        await Bun.write(path.join(testDir, 'test.js'), 'content3')

        const context = {
            agent: new MockAgent() as unknown as BaseAgent,
            repositoryPath: testDir,
        }

        const result = await fileTools.search_files.execute({
            pattern: '*.ts',
        }, context)

        expect(result.success).toBe(true)
        expect(Array.isArray(result.data)).toBe(true)
        const files = result.data as Array<{path: string}>
        expect(files.length).toBeGreaterThan(0)
        expect(files.every((f) => f.path.endsWith('.ts'))).toBe(true)
    })
})
