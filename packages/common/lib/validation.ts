import type {Signal} from '@preact/signals'

import {batch, computed, signal} from '@preact/signals'

interface ValidationRule<Tpl = unknown> {
    message: string
    test: (value: Tpl) => boolean
}

// The ModelRef should handle Signal<T> only now
type ModelRef<Tpl = unknown> = Signal<Tpl>

// Simplified: just modelRef and rules, no nested array
type ValidationEntry = [ModelRef, ...ValidationRule[]]

// Store touched state globally
const touchedModelRefs = new Map<ModelRef, Signal<boolean>>()

// Global function to mark a model as touched
function setTouched(modelRef: ModelRef, touched = true) {
    let touchedSignal = touchedModelRefs.get(modelRef)
    if (!touchedSignal) {
        // Create a new signal if one doesn't exist
        touchedSignal = signal(false)
        touchedModelRefs.set(modelRef, touchedSignal)
    }
    touchedSignal.value = touched
}

// Combine multiple validation rules into one
const and = (...rules: ValidationRule[]): ValidationRule => ({
    // Use first failing message, or empty string if all pass
    message: rules.find((rule) => !rule.test)?.message || '',
    // All rules must pass
    test: (value) => rules.every((rule) => rule.test(value)),
})

// Add a new interface for validation result
interface ValidationResult {
    errors: string[]
    isDirty: boolean
    isTouched: boolean
    isValid: boolean
}

// Add this helper function to aggregate validation errors
function getValidationErrors(validation: Record<string, ValidationResult>) {
    const errors: string[] = []
    for (const [_field, result] of Object.entries(validation)) {
        const fieldErrors = result.errors
        if (fieldErrors.length > 0) {
            errors.push(...fieldErrors)
        }
    }

    return errors.join('<br/>')
}

function createValidator<TValidations extends Record<string, ValidationEntry>>(validations: TValidations) {
    // Track initial values to determine if fields are dirty
    const initialValues = new Map<ModelRef, unknown>()

    // Initialize the initialValues map and touched state
    for (const [, [modelRef]] of Object.entries(validations)) {
        initialValues.set(modelRef, modelRef.value)

        // Ensure each model has a touchedSignal
        if (!touchedModelRefs.has(modelRef)) {
            touchedModelRefs.set(modelRef, signal(false))
        }
    }

    const validationState = computed(() => {
        const result: Record<string, ValidationResult> = {}

        for (const [field, [modelRef, ...rules]] of Object.entries(validations)) {
            const fieldErrors: string[] = []
            const value = modelRef.value

            // Check if the field is dirty by comparing with initial value
            const isDirty = value !== initialValues.get(modelRef)

            // Get the touched state from global map
            const isTouched = touchedModelRefs.get(modelRef)?.value || false

            for (const rule of rules) {
                if (!rule.test(value)) {
                    fieldErrors.push(rule.message)
                }
            }

            result[field] = {
                errors: fieldErrors,
                isDirty,
                isTouched,
                isValid: fieldErrors.length === 0,
            }
        }

        return result
    })

    const isValid = computed(() => Object.values(validationState.value).every((validator) => validator.isValid))
    const errors = computed(() => {
        // Only compute errors when form is invalid
        if (isValid.value) {
            return 'Form is valid...'
        }
        return getValidationErrors(validationState.value)
    })

    // Check if any field is marked as dirty
    const isDirty = computed(() => Object.values(validationState.value).some((validator) => validator.isDirty))

    // Check if any field has been touched
    const isTouched = computed(() => Object.values(validationState.value).some((validator) => validator.isTouched))

    // Function to reset the initial values and mark form as clean
    const resetDirty = () => {
        for (const [, [modelRef]] of Object.entries(validations)) {
            initialValues.set(modelRef, modelRef.value)
        }
    }

    // Function to mark all fields as touched
    const markAllTouched = () => {
        batch(() => {
            for (const [, [modelRef]] of Object.entries(validations)) {
                setTouched(modelRef, true)
            }
        })
    }

    // Function to reset touched state for all fields
    const resetTouched = () => {
        batch(() => {
            for (const [, [modelRef]] of Object.entries(validations)) {
                setTouched(modelRef, false)
            }
        })
    }

    // Function to mark all fields as dirty
    const markAllDirty = () => {
        for (const [, [modelRef]] of Object.entries(validations)) {
            // Set initial values to something different to force dirty state
            initialValues.set(modelRef, Symbol('dirty'))
        }
    }

    return {
        errors,
        isDirty,
        isTouched,
        isValid,
        markAllDirty,
        markAllTouched,
        resetDirty,
        resetTouched,
        validation: validationState,
    }
}

// Validation rule helpers
const required = (message: string): ValidationRule => ({
    message,
    test: (value: unknown) => value !== null && value !== '',
})

const minLength = (length: number, message: string): ValidationRule => ({
    message,
    test: (value: string) => typeof value === 'string' && value.length >= length,
})

const email = (message: string): ValidationRule => ({
    message,
    test: (value: string) => typeof value === 'string' && /^[^@]+@[^@]+\.[^@]+$/.test(value),
})

export {
    and,
    createValidator,
    email,
    getValidationErrors,
    minLength,
    required,
    setTouched,
    type ValidationEntry,
    type ValidationResult,
    type ValidationRule,
    type ModelRef,
}
