/**
 * Testing skill
 */

import type {Skill} from './types.ts'

export const testingSkill: Skill = {
    name: 'testing',
    description: 'Testing expertise for Bun/TypeScript projects',
    systemPrompt: `You are an expert in testing Bun/TypeScript applications:
- Bun's built-in test runner
- Unit testing with mocks and fixtures
- Integration testing for API endpoints
- End-to-end testing for agent workflows
- Test organization and best practices

Key principles:
- Write tests for all tools and agent functionality
- Use Bun's test runner (bun test)
- Mock external APIs and services
- Test error handling and edge cases
- Keep tests fast and isolated
- Use descriptive test names
- Test both success and failure paths`,
    guidelines: [
        'Write tests for all new tools',
        'Mock Anthropic API responses for testing',
        'Test error handling and edge cases',
        'Keep tests fast and isolated',
        'Use descriptive test names',
        'Test both success and failure paths',
        'Use Bun\'s built-in test runner',
        'Test agent workflows end-to-end',
    ],
    examples: [
        'Writing unit tests for file tools',
        'Testing agent tool execution',
        'Mocking Anthropic API responses',
        'Testing error handling in tools',
    ],
}
