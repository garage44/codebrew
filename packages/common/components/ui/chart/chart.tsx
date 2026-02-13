import {useMemo} from 'preact/hooks'

interface ChartProps {
    data: number[]
    name: string
}

export const Chart = ({data, name}: ChartProps) => {
    const config = {
        axis: {
            fontSize: 6,
            y: {
                steps: 5,
            },
        },
        padding: {
            x: 30,
            y: 12,
        },
        view: {
            height: 75,
            width: 500,
        },
    }

    const yRange = useMemo(() => {
        let yHigh: number | undefined, yLow: number | undefined
        for (const point of data) {
            if (!yLow || point < yLow) {
                yLow = point
            }
            if (!yHigh || point > yHigh) {
                yHigh = point
            }
        }
        return {high: yHigh || 0, low: yLow || 0, range: (yHigh || 0) - (yLow || 0)}
    }, [data])

    const axisValue = (value: number) => {
        if (value < 10) {
            return value.toFixed(2)
        }
        return Math.ceil(value)
    }

    const axisSteps = useMemo(() => {
        const yStep = config.view.height / config.axis.y.steps + config.axis.fontSize / 4
        const yValueStep = (yRange.high - yRange.low) / config.axis.y.steps

        let yValueSteps = [axisValue(yRange.low)]
        for (let i = 1; i <= config.axis.y.steps - 2; i++) {
            yValueSteps.push(axisValue(yValueStep * i))
        }
        yValueSteps.push(axisValue(yRange.high))
        // Actual values are mirrored.
        yValueSteps = yValueSteps.toReversed()

        const steps = []
        const axisBase = config.padding.y - config.axis.fontSize / 2
        for (let i = 0; i <= config.axis.y.steps - 1; i++) {
            steps.push({label: yValueSteps[i], position: axisBase + yStep * i})
        }

        return steps
    }, [yRange, config])

    const points = useMemo(() => {
        let pointString = ''
        const xStep = config.view.width / data.length

        for (const [index, point] of data.entries()) {
            let y
            if (yRange.range > 0) {
                y = ((point - yRange.low) / yRange.range) * config.view.height
            } else {
                y = 0
            }
            pointString += `${xStep * index + config.padding.x},${y} `
        }
        return pointString
    }, [data, yRange, config])

    return (
        <div class='c-chart'>
            <svg class='chart' viewBox={`0 0 ${config.view.width + config.padding.x} ${config.view.height + config.padding.y}`}>
                <rect class='chart-area' height={config.view.height} width={config.view.width} x={config.padding.x} />
                <text
                    class='name'
                    text-anchor='end'
                    x={config.view.width + config.padding.x - 2}
                    y={config.view.height + config.padding.y - 2}
                >
                    {name}
                </text>

                {axisSteps.map((axisStep, i) => (
                    <text
                        key={i}
                        class='axis-y'
                        style={`font-size: ${config.axis.fontSize}px;`}
                        text-anchor='end'
                        x={config.padding.x - 4}
                        y={axisStep.position}
                    >
                        {axisStep.label}
                    </text>
                ))}

                <polyline class='line' points={points} stroke-width='1' />
            </svg>
        </div>
    )
}
