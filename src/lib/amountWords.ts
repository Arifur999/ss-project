// A taka figure spelled out, the way a printed bill in Bangladesh reads it.
//
// Grouped in crore / lakh / thousand rather than million / billion, because
// that is how the number is said here and how anyone checking the figure
// against the digits above it will read it.
//
// Lifted out of Sales.tsx when the Purchase voucher needed the same line. Two
// copies of a number-to-words table drift the first time one of them is fixed,
// and the fix is always in the half nobody is looking at.

const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen',
]

const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

function belowHundred(n: number) {
  if (n < 20) return ONES[n]
  return [TENS[Math.floor(n / 10)], ONES[n % 10]].filter(Boolean).join(' ')
}

function belowThousand(n: number) {
  const hundred = Math.floor(n / 100)
  const rest = n % 100
  return [
    hundred ? `${ONES[hundred]} Hundred` : '',
    rest ? belowHundred(rest) : '',
  ].filter(Boolean).join(' ')
}

/** A whole number in words. Crore / lakh / thousand grouping. */
export function numberToWords(value: number): string {
  if (value === 0) return 'Zero'

  return [
    { label: 'Crore', amount: Math.floor(value / 10000000) },
    { label: 'Lakh', amount: Math.floor((value % 10000000) / 100000) },
    { label: 'Thousand', amount: Math.floor((value % 100000) / 1000) },
    { label: '', amount: value % 1000 },
  ]
    .filter(part => part.amount > 0)
    .map(part => `${belowThousand(part.amount)} ${part.label}`.trim())
    .join(' ')
}

/**
 * The "Amount In Words" line on a printed bill.
 *
 * Negatives are clamped to zero: a bill total cannot be negative, and spelling
 * out a minus sign on a document somebody signs would raise more questions than
 * it answers.
 */
export function amountInWords(amount: number): string {
  const normalizedAmount = Math.max(Number(amount || 0), 0)
  const taka = Math.floor(normalizedAmount)
  const paisa = Math.round((normalizedAmount - taka) * 100)
  const paisaText = paisa ? ` and ${numberToWords(paisa)} Paisa` : ''
  return `${numberToWords(taka)} Taka${paisaText} Only`
}
