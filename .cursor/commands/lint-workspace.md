# Lint Workspace Command

Lint entire workspace or specific package.

## Usage

```
/lint-workspace [package]
```

## Workflow

1. **Auto-fix first**: Run `--fix` in each package directory
2. **Get errors**: Run linter once, read text output
3. **Fix errors**: Process files, don't re-run linter until done
4. **Verify**: Run linter once at end to confirm

## Commands

```bash
cd packages/{package}

# Auto-fix
bun run lint:ts-syntax -- --fix
bun run lint:ts-style -- --fix  
bun run lint:css -- --fix

# Check remaining errors (run ONCE, read output)
bun run lint:ts-syntax
bun run lint:ts-style
bun run lint:css
bun run lint:ts-types
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

Fix types at interface definitions, not usage sites:
- Find interface/type definition causing error
- Update definition to match actual usage
- Use type inference instead of explicit types
- Avoid adding conditionals just for TypeScript
