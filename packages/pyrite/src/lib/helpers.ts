/* eslint-disable no-extend-native */
// @ts-expect-error - Extending Number prototype for decimals helper
Number.prototype.decimals = function(decimals: number) {
    return Number(Math.round(Number(this+'e'+decimals))+'e-'+decimals)
}
/* eslint-enable no-extend-native */
