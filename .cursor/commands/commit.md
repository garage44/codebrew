# Commit Command

Create a conventional commit, commit changes, and push.

## Usage

```
/commit
```

## Workflow

1. **Analyze changes**: `git diff --cached` and `git diff`
2. **Write commit message**: Use conventional commit format `<type>(<scope>): <subject>`
3. **Stage**: `git add -A`
4. **Lint**: `./scripts/lint-staged.sh` (fix errors if any)
5. **Commit**: `/usr/bin/git commit --no-verify -m "message"` (use `/usr/bin/git` to avoid Co-authored-by trailer)
6. **Push**: `git push`

## Commit Types

- `feat`: New feature
- `fix`: Bug fix
- `refactor`: Code refactoring
- `chore`: Maintenance, dependencies
- `docs`: Documentation
- `style`: Formatting, whitespace
- `test`: Tests
- `perf`: Performance
- `ci`: CI/CD
- `build`: Build system

## Scope

Extract from package name (e.g., `packages/pyrite/` → `pyrite`). Omit if multiple packages.

## Notes

- Use `/usr/bin/git` instead of `git` to bypass Cursor wrapper
- Always use `--no-verify` to skip hooks (linting runs manually)
- Subject: imperative mood, lowercase, no period
