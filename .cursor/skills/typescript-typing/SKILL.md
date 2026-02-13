---
name: typescript-typing
description: Fix TypeScript type errors by updating interface definitions, not usage sites. Handles DeepSignal state typing patterns. Use when fixing TypeScript errors from lint:ts-types or when type errors are reported.
---

# TypeScript Typing Fix Strategy

## Core Principle

**Fix types at interface definitions, not at usage sites.**

## Quick Start

1. **Read the error** → Find the interface/type definition
2. **Fix at source** → Update interface to match actual usage
3. **Use inference** → Let TypeScript infer types when possible
4. **Avoid assertions** → Don't use `as Type` or `!` - fix the underlying type

## Common Problems & Solutions

### Property Doesn't Exist

**Fix at interface definition:**

```typescript
// ❌ Error: Property 'name' doesn't exist
interface Channel {
  id: string
}
const channel: Channel = { id: '1', name: 'General' } // Error

// ✅ Fix: Add property to interface
interface Channel {
  id: string
  name: string  // Added missing property
}
```

### DeepSignal Type Mismatches

**Direct property access works without casts** - DeepSignal proxies unwrap automatically:

```typescript
// ✅ Works: Direct access (no cast needed)
const unread = $s.chat.channels[channelId].unread
$s.chat.channels[channelId].unread += 1

// ❌ Only cast when TypeScript errors occur (Record assignments)
$s.chat.channels[key] = { id: key, messages: [] } // Error

// ✅ Fix: Assert Record type
const channels = $s.chat.channels as PyriteState['chat']['channels']
channels[key] = { id: key, messages: [] }

// ✅ Utility functions: Use RevertDeepSignal
import type {RevertDeepSignal} from 'deepsignal'
const channels = Object.values($s.chat.channels as RevertDeepSignal<typeof $s.chat.channels>)
```

### Unknown Types

**Add type annotation at source or use assertion:**

```typescript
// ❌ Error: unknown type
const user = $s.users.find(u => u.id === id)
user.mic = true  // Error

// ✅ Fix: Type the array or assert
const user = $s.users.find(u => u.id === id) as User
```

### Return Types

**Prefer inference - only add explicit types when required:**

```typescript
// ❌ Unnecessary: TypeScript infers void
export function _events(): void {
    events.on('disconnected', () => {})
}

// ✅ Better: Let TypeScript infer
export function _events() {
    events.on('disconnected', () => {})
}

// ✅ Add explicit type only when:
// - Lint rule requires it AND TypeScript can't infer
// - Adds clarity for complex types
// - Part of public API interface
export function currentGroup(): typeof $s.sfu.channel {
    return { ...$s.sfu.channel, ...channelData }
}
```

### Unused Variables

**Catch blocks:** Use `catch {}` when error is unused

```typescript
// ❌ Wrong
try {
    await operation()
} catch (error) {  // Unused
    handleError()
}

// ✅ Correct
try {
    await operation()
} catch {
    handleError()
}
```

**Other variables:** Remove entirely, don't prefix with `_`

```typescript
// ❌ Wrong
function process(data: Data) {
    const _unused = data.oldField
    return data.newField
}

// ✅ Correct
function process(data: Data) {
    return data.newField
}
```

## Anti-Patterns

❌ **Don't:**
- Add `if (x !== undefined)` checks just for TypeScript
- Use `as any` to silence errors
- Add type assertions everywhere instead of fixing interfaces
- Prefix unused variables with `_` - remove them or use `catch {}`
- Add explicit return types when TypeScript can infer

✅ **Do:**
- Fix interface definitions to match actual usage
- Use type assertions only when TypeScript errors occur
- Try direct property access first (DeepSignal unwraps automatically)
- Let TypeScript infer types when possible
- Use `catch {}` for unused catch variables
- Remove unused variables entirely

## Quick Reference

| Error | Solution |
|-------|----------|
| `Property 'X' doesn't exist` | Add property to interface definition |
| `Type 'X' is not assignable to type 'Y'` | Update interface to match usage |
| DeepSignal Record assignment error | `const x = $s.record as State['record']` |
| `Object.values()` on DeepSignal | `Object.values(x as RevertDeepSignal<typeof x>)` |
| `unknown` type | Add type annotation or assertion |
| Unused catch variable | Use `catch {}` instead of `catch (_error)` |
| Unused variable | Remove entirely, don't prefix with `_` |
