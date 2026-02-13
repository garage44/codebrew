#!/bin/bash
# Custom lint-staged replacement that avoids TTY dependencies
# This script runs linters on staged files without using lint-staged's spinner/TTY features

set -e

# Get staged files
STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACM)

if [ -z "$STAGED_FILES" ]; then
    echo "No staged files to lint"
    exit 0
fi

# Filter files by extension
TS_FILES=$(echo "$STAGED_FILES" | grep -E '\.(ts|tsx)$' || true)
CSS_FILES=$(echo "$STAGED_FILES" | grep -E '\.css$' || true)

HAS_ERRORS=0

# Run oxlint on TypeScript files
if [ -n "$TS_FILES" ]; then
    echo "Running oxlint on staged TypeScript files..."
    echo "$TS_FILES" | xargs -r bunx oxlint --fix || HAS_ERRORS=1
fi

# Run eslint on TypeScript files
if [ -n "$TS_FILES" ]; then
    echo "Running eslint on staged TypeScript files..."
    echo "$TS_FILES" | xargs -r bunx eslint --fix --no-color || HAS_ERRORS=1
fi

# Run stylelint on CSS files
if [ -n "$CSS_FILES" ]; then
    echo "Running stylelint on staged CSS files..."
    echo "$CSS_FILES" | xargs -r bunx stylelint --fix --no-color || HAS_ERRORS=1
fi

# Re-stage any files that were auto-fixed
if [ -n "$TS_FILES$CSS_FILES" ]; then
    echo "$TS_FILES" "$CSS_FILES" | xargs -r git add 2>/dev/null || true
fi

if [ $HAS_ERRORS -eq 1 ]; then
    echo "Linting errors found. Please fix them before committing."
    exit 1
fi

echo "All staged files passed linting"
exit 0
