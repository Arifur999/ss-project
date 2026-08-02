/**
 * Rolling Equal Daily Target Engine
 *
 * Rule:
 * 1. Monthly target remaining days-এর মধ্যে সমানভাবে ভাগ হবে।
 * 2. Completed day-এর actual sales remaining target থেকে বাদ যাবে।
 * 3. সব future day-এর target একই থাকবে।
 * 4. Zero-sale day completed হলে completedThroughDay update করতে হবে।
 */

export interface DailySalesMap {
  [day: number]: number;
}

export interface RollingTargetConfig {
  monthlyTarget: number;
  year: number;
  month: number; // 1 = January, 12 = December

  /**
   * প্রতিদিনের actual sales।
   *
   * Example:
   * {
   *   1: 32000,
   *   2: 10000,
   *   3: 0
   * }
   */
  dailySalesMap: DailySalesMap;

  /**
   * সর্বশেষ completed day।
   *
   * কোনো দিন sales 0 হলেও দিনটি শেষ হলে এখানে day number দিতে হবে।
   *
   * Example:
   * Day 1 শেষ হলে: 1
   * Day 2 শেষ হলে: 2
   * মাস এখনো শুরু না হলে: 0
   */
  completedThroughDay: number;
}

export interface DailyTargetRecord {
  day: number;
  dateString: string;
  status: "completed" | "future";
  openingTarget: number;
  actualSales: number;
  remainingTargetAfterSales: number;
  futureDailyTarget: number;
}

export interface RollingTargetSummary {
  monthlyTarget: number;
  totalDaysInMonth: number;
  completedThroughDay: number;
  totalSales: number;
  remainingTarget: number;
  remainingDays: number;
  currentDailyTarget: number;
  dailyRecords: DailyTargetRecord[];
}

function roundMoney(value: number): number {
  return Number(value.toFixed(2));
}

export function getDaysInMonth(
  year: number,
  month: number
): number {
  return new Date(year, month, 0).getDate();
}

export function calculateRollingTargets(
  config: RollingTargetConfig
): RollingTargetSummary {
  const {
    monthlyTarget,
    year,
    month,
    dailySalesMap,
  } = config;

  const totalDaysInMonth = getDaysInMonth(year, month);

  const completedThroughDay = Math.min(
    totalDaysInMonth,
    Math.max(0, config.completedThroughDay)
  );

  let remainingTarget = Math.max(0, monthlyTarget);
  let totalSales = 0;

  const dailyRecords: DailyTargetRecord[] = [];

  /*
   * শুধু completed দিনগুলোর হিসাব করা হচ্ছে।
   * প্রতিটি completed day-এর শুরুতে তখনকার remaining target
   * তখনকার remaining days দিয়ে ভাগ হবে।
   */
  for (let day = 1; day <= completedThroughDay; day++) {
    const remainingDaysIncludingToday =
      totalDaysInMonth - day + 1;

    const openingTarget =
      remainingDaysIncludingToday > 0
        ? remainingTarget / remainingDaysIncludingToday
        : 0;

    const actualSales = Math.max(
      0,
      Number(dailySalesMap[day] ?? 0)
    );

    totalSales += actualSales;

    remainingTarget = Math.max(
      0,
      remainingTarget - actualSales
    );

    const futureDays = totalDaysInMonth - day;

    const futureDailyTarget =
      futureDays > 0
        ? remainingTarget / futureDays
        : 0;

    dailyRecords.push({
      day,
      dateString: createDateString(year, month, day),
      status: "completed",
      openingTarget: roundMoney(openingTarget),
      actualSales: roundMoney(actualSales),
      remainingTargetAfterSales:
        roundMoney(remainingTarget),
      futureDailyTarget:
        roundMoney(futureDailyTarget),
    });
  }

  /*
   * সব future দিনের জন্য একবার target calculate করা হচ্ছে।
   * Loop-এর ভিতরে denominator কমানো হচ্ছে না।
   *
   * এটাই নিশ্চিত করবে যে সব future column একই হবে।
   */
  const remainingDays =
    totalDaysInMonth - completedThroughDay;

  const currentDailyTarget =
    remainingDays > 0
      ? remainingTarget / remainingDays
      : 0;

  for (
    let day = completedThroughDay + 1;
    day <= totalDaysInMonth;
    day++
  ) {
    dailyRecords.push({
      day,
      dateString: createDateString(year, month, day),
      status: "future",
      openingTarget: roundMoney(currentDailyTarget),
      actualSales: 0,
      remainingTargetAfterSales:
        roundMoney(remainingTarget),
      futureDailyTarget:
        roundMoney(currentDailyTarget),
    });
  }

  return {
    monthlyTarget: roundMoney(monthlyTarget),
    totalDaysInMonth,
    completedThroughDay,
    totalSales: roundMoney(totalSales),
    remainingTarget: roundMoney(remainingTarget),
    remainingDays,
    currentDailyTarget:
      roundMoney(currentDailyTarget),
    dailyRecords,
  };
}

function createDateString(
  year: number,
  month: number,
  day: number
): string {
  return [
    year,
    String(month).padStart(2, "0"),
    String(day).padStart(2, "0"),
  ].join("-");
}
