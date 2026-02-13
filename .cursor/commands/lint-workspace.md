# Lint Workspace Command

Lint entire workspace or specific package.

## Usage

```
/lint-workspace [package]
```

## Workflow

1. **Auto-fix first**: Run lint commands in each package directory (`lint:ts` auto-fixes style, then syntax)
2. **Get errors**: Run linter once, read text output
3. **Fix errors**: Process files, don't re-run linter until done
4. **Verify**: Run linter once at end to confirm

## Commands

```bash
cd packages/{package}

# Auto-fix
bun run lint:ts  # Runs lint:ts-style (auto-fixes), lint:ts-syntax (auto-fixes), lint:ts-types
bun run lint:css -- --fix

# Check remaining errors (run ONCE, read output)
bun run lint:ts  # Runs all TypeScript linting (style, syntax, types)
bun run lint:css
```

## Rules

- ✅ Auto-fix first (handles 80%+ of issues)
- ✅ Read error output once, fix all errors, then verify
- ✅ Fix type definitions before usage sites
- ✅ Process one file completely before next
- ❌ Don't re-run linter after each fix
- ❌ Don't parse JSON (read text output directly)
- ❌ Don't process warnings (errors only)

## TypeScript Fix Strategy

**See `.cursor/skills/typescript-typing.md` for detailed TypeScript typing guidance, including DeepSignal state patterns.**

Quick reference:
- Fix types at interface definitions, not usage sites
- Find interface/type definition causing error
- Update definition to match actual usage
- Use type inference instead of explicit types
- Avoid adding conditionals just for TypeScript
- For DeepSignal Record access, use type assertions: `const channels = $s.chat.channels as PyriteState['chat']['channels']`
