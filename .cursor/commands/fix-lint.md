# Fix Lint Command

Fix linting errors in changed files only.

## Usage

```
/fix-lint
```

## Workflow

1. **Get changed files**: `git diff --name-only HEAD | grep -E '\.(ts|tsx|css)$'`
2. **Auto-fix**: Run lint commands in package directory (lint:ts auto-fixes style, then syntax)
3. **Get errors**: Run linter once, read output
4. **Fix errors**: Process files, don't re-run linter until done
5. **Verify**: Run linter once at end

## Commands

```bash
# Get changed files
git diff --name-only HEAD | grep -E '\.(ts|tsx|css)$'

# Auto-fix (in package directory)
cd packages/{package}
bun run lint:ts  # Runs lint:ts-style (auto-fixes), lint:ts-syntax (auto-fixes), lint:ts-types
bun run lint:css -- --fix

# Check errors (run ONCE)
bun run lint:ts  # Runs all TypeScript linting (style, syntax, types)
bun run lint:css
```

## Rules

- ✅ Auto-fix first
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
- For DeepSignal Record access, use type assertions: `const channels = $s.chat.channels as PyriteState['chat']['channels']`
