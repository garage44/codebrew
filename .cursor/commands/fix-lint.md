# Fix Lint Command

Fix linting and TypeScript errors in changed files only. Optimized for low token usage.

## Usage

```
/fix-lint
```

## Workflow

1. **Get changed files**: Use `git diff --name-only` to get list of changed files
   - Only process files that have been modified
   - Filter to TypeScript/TSX/CSS files

2. **Run linting on changed files**:
   ```bash
   # For TypeScript files
   bunx oxlint --fix <file1> <file2> ...
   bunx eslint --fix <file1> <file2> ...
   
   # For CSS files
   bunx stylelint --fix <file1> <file2> ...
   ```

3. **Check TypeScript types** (only on changed files):
   ```bash
   bun tsgo --noEmit <file1> <file2> ...
   ```

4. **Auto-fix what can be fixed**: Use `--fix` flags - these handle most formatting issues

5. **Report remaining errors**: Show only actual errors (not warnings) concisely

6. **Apply TypeScript inference strategy**: For TypeScript errors:
   - Trace errors back to interface/type definitions
   - Fix types at source (interfaces/types) rather than adding conditionals
   - Use type inference where possible
   - Avoid `as Type` assertions and unnecessary `!` operators

## Focus Areas

- **Errors only**: Ignore warnings unless they're critical
- **Changed files**: Don't lint entire codebase
- **Auto-fix first**: Use `--fix` flags before manual fixes
- **TypeScript at source**: Fix interface definitions, not usage sites

## TypeScript Error Handling

When TypeScript errors appear:

1. **Read error carefully**: Understand the type mismatch
2. **Find the type definition**: Trace through imports to find interface/type
3. **Fix at source**: Update the interface/type definition to match actual usage
4. **Use inference**: Remove explicit types when TypeScript can infer
5. **Avoid conditionals**: Don't add `if (x !== undefined)` just for TypeScript

**Example:**
- Error: `Property 'name' does not exist on type 'User | undefined'`
- Bad fix: Add `if (user?.name)` everywhere
- Good fix: Update `User` interface - if `name` is always present, make it `name: string` not `name?: string`

## Output Format

Keep output concise:
- List files with errors
- Show error count per file
- Only show errors that need manual fixing (after auto-fix)
- Group by file for easy scanning

## Token Optimization

- Only show errors, not full file contents
- Focus on error messages and line numbers
- Don't repeat auto-fixed issues
- Batch similar errors together
