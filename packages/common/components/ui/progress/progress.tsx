import classnames from 'classnames'

interface ProgressProps {
    boundaries: number[]
    iso6391?: string
    loading?: boolean
    percentage: number
}

export function Progress({boundaries, iso6391, loading, percentage}: ProgressProps) {
    if (!iso6391) {
        iso6391 = 'en-gb'
    }
    const intlRange = new Intl.NumberFormat(iso6391)
    const intlPercentage = new Intl.NumberFormat(iso6391, {
        maximumFractionDigits: 1,
        minimumFractionDigits: 1,
        style: 'percent',
    })

    return (
        <div class={classnames('c-progress', {loading})}>
            <div class='track'>
                <div class='bar' style={{width: `${Math.max(percentage * 100, 1)}%`}} />
            </div>
            <div class='info'>
                <span class='percentage'>
                    {loading ? '...' : intlPercentage.format(percentage)}
                </span>
                {boundaries.length > 0 &&
                    <span class='boundaries'>
                        {loading ? '...' : intlRange.formatRange(boundaries[0], boundaries[1])}
                    </span>}
            </div>
        </div>
    )
}
