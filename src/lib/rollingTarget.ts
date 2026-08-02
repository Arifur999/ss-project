export interface DailySalesMap {
  [dayNumber: number]: number
}

export interface RollingTargetInput {
  monthlyTarget: number
  year: number
  month: number
  dailySalesMap: DailySalesMap
  asOfDate?: Date
}

export interface DailyTargetCalculation {
  day: number
  dateString: string
  targetAmount: number
  actualSales: number
  cumulativeSalesToDate: number
  remainingTargetAfterToday: number
  isPast: boolean
  isCurrent: boolean
  isFuture: boolean
}

export interface MonthlyTargetSummary {
  monthlyTarget: number
  totalSalesToDate: number
  remainingMonthlyTarget: number
  totalDaysInMonth: number
  daysRemaining: number
  dailyCalculations: DailyTargetCalculation[]
}

function amount(value: any) {
  return Number(value || 0)
}

export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

export function calculateRollingDailyTargets(input: RollingTargetInput): MonthlyTargetSummary {
  const {
    monthlyTarget,
    year,
    month,
    dailySalesMap,
    asOfDate = new Date(),
  } = input

  const totalDaysInMonth = getDaysInMonth(year, month)
  const isCurrentMonth = asOfDate.getFullYear() === year && asOfDate.getMonth() + 1 === month
  const currentDayNumber = isCurrentMonth ? asOfDate.getDate() : 1

  let remainingTarget = amount(monthlyTarget)
  let runningCumulativeSales = 0
  const dailyCalculations: DailyTargetCalculation[] = []

  for (let day = 1; day <= totalDaysInMonth; day += 1) {
    const remainingDays = totalDaysInMonth - day + 1
    const currentDayTarget = remainingDays > 0 ? Number((Math.max(0, remainingTarget) / remainingDays).toFixed(2)) : 0

    const todaysSales = amount(dailySalesMap[day])
    runningCumulativeSales += todaysSales
    remainingTarget = Math.max(0, remainingTarget - todaysSales)

    const formattedMonth = String(month).padStart(2, '0')
    const formattedDay = String(day).padStart(2, '0')
    const dateString = `${year}-${formattedMonth}-${formattedDay}`

    dailyCalculations.push({
      day,
      dateString,
      targetAmount: currentDayTarget,
      actualSales: Number(todaysSales.toFixed(2)),
      cumulativeSalesToDate: Number(runningCumulativeSales.toFixed(2)),
      remainingTargetAfterToday: Number(remainingTarget.toFixed(2)),
      isPast: day < currentDayNumber,
      isCurrent: day === currentDayNumber,
      isFuture: day > currentDayNumber,
    })
  }

  const daysRemaining = Math.max(0, totalDaysInMonth - currentDayNumber + 1)

  return {
    monthlyTarget: amount(monthlyTarget),
    totalSalesToDate: Number(runningCumulativeSales.toFixed(2)),
    remainingMonthlyTarget: Number(remainingTarget.toFixed(2)),
    totalDaysInMonth,
    daysRemaining,
    dailyCalculations,
  }
}
