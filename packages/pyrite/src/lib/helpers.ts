declare global {
    interface Number {
        decimals(decimals: number): number
    }
}

Number.prototype.decimals = function(decimals: number): number {
    return Number(Math.round(Number(this + 'e' + decimals)) + 'e-' + decimals)
}

export {}
