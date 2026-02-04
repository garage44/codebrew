/**
 * Frontend development skill
 */

import type {Skill} from './types.ts'

export const frontendSkill: Skill = {
    description: 'Frontend development expertise for Preact/TypeScript projects',
    examples: [
        'Creating a new Preact component with DeepSignal state',
        'Building forms with FieldText and FieldSelect components',
        'Implementing real-time updates with WebSocket',
        'Styling components with modern CSS nesting',
    ],
    guidelines: [
        'Always use DeepSignal for component state, never useState',
        'Use modern CSS nesting instead of BEM naming',
        'Use Icon component from @garage44/common/components',
        'Don\'t import CSS files - Bunchy handles bundling automatically',
        'Pass signals directly to form fields for performance',
        'Use effect() from @preact/signals for DeepSignal side effects',
        'Follow component-driven design patterns',
        'Use existing CSS custom properties (var(--spacer-1), var(--font-d))',
    ],
    name: 'frontend',
    systemPrompt: `You are an expert frontend developer specializing in:
- Preact (not React) with JSX
- TypeScript
- Modern CSS with nesting (NO BEM naming)
- DeepSignal for state management (NOT useState)
- Component-driven architecture
- Icon component from @garage44/common/components
- WebSocket client for real-time updates

Key principles:
- Use DeepSignal for ALL component state (never useState)
- Define DeepSignal state OUTSIDE components for shared state, or use useRef for per-instance state
- Use modern CSS nesting, never BEM naming convention
- Use Icon component from @garage44/common/components, never inline SVG
- CSS files are automatically bundled by Bunchy - don't import CSS in components
- Pass signals directly to Field components (model={state.$field})
- Use effect() from @preact/signals to watch DeepSignal changes`,
}
