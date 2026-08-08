// Placeholder rows shown while a table's data is on its way.
//
// The alternative, and what these pages used to do, is render the empty state
// straight away - so every list said "no records" for a second before the rows
// appeared. That reads as "there is nothing here", which is a different and
// much worse message than "this is still loading".
//
// Sized to match the table it stands in, so the header does not jump when the
// real rows arrive.

export default function TableSkeleton({
  rows = 8,
  cols,
  className = '',
}: {
  rows?: number
  cols: number
  className?: string
}) {
  return (
    <>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <tr key={`skeleton-${rowIndex}`} className={`border-b border-slate-50 ${className}`} aria-hidden="true">
          {Array.from({ length: cols }).map((_, colIndex) => (
            <td key={colIndex} className="px-6 py-4">
              <div
                className="h-3 rounded bg-slate-100 animate-pulse"
                // Varying widths read as text rather than a block of grey, and
                // the first column stays narrow so it looks like a row number.
                style={{ width: colIndex === 0 ? '2rem' : `${55 + ((rowIndex * 7 + colIndex * 13) % 40)}%` }}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}

// Same idea outside a table: cards, summary tiles, a chart area.
export function BlockSkeleton({ className = '', height = 'h-24' }: { className?: string; height?: string }) {
  return <div className={`${height} w-full rounded-xl bg-slate-100 animate-pulse ${className}`} aria-hidden="true" />
}
