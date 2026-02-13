// eslint-disable-next-line no-extend-native, func-names
declare global {
    interface Number {
        decimals(decimals: number): number
    }
}

// eslint-disable-next-line no-extend-native
(Number.prototype as unknown as {decimals: (decimals: number) => number}).decimals = function decimals(decimals: number): number {
    return Number(Math.round(Number(this + 'e' + decimals)) + 'e-' + decimals)
}




