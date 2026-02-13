---
name: typescript-typing
description: Fix TypeScript type errors by updating interface definitions, not usage sites. Handles DeepSignal state typing patterns. Use when fixing TypeScript errors from lint:ts-types or when type errors are reported.
---

# TypeScript Typing Fix Strategy

## Core Principle

**Fix types at interface definitions, not at usage sites.**

## Workflow

1. **Read the error**: Understand what property/type is missing
2. **Find the interface**: Locate the type definition causing the issue
3. **Fix at source**: Update the interface/type to match actual usage
4. **Use inference**: Let TypeScript infer types when possible
5. **Avoid assertions**: Don't use `as Type` or `!` - fix the underlying type

## DeepSignal State Typing

DeepSignal wraps objects with proxies that unwrap Signals at runtime. **Direct property access (`state.prop`) works without casts** - the proxy automatically unwraps signals. TypeScript's type system may see nested Record properties as `Signal<T>`, but runtime behavior is `T`.

### When Casts Are NOT Needed

Direct property access and reading work without casts:

```typescript
// ✅ Works: Direct property access
const unread = $s.chat.channels[channelId].unread
$s.chat.channels[channelId].unread += 1
$s.chat.channels[channelKey].messages.push(msg)

// ✅ Works: Nested property access
const avatar = $s.chat.users[userId].avatar
```

### When Casts ARE Needed

**Only cast when TypeScript errors occur**, typically for:

1. **Record assignments** - When assigning new objects to Record properties:
```typescript
// ❌ TypeScript error: expects DeepSignal type
$s.chat.channels[key] = { id: key, messages: [] }

// ✅ Fix: Use DeepSignal type or assert Record type
import type {DeepSignal} from 'deepsignal'
const channels = $s.chat.channels as PyriteState['chat']['channels']
channels[key] = { id: key, messages: [] }
```

2. **Utility functions** - When using Object.values/Object.keys on DeepSignal:
```typescript
// ❌ TypeScript error with Object.values
const channels = Object.values($s.chat.channels)

// ✅ Fix: Use RevertDeepSignal
import type {RevertDeepSignal} from 'deepsignal'
const channels = Object.values($s.chat.channels as RevertDeepSignal<typeof $s.chat.channels>)
```

3. **Type inference failures** - When TypeScript can't infer correctly:
```typescript
// Only cast if TypeScript actually errors
const channel = $s.chat.channels[key] as PyriteState['chat']['channels'][string]
```

## Common Fixes

### Missing Properties

If a property doesn't exist on a type:

1. Find the interface definition
2. Add the missing property with correct type
3. Make it optional (`?`) if it's conditionally present

```typescript
// Before
interface Channel {
  id: string
  messages: Message[]
}

// After (if name is used but missing)
interface Channel {
  id: string
  messages: Message[]
  name?: string  // Added missing property
}
```

### Unknown Types

When TypeScript infers `unknown`:

1. Find where the value originates
2. Add explicit type annotation at the source
3. Or add type guard/assertion at first use

```typescript
// ❌ Wrong: unknown type
const user = $s.users.find(u => u.id === id)
user.mic = true  // Error: Property 'mic' does not exist on type 'unknown'

// ✅ Correct: Type the array or add assertion
const user = $s.users.find(u => u.id === id) as User
user.mic = true
```

### Array/Iterator Errors

When TypeScript can't iterate:

```typescript
// ❌ Wrong: TypeScript sees unknown
for (const item of $s.someArray) { }

// ✅ Correct: Assert array type
const items = $s.someArray as Array<ItemType>
for (const item of items) { }
```

## Return Types and Inference

**Use inference for return types when possible** - TypeScript can infer return types in most cases.

### When Return Types Are Unnecessary

**Don't add explicit return types when TypeScript can infer them:**

```typescript
// ❌ Unnecessary: TypeScript infers void
export function _events(): void {
    events.on('disconnected', () => {
        $s.users = []
    })
}

// ✅ Better: Let TypeScript infer
export function _events() {
    events.on('disconnected', () => {
        $s.users = []
    })
}

// ❌ Unnecessary: TypeScript infers Promise<typeof $s.admin.users[number]>
export async function saveUser(userId: string, data: Record<string, unknown>): Promise<typeof $s.admin.users[number]> {
    const user = await api.post(`/api/users/${userId}`, data)
    return user
}

// ✅ Better: Let TypeScript infer Promise return type
export async function saveUser(userId: string, data: Record<string, unknown>) {
    const user = await api.post(`/api/users/${userId}`, data)
    return user
}
```

**Note:** The `explicit-function-return-type` lint rule may require return types, but prefer inference when the rule allows it. Only add explicit return types when:
- The lint rule explicitly requires it AND TypeScript can't infer
- The return type adds clarity for complex types
- The return type is part of a public API interface

### When Return Types Are Helpful

```typescript
// ✅ Helpful: Complex return type that's clearer when explicit
export function currentGroup(): typeof $s.sfu.channel {
    // Complex logic that returns a merged type
    return { ...$s.sfu.channel, ...channelData }
}

// ✅ Helpful: Public API where return type is part of contract
export interface UserService {
    getUser(id: string): Promise<User>
}
```

## Anti-Patterns

❌ **Don't do:**
- Add `if (x !== undefined)` checks just for TypeScript
- Use `as any` to silence errors
- Add type assertions everywhere instead of fixing interfaces
- Change usage sites when the interface is wrong
- Add explicit `: void` or `Promise<type>` return types when TypeScript can infer them

✅ **Do:**
- Fix interface definitions to match actual usage
- Use type assertions only when TypeScript errors occur (Record assignments, utility functions)
- Try direct property access first - DeepSignal proxies unwrap automatically
- Let TypeScript infer types when possible (especially return types)
- Add properties to interfaces when they're actually used
- Only add explicit return types when they add clarity or are required by lint rules

## Quick Reference

| Error Pattern | Fix Location | Solution |
|--------------|--------------|----------|
| Property doesn't exist | Interface definition | Add property to interface |
| Signal type mismatch (Record assignment) | DeepSignal Record assignment | Assert Record type or use `DeepSignal<T>` |
| Signal type mismatch (property access) | Usually not needed | Try direct access first - DeepSignal unwraps automatically |
| Unknown type | Value source | Add type annotation |
| Can't iterate | Array type | Assert array type or use `RevertDeepSignal` |
| Type not assignable | Interface definition | Update interface to match usage |
