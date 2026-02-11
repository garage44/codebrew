# Lint Workspace Command

Lint entire workspace or specific package. Focuses on fixing types at interface definitions using TypeScript inference strategy.

## Usage

```
/lint-workspace [package]
```

If `package` is provided, lint only that package. Otherwise, lint entire workspace.

Examples:
- `/lint-workspace` - Lint entire workspace
- `/lint-workspace expressio` - Lint only expressio package
- `/lint-workspace pyrite` - Lint only pyrite package

## Workflow

1. **Determine scope**:
   - If package specified: `bun run --filter '@garage44/{package}' lint:ts`
   - If workspace: `bun run lint:ts`

2. **Run linting checks**:
   ```bash
   # TypeScript syntax (oxlint)
   bun run lint:ts-syntax

   # TypeScript style (eslint)
   bun run lint:ts-style

   # TypeScript types
   bun run lint:ts-types
   ```

3. **Analyze TypeScript errors**:
   - Read error messages carefully
   - Identify types causing issues
   - Trace errors back to interface/type definitions

4. **Fix types at source**:
   - Find interface/type definitions (trace through imports)
   - Update definitions to match actual usage patterns
   - Use type inference to simplify code
   - Avoid adding conditionals just to satisfy TypeScript

5. **Apply fixes**:
   - Fix interface/type definitions first
   - Let TypeScript inference work where possible
   - Only add type guards if value truly can be undefined/null
   - Remove unnecessary explicit types

## TypeScript Inference Strategy

**CRITICAL: Fix types at interface definitions, not at usage sites.**

### Principles

1. **Trace to source**: When seeing type errors, find the interface/type definition
2. **Fix at definition**: Update the interface/type to match reality
3. **Use inference**: Let TypeScript infer types instead of explicit annotations
4. **Avoid conditionals**: Don't add `if (x !== undefined)` checks just for TypeScript
5. **Avoid assertions**: Don't use `as Type` or `!` - fix the underlying type

### Examples

**❌ Bad: Adding conditionals everywhere**
```tsx
// Interface says optional, but it's always present
interface User {
  name?: string
}

// Bad: Adding checks everywhere
if (user?.name) {
  console.log(user.name)
}
```

**✅ Good: Fix the interface**
```tsx
// Fix at source - make it required if it's always present
interface User {
  name: string
}

// No conditionals needed
console.log(user.name)
```

**❌ Bad: Type assertions**
```tsx
const value = data as ExpectedType
const result = maybeNull!.property
```

**✅ Good: Fix type definition**
```tsx
// Fix function signature or interface
function processData(data: ExpectedType): Result {
  // Type is correct, no assertion needed
}
```

**❌ Bad: Explicit types when inference works**
```tsx
const items: string[] = ['a', 'b', 'c']
const user: User = { name: 'John' }
```

**✅ Good: Use inference**
```tsx
const items = ['a', 'b', 'c']  // inferred as string[]
const user = { name: 'John' }  // inferred from usage
```

### Error Handling Workflow

1. **Read error**: Understand the type mismatch
2. **Find type**: Locate the interface/type definition causing the issue
3. **Trace imports**: Follow imports to find where type is defined
4. **Determine cause**: Is the type definition wrong or the usage?
5. **Fix at source**: Update interface/type definition when possible
6. **Use inference**: Remove explicit types when TypeScript can infer
7. **Add guards only if needed**: If value can legitimately be undefined/null

## Output Format

- Group errors by file
- Show error count per file
- Focus on root cause (interface definitions)
- Minimize token usage by showing only relevant errors
- Highlight which interfaces/types need fixing

## Token Optimization

- Focus on interface/type definitions, not all usage sites
- Show error messages and affected interfaces
- Batch similar errors together
- Don't repeat information across files
