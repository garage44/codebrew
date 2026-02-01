# ADR-013: Theme Switching System and Reusable ThemeToggle Component

---
**Metadata:**
- **ID**: ADR-013
- **Status**: Accepted
- **Date**: 2025-10-15
- **Tags**: [frontend, design-system, ux, accessibility, components]
- **Impact Areas**: [expressio, styleguide, common]
- **Decision Type**: architecture_pattern
- **Related Decisions**: [ADR-011, ADR-012, ADR-014]
- **Supersedes**: []
- **Superseded By**: [ADR-014]
---

## Context

### Problem Statement

The Garage44 applications lacked a unified theme switching capability:

1. **No Theme Toggle**: Expressio and Styleguide had no way for users to switch between light and dark themes
2. **Duplicate Implementation**: Styleguide had inline theme switching logic that wasn't reusable
3. **Color Inconsistency**: The common design system's dark theme didn't match Expressio's established professional aesthetic
4. **Semantic Confusion**: Expressio used `--info-*` tokens instead of semantic `--primary-*` tokens, obscuring design intent
5. **Accessibility Gap**: No light theme option for users who prefer bright interfaces

### Design Requirements

- Professional, easy-on-the-eyes aesthetics
- Excellent contrast in both themes (WCAG AA compliance)
- Theme preference persistence via localStorage
- Reusable component across all applications
- Expressio's current dark aesthetic should define the default dark theme
- Light theme should be properly inverted with good readability

## Decision

### 1. Create Reusable ThemeToggle Component

Implemented a shared `ThemeToggle` component in the common package:

```tsx
// packages/common/components/ui/theme-toggle/theme-toggle.tsx
import {Button} from '../button/button'
import {store} from '@garage44/common/app'

export const ThemeToggle = () => {
    const {theme} = store.state

    return (
        <Button
            icon={theme === 'dark' ? 'sun' : 'moon'}
            onClick={() => {
                store.state.theme = theme === 'dark' ? 'light' : 'dark'
            }}
            variant="toggle"
        />
    )
}
```

**Key Decisions:**
- No translations (simple icon-based toggle)
- Uses existing common store state (theme already exists in `persistentState`)
- Leverages existing Button component with toggle variant
- Sun icon for dark mode (suggests switching to light), moon for light mode

### 2. Refine Color Palette for Professional Aesthetics

Updated `/packages/common/css/_variables.css` with darker, more professional values:

**Dark Theme (Default):**
```css
/* Darker lightness scale */
--l-0: 0.12;   /* Was 0.14 */
--l-1: 0.16;   /* Was 0.18 */
--l-2: 0.22;   /* Was 0.26 */

/* Unified hue for cohesive look */
--h-surface: 230;  /* Was 240 - now matches primary */
--h-primary: 230;  /* Brand blue-grey */

/* Subtle saturation for professionalism */
--c-0: 0.008;  /* Was 0.010 */
--c-1: 0.012;  /* Was 0.015 */
```

**Light Theme:**
```css
:root.light {
    /* Inverted lightness scale */
    --l-0: 0.98;   /* Was 0.95 - brighter backgrounds */
    --l-1: 0.96;   /* Was 0.85 - primary backgrounds */
    --l-8: 0.12;   /* Was 0.14 - darker text */
}
```

**Rationale:**
- Dark theme matches Expressio's existing professional aesthetic
- Unified hue (230°) creates cohesive blue-grey palette
- Subtle saturation prevents oversaturation while maintaining visual interest
- Light theme provides proper contrast inversion

**Known Issue:** Light theme may appear too "cold" (blue-tinted). Future refinement should consider:
- Slight hue shift toward neutral (240°) for light theme
- Reduced chroma in light theme for warmer appearance
- Separate `--h-surface-light` variable for independent hue control

### 3. Standardize Semantic Token Usage

Replaced `--info-*` tokens with `--primary-*` throughout Expressio:

**Files Updated:**
- `/packages/expressio/src/css/app.css`
- `/packages/expressio/src/components/main/main.css`

**Rationale:**
- `--primary-*` clearly indicates brand/primary color usage
- `--info-*` is a legacy alias that obscures semantic meaning
- Consistent naming improves code readability and maintainability

### 4. Integration Points

**Expressio:**
```tsx
<div className="actions">
    <ThemeToggle />
    <Icon name="logout" ... />
</div>
```

**Styleguide:**
```tsx
<div class="styleguide__header">
    <h1 class="styleguide__title">Garage44 Common</h1>
    <ThemeToggle />
</div>
```

## Consequences

### Positive

**User Experience:**
- Users can choose preferred theme based on environment/preference
- Theme preference persists across sessions
- Professional aesthetics in both themes
- Improved accessibility for users with different visual preferences

**Code Quality:**
- Single reusable component eliminates duplication
- Semantic token names improve code clarity
- Unified color system across all applications
- Theme changes propagate automatically from common package

**Design System Maturity:**
- Establishes pattern for future theme variants
- Demonstrates proper use of design tokens
- Provides foundation for advanced theming (per-workspace, custom accent colors)

### Negative

**Visual Inconsistencies:**
- Light theme has "cold" (blue-tinted) appearance due to unified 230° hue
- May require per-theme hue adjustments for optimal appearance
- Some UI elements may need additional contrast tuning in light theme

**Migration Effort:**
- Expressio required CSS token replacement (`--info-*` → `--primary-*`)
- Future applications must adopt semantic token conventions
- Existing applications need gradual migration to use ThemeToggle

**Limited Customization:**
- Currently only supports two themes (light/dark)
- No per-user theme preferences (all users share localStorage setting)
- No system theme detection (prefers-color-scheme)

## Implementation Notes

### Files Created (1)
- `/packages/common/components/ui/theme-toggle/theme-toggle.tsx`

### Files Modified (5)
- `/packages/common/components.ts` - Export ThemeToggle
- `/packages/common/css/_variables.css` - Refined color palette
- `/packages/expressio/src/css/app.css` - Semantic tokens
- `/packages/expressio/src/components/main/main.css` - Semantic tokens + spacing
- `/packages/expressio/src/components/main/main.tsx` - Add ThemeToggle
- `/packages/styleguide/src/components/navigation.tsx` - Use ThemeToggle

### Theme Mechanism

The theme system relies on existing common infrastructure:

1. **State Management**: Theme stored in `common/lib/state.ts` as `theme: 'dark' | 'light'`
2. **Persistence**: Automatically saved to localStorage via common Store class
3. **DOM Application**: `common/lib/env.ts` watches theme changes and updates `document.documentElement.classList`
4. **CSS Activation**: `:root.light` selector applies light theme overrides

### Color Palette Summary

| Token | Dark (L) | Light (L) | Usage |
|-------|----------|-----------|-------|
| `--primary-0` | 0.12 | 0.98 | Deep backgrounds |
| `--primary-1` | 0.16 | 0.96 | Primary backgrounds |
| `--primary-2` | 0.22 | 0.92 | Raised surfaces |
| `--primary-6` | 0.72 | 0.32 | Muted text |
| `--primary-8` | 0.94 | 0.12 | Bright text/elements |

### Future Improvements

**Light Theme Refinement (Priority: High):**
- Consider separate hue for light theme (240° for warmer neutrals)
- Reduce chroma in light theme for less blue-tinted appearance
- Test contrast ratios with adjusted values
- Possible approach:
  ```css
  :root.light {
      --h-surface: 240;  /* Warmer neutral */
      --c-0: 0.005;      /* Less chromatic */
  }
  ```

**Feature Enhancements:**
- System theme detection via `prefers-color-scheme` media query
- Per-user theme preferences stored on backend
- Theme preview without applying (settings UI)
- High contrast variants for accessibility

**Advanced Theming:**
- Per-workspace theme overrides
- Custom accent color selection
- Community theme marketplace
- Seasonal/time-based theme switching

## Related Decisions

- **ADR-012**: Design System Consolidation - Established common package as shared design foundation
- **ADR-011**: Modern CSS Migration - Introduced OKLCH color system and CSS custom properties
- **ADR-001**: Monorepo Structure - Defines common package as shared utilities location

## Success Criteria

- ✅ ThemeToggle component used in Expressio and Styleguide
- ✅ Theme preference persists across page reloads
- ✅ Dark theme maintains Expressio's professional aesthetic
- ✅ Light theme provides readable contrast (though needs warmth adjustment)
- ✅ Semantic token naming throughout Expressio
- ⚠️ Light theme color temperature needs refinement

## Conclusion

This decision establishes a foundational theme system that enables user choice while maintaining professional aesthetics. The reusable ThemeToggle component eliminates duplication and provides a consistent UI pattern across applications.

While the implementation is functional and the dark theme meets aesthetic goals, the light theme's "cold" appearance indicates need for refinement. Future work should focus on adjusting the light theme's hue and chroma values to create a warmer, more neutral appearance while maintaining the excellent contrast.

The semantic token migration improves code clarity and positions Expressio to benefit from future design system enhancements. This work also demonstrates proper use of the common package for shared UI components, setting a pattern for future component development.
