/**
 * Tests for tool registry
 */

import {describe, test, expect} from 'bun:test'
import {loadTools, toolToAnthropic} from './index.ts'

describe('Tool Registry', () => {
    test('loadTools loads all tools by default', () => {
        const tools = loadTools()
        expect(Object.keys(tools).length).toBeGreaterThan(0)
        expect(tools.read_file).toBeDefined()
        expect(tools.write_file).toBeDefined()
        expect(tools.run_command).toBeDefined()
    })

    test('loadTools loads only specified tools', () => {
        const tools = loadTools({tools: ['read_file', 'write_file']})
        expect(Object.keys(tools).length).toBe(2)
        expect(tools.read_file).toBeDefined()
        expect(tools.write_file).toBeDefined()
        expect(tools.run_command).toBeUndefined()
    })

    test('toolToAnthropic converts tool to Anthropic format', () => {
        const tool = {
            description: 'Test tool',
            execute: async() => ({success: true}),
            name: 'test_tool',
            parameters: [
                {
                    description: 'Parameter 1',
                    name: 'param1',
                    required: true,
                    type: 'string',
                },
                {
                    description: 'Parameter 2',
                    name: 'param2',
                    required: false,
                    type: 'number',
                },
            ],
        }

        const anthropicTool = toolToAnthropic(tool)

        expect(anthropicTool.name).toBe('test_tool')
        expect(anthropicTool.description).toBe('Test tool')
        expect(anthropicTool.input_schema.type).toBe('object')
        expect(anthropicTool.input_schema.properties.param1).toBeDefined()
        expect(anthropicTool.input_schema.properties.param2).toBeDefined()
        expect(anthropicTool.input_schema.required).toContain('param1')
    })
})
