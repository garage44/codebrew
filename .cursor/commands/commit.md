# Commit Command

Create a conventional commit, commit changes, and push.

## Usage

```
/commit
```

## Workflow

1. **Fix type/lint errors first**: Run `bun run lint` (fix any errors before proceeding)
2. **Analyze changes**: `git diff --cached` and `git diff`
3. **Write commit message**: Use conventional commit format `<type>(<scope>): <subject>`
4. **Stage**: `git add -A`
5. **Lint staged**: `./scripts/lint-staged.sh` (auto-fix staged files)
6. **Commit**: `git commit --no-verify -m "message"`
7. **Push**: `git push`

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

- Use `--no-verify` to skip hooks (linting runs manually)
- Subject: imperative mood, lowercase, no period
- Omit lint/tooling changes from the subject (e.g. script renames, eslint→oxfmt); focus on the main feature or fix
