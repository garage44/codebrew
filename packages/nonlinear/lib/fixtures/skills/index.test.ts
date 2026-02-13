/**
 * Tests for skills registry
 */

import {describe, test, expect} from 'bun:test'
import {loadSkills, buildSkillSystemPrompt} from './index.ts'

describe('Skills Registry', () => {
    test('loadSkills loads all skills by default', () => {
        const skills = loadSkills()
        expect(skills.length).toBeGreaterThan(0)
        expect(skills.some((s) => s.name === 'frontend')).toBe(true)
        expect(skills.some((s) => s.name === 'backend')).toBe(true)
        expect(skills.some((s) => s.name === 'testing')).toBe(true)
    })

    test('loadSkills loads only specified skills', () => {
        const skills = loadSkills({skills: ['frontend', 'backend']})
        expect(skills.length).toBe(2)
        expect(skills.some((s) => s.name === 'frontend')).toBe(true)
        expect(skills.some((s) => s.name === 'backend')).toBe(true)
        expect(skills.some((s) => s.name === 'testing')).toBe(false)
    })

    test('buildSkillSystemPrompt creates prompt from skills', () => {
        const skills = loadSkills({skills: ['frontend']})
        const prompt = buildSkillSystemPrompt(skills)

        expect(prompt).toContain('FRONTEND SKILL')
        expect(prompt).toContain('Preact')
        expect(prompt).toContain('DeepSignal')
    })

    test('buildSkillSystemPrompt returns empty string for no skills', () => {
        const prompt = buildSkillSystemPrompt([])
        expect(prompt).toBe('')
    })
})
