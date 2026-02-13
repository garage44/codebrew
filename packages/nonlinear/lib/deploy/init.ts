import {writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {findWorkspaceRoot} from './workspace'

/**
 * Initialize AGENTS.md file in project root
 */
export async function init(): Promise<void> {
    const workspaceRoot = findWorkspaceRoot() || process.cwd()
    const agentsPath = join(workspaceRoot, 'AGENTS.md')

    const content = `# Agent Context

Documentation and architectural patterns are available via @garage44/nonlinear.

See: node_modules/@garage44/nonlinear/lib/fixtures/

- ADRs: node_modules/@garage44/nonlinear/lib/fixtures/architecture/adr/
- Rules: node_modules/@garage44/nonlinear/lib/fixtures/rules/
- Patterns: node_modules/@garage44/nonlinear/lib/fixtures/architecture/adr/guide/PATTERNS.md

## Documentation Structure

The nonlinear package contains:
- **ADRs**: Architecture Decision Records documenting key decisions
- **Rules**: Cursor rules for frontend and backend development
- **Patterns**: Reusable decision-making patterns

## Usage

When installed in a project, nonlinear provides:
- Documentation framework
- Deployment automation
- Webhook integration
- NPM publishing tools
- AI-powered project management

Access the documentation via the nonlinear package or visit the deployed instance.
`

    try {
        await writeFile(agentsPath, content, 'utf8')
        // eslint-disable-next-line no-console
        console.log(`✅ Created AGENTS.md at ${agentsPath}`)
    } catch(error) {
        // eslint-disable-next-line no-console
        console.error('❌ Failed to create AGENTS.md:', error)
        throw error
    }
}
