Number.prototype.decimals = function(decimals) {
n Number(Math.round(this+'e'+decimals)+'e-'+decimals)
}
