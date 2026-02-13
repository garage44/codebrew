// @ts-expect-error - Extending Number prototype for decimals helper
// eslint-disable-next-line func-names, no-extend-native
Number.prototype.decimals = function decimals(decimals: number): number {
    return Number(Math.round(Number(this + 'e' + decimals)) + 'e-' + decimals)
}
