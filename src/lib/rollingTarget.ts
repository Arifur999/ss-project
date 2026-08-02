// utils/rollingTarget.ts

export interface DailySalesMap {
  [dayNumber: number]: number; // Key: Day (1-31), Value: Sales Amount
}

export interface RollingTargetInput {
  monthlyTarget: number;
  year: number;
  month: number; // 1-indexed (1 = January, 8 = August)
  dailySalesMap: DailySalesMap;
  asOfDate?: Date; // Optional, defaults to current day of the month
}

export interface DailyTargetCalculation {
  day: number;
  dateString: string; // Format: YYYY-MM-DD
  targetAmount: number;
  actualSales: number;
  cumulativeSalesToDate: number;
  remainingTargetAfterToday: number;
  isPast: boolean;
  isCurrent: boolean;
  isFuture: boolean;
}

export interface MonthlyTargetSummary {
  monthlyTarget: number;
  totalSalesToDate: number;
  remainingMonthlyTarget: number;
  totalDaysInMonth: number;
  daysRemaining: number;
  dailyCalculations: DailyTargetCalculation[];
}

/**
 * Helper to get exact total days in a specific month & year (handles leap years)
 */
export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/**
 * Calculates Rolling Dynamic Target Allocation
 */
export function calculateRollingDailyTargets(input: RollingTargetInput): MonthlyTargetSummary {
  const { monthlyTarget, year, month, dailySalesMap, asOfDate = new Date() } = input;

  const totalDaysInMonth = getDaysInMonth(year, month);
  const currentDayNumber = asOfDate.getMonth() + 1 === month && asOfDate.getFullYear() === year
    ? asOfDate.getDate()
    : 1;

  let remainingTarget = monthlyTarget;
  let runningCumulativeSales = 0;
  const dailyCalculations: DailyTargetCalculation[] = [];

  for (let day = 1; day <= totalDaysInMonth; day++) {
    const remainingDays = totalDaysInMonth - day + 1;

    // Formula: Remaining Target / Remaining Days
    let currentDayTarget = remainingDays > 0 ? remainingTarget / remainingDays : 0;

    // Ensure target never drops below zero
    if (currentDayTarget < 0) currentDayTarget = 0;

    const todaysSales = dailySalesMap[day] || 0;
    runningCumulativeSales += todaysSales;

    // Deduct today's actual sales from remaining target for the next iteration
    remainingTarget -= todaysSales;
    if (remainingTarget < 0) remainingTarget = 0;

    // Date formatting YYYY-MM-DD
    const formattedMonth = String(month).padStart(2, '0');
    const formattedDay = String(day).padStart(2, '0');
    const dateString = `${year}-${formattedMonth}-${formattedDay}`;

    dailyCalculations.push({
      day,
      dateString,
      targetAmount: Number(currentDayTarget.toFixed(2)),
      actualSales: Number(todaysSales.toFixed(2)),
      cumulativeSalesToDate: Number(runningCumulativeSales.toFixed(2)),
      remainingTargetAfterToday: Number(remainingTarget.toFixed(2)),
      isPast: day < currentDayNumber,
      isCurrent: day === currentDayNumber,
      isFuture: day > currentDayNumber,
    });
  }

  const daysRemaining = Math.max(0, totalDaysInMonth - currentDayNumber + 1);

  return {
    monthlyTarget,
    totalSalesToDate: Number(runningCumulativeSales.toFixed(2)),
    remainingMonthlyTarget: Number(remainingTarget.toFixed(2)),
    totalDaysInMonth,
    daysRemaining,
    dailyCalculations,
  };
}
