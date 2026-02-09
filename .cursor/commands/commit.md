# Commit Command

Create a conventional commit, commit changes, and push to current branch.

## Usage

```
/commit
```

## Workflow

1. **Analyze changes**: Use `git diff --cached` and `git diff` to understand what changed
2. **Detect commit type**: Determine conventional commit type from changes:
   - `feat`: New feature
   - `fix`: Bug fix
   - `refactor`: Code refactoring
   - `chore`: Maintenance tasks, dependencies
   - `docs`: Documentation changes
   - `style`: Code style changes (formatting, whitespace)
   - `test`: Test additions/changes
   - `perf`: Performance improvements
   - `ci`: CI/CD changes
   - `build`: Build system changes
   - `revert`: Revert previous commit

3. **Determine scope**: Extract scope from changed files/packages:
   - If changes are in `packages/expressio/`: scope is `expressio`
   - If changes are in `packages/pyrite/`: scope is `pyrite`
   - If changes are in `packages/common/`: scope is `common`
   - If changes span multiple packages: omit scope or use `workspace`

4. **Generate commit message**: Write a clear, descriptive message following conventional commit format:
   ```
   <type>(<scope>): <subject>

   <body>

   <footer>
   ```
   
   - Subject: Imperative mood, lowercase, no period (e.g., "add user authentication")
   - Body: Explain what and why (optional but recommended for significant changes)
   - Footer: Breaking changes, issue references (optional)

5. **Stage all changes**: `git add -A`

6. **Run linting check**: Run custom lint-staged script to check and auto-fix staged files:
   ```bash
   ./scripts/lint-staged.sh
   ```
   This runs oxlint, eslint, and stylelint on staged files and auto-fixes issues.
   If linting fails, fix the errors before proceeding.

7. **Commit**: Prevent Co-authored-by trailer by using `/usr/bin/git` directly (bypasses Cursor's wrapper):
   
   Create commit message file:
   ```bash
   COMMIT_MSG_FILE=$(mktemp)
   echo "<message>" > "$COMMIT_MSG_FILE"
   echo "" >> "$COMMIT_MSG_FILE"
   echo "<body>" >> "$COMMIT_MSG_FILE"
   ```
   
   Then commit using full path to git:
   ```bash
   /usr/bin/git commit -F "$COMMIT_MSG_FILE"
   rm "$COMMIT_MSG_FILE"
   ```
   
   Or for single-line messages:
   ```bash
   /usr/bin/git commit -m "<message>"
   ```
   
   **IMPORTANT**: Use `/usr/bin/git` instead of `git` to bypass Cursor's wrapper that adds Co-authored-by trailers.

8. **Push**: `git push` (or `git push origin $(git branch --show-current)` if needed)

## Notes

- **Linting check runs before commit**: The custom `lint-staged.sh` script runs linters and auto-fixes issues
- **Commitlint validates**: The commit-msg hook validates the commit message format
- **If linting fails**: Fix the errors shown by the lint-staged script, then re-stage and commit
- **Lefthook pre-commit hook**: Disabled for sandbox environments (uses custom script instead)

## Examples

**Simple feature:**
```
feat(expressio): add batch translation endpoint

Adds POST /api/translations/batch endpoint for translating multiple strings at once.
Uses parallel processing for improved performance.
```

**Bug fix:**
```
fix(pyrite): resolve video strip layout overflow

Fixes issue where video strips would overflow container on small screens.
Uses CSS grid with minmax() for responsive layout.
```

**Refactoring:**
```
refactor(common): extract validation logic to separate module

Moves form validation utilities from components to lib/validation.ts for reuse.
No functional changes.
```

**Chore:**
```
chore: update dependencies

Updates bun to 1.2.0 and preact to 10.26.5.
```

## Implementation Steps

1. Run `git status` to see current state
2. Run `git diff --cached` for staged changes
3. Run `git diff` for unstaged changes
4. Analyze changes to determine type and scope
5. Write commit message following conventional commit format
6. Stage all: `git add -A`
7. Run linting check: `./scripts/lint-staged.sh` (fix any errors before proceeding)
8. Commit (prevent Co-authored-by trailer by using full git path):
   
   With body:
   ```bash
   COMMIT_MSG_FILE=$(mktemp)
   echo "type(scope): subject" > "$COMMIT_MSG_FILE"
   echo "" >> "$COMMIT_MSG_FILE"
   echo "body" >> "$COMMIT_MSG_FILE"
   /usr/bin/git commit -F "$COMMIT_MSG_FILE"
   rm "$COMMIT_MSG_FILE"
   ```
   
   Without body:
   ```bash
   /usr/bin/git commit -m "type(scope): subject"
   ```
9. Push: `git push`
