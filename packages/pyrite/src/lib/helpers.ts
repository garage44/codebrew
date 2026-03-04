// Side-effect import to make this file a module (required for declare global)
import 'zod'

// eslint-disable-next-line no-extend-native, func-names
declare global {
    // eslint-disable-next-line no-redeclare
    interface Number {
        decimals(decimals: number): number
    }
}

// eslint-disable-next-line no-extend-native, prefer-template
;(Number.prototype as unknown as {decimals: (digits: number) => number}).decimals = function decimals(digits: number): number {
    return Number(`${Math.round(Number(`${this}e${digits}`))}e-${digits}`)
}
