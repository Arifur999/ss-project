import React, { useState } from 'react'

export interface PolarDatum {
  name: string
  value: number
  color: string
}

// Rounds a max value up to a "nice" grid maximum (2, 5, 10, 20, ...).
function niceMax(max: number): number {
  if (max <= 0) return 5
  const magnitude = Math.pow(10, Math.floor(Math.log10(max)))
  for (const step of [1, 2, 2.5, 5, 10]) {
    const candidate = step * magnitude
    if (candidate >= max) return candidate
  }
  return 10 * magnitude
}

/**
 * A dependency-free SVG polar-area chart (Chart.js "polarArea" look): equal
 * angle wedges whose radius is proportional to the value, drawn over a set of
 * concentric grid rings with a vertical value scale, plus a top legend.
 */
export default function PolarAreaChart({
  data,
  size = 300,
  rings = 5,
}: {
  data: PolarDatum[]
  size?: number
  rings?: number
}) {
  const [hover, setHover] = useState<number | null>(null)

  const cx = size / 2
  const cy = size / 2
  const radiusMax = size / 2 - 22
  const maxValue = Math.max(1, ...data.map(d => d.value))
  const scaleMax = niceMax(maxValue)
  const count = data.length || 1
  const sliceAngle = (2 * Math.PI) / count
  const startAngle = -Math.PI / 2 // first slice starts at the top, sweeps clockwise

  const point = (angle: number, radius: number): [number, number] => [
    cx + radius * Math.cos(angle),
    cy + radius * Math.sin(angle),
  ]

  const wedgePath = (index: number, radius: number): string => {
    const a0 = startAngle + index * sliceAngle
    const a1 = a0 + sliceAngle
    const [x0, y0] = point(a0, radius)
    const [x1, y1] = point(a1, radius)
    const largeArc = sliceAngle > Math.PI ? 1 : 0
    return `M ${cx} ${cy} L ${x0} ${y0} A ${radius} ${radius} 0 ${largeArc} 1 ${x1} ${y1} Z`
  }

  return (
    <div className="flex flex-col items-center">
      <div className="mb-3 flex flex-wrap justify-center gap-x-4 gap-y-1.5">
        {data.map((d, index) => (
          <button
            key={d.name}
            type="button"
            onMouseEnter={() => setHover(index)}
            onMouseLeave={() => setHover(null)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600"
          >
            <span className="h-2.5 w-4 rounded-sm" style={{ backgroundColor: d.color }} />
            {d.name}
          </button>
        ))}
      </div>

      <svg viewBox={`0 0 ${size} ${size}`} width="100%" style={{ maxWidth: size }} role="img" aria-label="Polar area chart">
        {/* concentric grid rings */}
        {Array.from({ length: rings }, (_, r) => {
          const radius = (radiusMax * (r + 1)) / rings
          return <circle key={`ring-${r}`} cx={cx} cy={cy} r={radius} fill="none" stroke="#e5e7eb" strokeWidth={1} />
        })}
        {/* vertical value scale */}
        {Array.from({ length: rings }, (_, r) => {
          const radius = (radiusMax * (r + 1)) / rings
          const value = Math.round((scaleMax * (r + 1)) / rings)
          return (
            <text key={`tick-${r}`} x={cx + 4} y={cy - radius + 3} fontSize={9} fill="#94a3b8">
              {value}
            </text>
          )
        })}
        {/* value wedges */}
        {data.map((d, index) => {
          const radius = (Math.max(0, d.value) / scaleMax) * radiusMax
          const dimmed = hover !== null && hover !== index
          if (radius <= 0) return null
          return (
            <path
              key={d.name}
              d={wedgePath(index, radius)}
              fill={d.color}
              fillOpacity={dimmed ? 0.3 : 0.72}
              stroke="#ffffff"
              strokeWidth={1.5}
              onMouseEnter={() => setHover(index)}
              onMouseLeave={() => setHover(null)}
              style={{ transition: 'fill-opacity 0.15s' }}
            >
              <title>{d.name}: {d.value}</title>
            </path>
          )
        })}
      </svg>
    </div>
  )
}
